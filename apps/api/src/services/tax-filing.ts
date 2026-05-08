import type { Prisma, TaxFiling, VendorType } from '@prisma/client';
import { D } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { aggregatePP30, type PP30Aggregate } from '../lib/tax/pp30-aggregate';
import { aggregatePND } from '../lib/tax/pnd-aggregate';
import { logAuditEvent } from './audit-log';
import {
  createDraft,
  postInTx,
  type CreateJELineInput,
  type JournalEntryWithLines,
} from './journal-entry';
import { nextDocNo, type DocPrefix } from './numbering';

type Tx = Prisma.TransactionClient;

// Account codes for the PP30 closing JE (spec 02 §4.7, spec 03 §4.4).
const VAT_PAYABLE_ACCOUNT = '21110';
const VAT_RECEIVABLE_ACCOUNT = '14010';
const VAT_REFUNDABLE_ACCOUNT = '14020';
const TAX_PAYMENT_BANK_ACCOUNT = '11020';
// Account code for the PND closing JE (spec 02 §4.8, spec 03 §5.6).
const WHT_PAYABLE_ACCOUNT = '21120';

export type PndType = 'PND3' | 'PND53';

function vendorTypeForPnd(type: PndType): VendorType {
  return type === 'PND3' ? 'INDIVIDUAL' : 'JURISTIC';
}
// Tax filings are company-wide. Pin the closing JE to TL (Thonglor / HQ) so
// every line carries a concrete branch_code as required by spec §7.
const TAX_FILING_BRANCH_CODE = 'TL';

// `tax_filings.vat_payable` carries a non-negative CHECK constraint and
// represents the amount owed to the Revenue Department. When inputs exceed
// outputs (refund / carry-forward case), the payable is 0 and the refund is
// derived later from the snapshotted output_vat / input_vat. Clamp here so
// the snapshot can persist regardless of refund state.
function clampedPayable(aggregate: PP30Aggregate): string {
  const payable = D(aggregate.vat_payable);
  return payable.lt(0) ? '0.00' : payable.toFixed(2);
}

/**
 * Create a DRAFT ภพ.30 (PP30) filing for `period_code` (spec 04 §5.2, T-5.2).
 *
 * Allocates a sequential `filing_no` via `nextDocNo('PP30', ...)` and
 * snapshots the current aggregate (output_vat, input_vat, vat_payable). The
 * snapshot is informational — DRAFT filings do NOT lock VatRegister rows, so
 * subsequent `aggregatePP30` calls still see those rows (the aggregator
 * includes rows linked to a DRAFT). This lets the user re-flag non-claimable
 * inputs and re-finalize against the latest data.
 *
 * Locking happens on `finalizePP30`.
 */
export async function createDraftPP30(
  period_code: string,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const aggregate = await aggregatePP30(period_code, tx);

    const year = parseInt(period_code.slice(0, 4), 10);
    const filing_no = await nextDocNo(tx, 'PP30', year, 'tax_filings', 'filing_no');

    const filing = await tx.taxFiling.create({
      data: {
        filing_no,
        filing_type: 'PP30',
        period_code,
        status: 'DRAFT',
        output_vat: aggregate.output_vat,
        input_vat: aggregate.input_vat,
        vat_payable: clampedPayable(aggregate),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'TaxFiling',
      entity_id: filing.id,
      after: filing,
    });

    return filing;
  });
}

async function loadPP30(tx: Tx, filing_id: string): Promise<TaxFiling> {
  const filing = await tx.taxFiling.findUnique({ where: { id: filing_id } });
  if (!filing) {
    throw new BusinessRuleError('NOT_FOUND', { filing_id });
  }
  if (filing.filing_type !== 'PP30') {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'not_pp30',
      filing_id,
      filing_type: filing.filing_type,
    });
  }
  return filing;
}

/**
 * Mark VatRegister rows as non-claimable on a DRAFT PP30 (spec 04 §5.2, T-5.2).
 *
 * Each row must belong to the filing's period and be vat_type=INPUT —
 * mismatches throw VALIDATION_ERROR. Refreshes the filing's snapshot totals
 * so the DRAFT preview reflects the new claimable mix.
 */
export async function flagNonClaimable(
  filing_id: string,
  vat_register_ids: string[],
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const filing = await loadPP30(tx, filing_id);
    if (filing.status !== 'DRAFT') {
      throw new BusinessRuleError('PP30_NOT_DRAFT', {
        filing_id,
        status: filing.status,
      });
    }

    const rows = await tx.vatRegister.findMany({
      where: {
        id: { in: vat_register_ids },
        period_code: filing.period_code,
        vat_type: 'INPUT',
      },
      select: { id: true },
    });
    if (rows.length !== vat_register_ids.length) {
      const found = new Set(rows.map(r => r.id));
      const missing = vat_register_ids.filter(id => !found.has(id));
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'unknown_or_mismatched_vat_register_ids',
        missing,
      });
    }

    await tx.vatRegister.updateMany({
      where: { id: { in: vat_register_ids } },
      data: { claimable: false },
    });

    const aggregate = await aggregatePP30(filing.period_code, tx);
    const updated = await tx.taxFiling.update({
      where: { id: filing_id },
      data: {
        output_vat: aggregate.output_vat,
        input_vat: aggregate.input_vat,
        vat_payable: clampedPayable(aggregate),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'TaxFiling',
      entity_id: filing_id,
      before: filing,
      after: updated,
      reason: `flag_non_claimable: ${vat_register_ids.join(',')}`,
    });

    return updated;
  });
}

/**
 * Finalize a DRAFT PP30 filing (spec 04 §5.2, T-5.2).
 *
 * Re-runs the aggregate to capture the latest totals, then atomically:
 *  - Sets `filing_id` on every VatRegister row currently aggregable for this
 *    period (rows whose filing_id is NULL or already linked to this DRAFT).
 *    This is the lock — once set on a non-DRAFT filing, the aggregator
 *    excludes the row, so future PP30s for adjacent periods can never claim
 *    it twice.
 *  - Transitions the filing DRAFT → FINALIZED with refreshed snapshot totals.
 *
 * Throws PP30_NOT_DRAFT if the filing is already FINALIZED/SUBMITTED/VOID.
 */
export async function finalizePP30(
  filing_id: string,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const filing = await loadPP30(tx, filing_id);
    if (filing.status !== 'DRAFT') {
      throw new BusinessRuleError('PP30_NOT_DRAFT', {
        filing_id,
        status: filing.status,
      });
    }

    const aggregate = await aggregatePP30(filing.period_code, tx);

    const rowIds = [
      ...aggregate.output_rows.map(r => r.id),
      ...aggregate.input_rows.map(r => r.id),
      ...aggregate.non_claimable_rows.map(r => r.id),
    ];
    if (rowIds.length > 0) {
      await tx.vatRegister.updateMany({
        where: { id: { in: rowIds } },
        data: { filing_id },
      });
    }

    const updated = await tx.taxFiling.update({
      where: { id: filing_id },
      data: {
        status: 'FINALIZED',
        output_vat: aggregate.output_vat,
        input_vat: aggregate.input_vat,
        vat_payable: clampedPayable(aggregate),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'TaxFiling',
      entity_id: filing_id,
      before: filing,
      after: updated,
      reason: 'finalize_pp30',
    });

    return updated;
  });
}

export interface SubmitPP30Input {
  submission_date: string;
  submission_ref: string;
}

/**
 * Build and post the PP30 closing JE for a finalized filing (spec 02 §4.7,
 * spec 03 §4.4, T-5.3).
 *
 * Lines (zero-amount lines are skipped to satisfy the JE service's
 * debit_xor_credit > 0 invariant):
 *  - Dr VAT Payable (21110) `output_vat`
 *  - Cr VAT Receivable (14010) `input_vat`
 *  - Cr Cash/Bank (11020) `output_vat - input_vat` if positive
 *  - Dr VAT Refundable (14020) `|output_vat - input_vat|` if negative (refund)
 *
 * The JE is dated at the period end so the period's TB shows VAT Payable +
 * VAT Receivable both zeroed once submission posts. Returns null in the
 * degenerate case where the snapshot is all zero (no JE to post).
 */
async function postPP30ClosingJE(
  tx: Tx,
  filing: TaxFiling,
  actor_id: string,
): Promise<JournalEntryWithLines | null> {
  // The persisted vat_payable is clamped non-negative (CHECK constraint), so
  // recompute the signed payable from the snapshot to recover the refund case.
  const outputVat = D(filing.output_vat.toString());
  const inputVat = D(filing.input_vat.toString());
  const payable = outputVat.minus(inputVat);

  const lines: CreateJELineInput[] = [];
  if (outputVat.gt(0)) {
    lines.push({
      account_code: VAT_PAYABLE_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      debit: outputVat.toFixed(2),
      description: `Clear output VAT for ${filing.period_code}`,
    });
  }
  if (inputVat.gt(0)) {
    lines.push({
      account_code: VAT_RECEIVABLE_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      credit: inputVat.toFixed(2),
      description: `Clear input VAT for ${filing.period_code}`,
    });
  }
  if (payable.gt(0)) {
    lines.push({
      account_code: TAX_PAYMENT_BANK_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      credit: payable.toFixed(2),
      description: `VAT remittance to RD for ${filing.period_code}`,
    });
  } else if (payable.lt(0)) {
    lines.push({
      account_code: VAT_REFUNDABLE_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      debit: payable.abs().toFixed(2),
      description: `VAT refundable / carry-forward for ${filing.period_code}`,
    });
  }

  if (lines.length < 2) return null;

  // Date at the last day of the filing period (noon UTC) so derivePeriodCode
  // (Asia/Bangkok) lands in the same period regardless of DST quirks.
  const [yearStr, monthStr] = filing.period_code.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const entry_date = new Date(Date.UTC(year, month, 0, 12));

  const draft = await createDraft(
    tx,
    {
      entry_date,
      branch_code: TAX_FILING_BRANCH_CODE,
      description: `PP30 ${filing.period_code} submission`,
      source_type: 'ADJUSTMENT',
      source_id: filing.id,
      lines,
    },
    actor_id,
  );

  return postInTx(tx, draft.id, actor_id);
}

/**
 * Submit a FINALIZED PP30 filing (spec 04 §5.2, spec 02 §4.7, T-5.2 + T-5.3).
 *
 * Transitions FINALIZED → SUBMITTED, stamps `filed_at` (from
 * `submission_date`) and `filed_by_id`, posts the closing JE, and links its
 * `je_id` back onto the filing. The submission reference is recorded in the
 * AuditLog. Throws PP30_NOT_FINALIZED if the filing is not in FINALIZED state.
 */
export async function submitPP30(
  filing_id: string,
  input: SubmitPP30Input,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const filing = await loadPP30(tx, filing_id);
    if (filing.status !== 'FINALIZED') {
      throw new BusinessRuleError('PP30_NOT_FINALIZED', {
        filing_id,
        status: filing.status,
      });
    }

    const closingJE = await postPP30ClosingJE(tx, filing, actor_id);

    const updated = await tx.taxFiling.update({
      where: { id: filing_id },
      data: {
        status: 'SUBMITTED',
        filed_at: new Date(input.submission_date),
        filed_by_id: actor_id,
        je_id: closingJE?.id ?? null,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'TaxFiling',
      entity_id: filing_id,
      before: filing,
      after: updated,
      reason: `submit_pp30: ref=${input.submission_ref}${
        closingJE ? `, je=${closingJE.je_no}` : ''
      }`,
    });

    return updated;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PND3 / PND53 lifecycle (spec 02 §4.8, spec 03 §5.6, T-5.6).
// ═══════════════════════════════════════════════════════════════════════════

async function loadPND(tx: Tx, filing_id: string): Promise<TaxFiling> {
  const filing = await tx.taxFiling.findUnique({ where: { id: filing_id } });
  if (!filing) {
    throw new BusinessRuleError('NOT_FOUND', { filing_id });
  }
  if (filing.filing_type !== 'PND3' && filing.filing_type !== 'PND53') {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'not_pnd',
      filing_id,
      filing_type: filing.filing_type,
    });
  }
  return filing;
}

/**
 * Create a DRAFT ภงด.3 / ภงด.53 (PND) filing for `period_code` (spec 04 §5.2,
 * T-5.6).
 *
 * `type` selects which sub-form (PND3 = individual recipients, PND53 =
 * juristic recipients). Allocates a sequential `filing_no` via
 * `nextDocNo(type, ...)` and snapshots the current aggregate
 * (withholding_total, recipient_count). DRAFT filings do NOT lock
 * WithholdingRecord rows — locking happens on `finalizePND`. PND3 and PND53
 * filings can coexist for the same period because the aggregator partitions
 * records by vendor_type.
 */
export async function createDraftPND(
  period_code: string,
  type: PndType,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const aggregate = await aggregatePND(period_code, vendorTypeForPnd(type), tx);

    const year = parseInt(period_code.slice(0, 4), 10);
    const filing_no = await nextDocNo(
      tx,
      type as DocPrefix,
      year,
      'tax_filings',
      'filing_no',
    );

    const filing = await tx.taxFiling.create({
      data: {
        filing_no,
        filing_type: type,
        period_code,
        status: 'DRAFT',
        withholding_total: aggregate.total_wht,
        recipient_count: aggregate.recipient_count,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'TaxFiling',
      entity_id: filing.id,
      after: filing,
    });

    return filing;
  });
}

/**
 * Finalize a DRAFT PND filing (spec 04 §5.2, T-5.6).
 *
 * Re-runs the aggregate to capture the latest totals, then atomically:
 *  - Sets `filing_id` on every WithholdingRecord row currently aggregable for
 *    this period and vendor_type. Once linked the aggregator excludes the
 *    row, so future PND filings can never claim it twice.
 *  - Transitions DRAFT → FINALIZED with refreshed snapshot totals.
 *
 * Throws PND_NOT_DRAFT if the filing is already FINALIZED/SUBMITTED.
 */
export async function finalizePND(
  filing_id: string,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const filing = await loadPND(tx, filing_id);
    if (filing.status !== 'DRAFT') {
      throw new BusinessRuleError('PND_NOT_DRAFT', {
        filing_id,
        status: filing.status,
      });
    }

    const aggregate = await aggregatePND(
      filing.period_code,
      vendorTypeForPnd(filing.filing_type as PndType),
      tx,
    );

    const recordIds = aggregate.rows.map(r => r.record_id);
    if (recordIds.length > 0) {
      await tx.withholdingRecord.updateMany({
        where: { id: { in: recordIds } },
        data: { filing_id },
      });
    }

    const updated = await tx.taxFiling.update({
      where: { id: filing_id },
      data: {
        status: 'FINALIZED',
        withholding_total: aggregate.total_wht,
        recipient_count: aggregate.recipient_count,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'TaxFiling',
      entity_id: filing_id,
      before: filing,
      after: updated,
      reason: `finalize_${(filing.filing_type as string).toLowerCase()}`,
    });

    return updated;
  });
}

export interface SubmitPNDInput {
  submission_date: string;
  submission_ref: string;
}

/**
 * Build and post the PND closing JE for a finalized filing (spec 02 §4.8,
 * spec 03 §5.6, T-5.6).
 *
 *  - Dr WHT Payable (21120) `withholding_total`
 *  - Cr Cash/Bank (11020)   `withholding_total`
 *
 * Returns null when the snapshot is zero (no WHT for the period — no JE).
 */
async function postPNDClosingJE(
  tx: Tx,
  filing: TaxFiling,
  actor_id: string,
): Promise<JournalEntryWithLines | null> {
  const total = D(filing.withholding_total.toString());
  if (total.lte(0)) return null;

  const lines: CreateJELineInput[] = [
    {
      account_code: WHT_PAYABLE_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      debit: total.toFixed(2),
      description: `Clear WHT payable for ${filing.period_code}`,
    },
    {
      account_code: TAX_PAYMENT_BANK_ACCOUNT,
      branch_code: TAX_FILING_BRANCH_CODE,
      credit: total.toFixed(2),
      description: `WHT remittance to RD for ${filing.period_code}`,
    },
  ];

  const [yearStr, monthStr] = filing.period_code.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);
  const entry_date = new Date(Date.UTC(year, month, 0, 12));

  const draft = await createDraft(
    tx,
    {
      entry_date,
      branch_code: TAX_FILING_BRANCH_CODE,
      description: `${filing.filing_type} ${filing.period_code} submission`,
      source_type: 'ADJUSTMENT',
      source_id: filing.id,
      lines,
    },
    actor_id,
  );

  return postInTx(tx, draft.id, actor_id);
}

/**
 * Submit a FINALIZED PND filing (spec 04 §5.2, spec 02 §4.8, T-5.6).
 *
 * Transitions FINALIZED → SUBMITTED, stamps `filed_at` / `filed_by_id`, posts
 * the closing JE that clears WHT Payable for this filing's slice, and links
 * `je_id` back onto the filing. Throws PND_NOT_FINALIZED if not FINALIZED.
 */
export async function submitPND(
  filing_id: string,
  input: SubmitPNDInput,
  actor_id: string,
): Promise<TaxFiling> {
  return prisma.$transaction(async tx => {
    const filing = await loadPND(tx, filing_id);
    if (filing.status !== 'FINALIZED') {
      throw new BusinessRuleError('PND_NOT_FINALIZED', {
        filing_id,
        status: filing.status,
      });
    }

    const closingJE = await postPNDClosingJE(tx, filing, actor_id);

    const updated = await tx.taxFiling.update({
      where: { id: filing_id },
      data: {
        status: 'SUBMITTED',
        filed_at: new Date(input.submission_date),
        filed_by_id: actor_id,
        je_id: closingJE?.id ?? null,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'TaxFiling',
      entity_id: filing_id,
      before: filing,
      after: updated,
      reason: `submit_${(filing.filing_type as string).toLowerCase()}: ref=${
        input.submission_ref
      }${closingJE ? `, je=${closingJE.je_no}` : ''}`,
    });

    return updated;
  });
}

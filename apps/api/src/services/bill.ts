import type { Bill, BillLine, Prisma } from '@prisma/client';
import { billTotals, D, lineNet, lineVat, WHT_RATES } from '@wind-acc/shared';
import { prisma as db } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { logAuditEvent } from './audit-log';
import { toUserFk } from '../lib/actor';
import { assertPostable } from './account';
import {
  createDraft as jeCreateDraft,
  postInTx as jePostInTx,
  voidEntryInTx as jeVoidEntryInTx,
  type CreateJELineInput,
} from './journal-entry';
import { assertOpen, derivePeriodCode } from './period';
import { nextDocNo } from './numbering';

type Tx = Prisma.TransactionClient;

const AP_ACCOUNT = '21010';
const VAT_RECEIVABLE_ACCOUNT = '14010';
const WHT_PAYABLE_ACCOUNT = '21120';

const VALID_WHT_KEYS = new Set(WHT_RATES.map(r => r.key));

export type BillWithLines = Bill & { lines: BillLine[] };

function makeDraftBillNo(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}

export interface CreateBillLineInput {
  description: string;
  expense_account_code: string;
  qty?: string;
  unit_price: string;
  vat_rate?: string;
  withholding_rate?: string;
  withholding_type?: string | null;
}

export interface CreateBillInput {
  vendor_id: string;
  vendor_invoice_no?: string | null;
  branch_code: string;
  issue_date: string;
  due_date: string;
  vat_inclusive?: boolean;
  notes?: string | null;
  lines: CreateBillLineInput[];
}

export interface CreateBillResult {
  bill: BillWithLines;
  warnings: string[];
}

export interface UpdateBillLineInput {
  description: string;
  expense_account_code: string;
  qty?: string;
  unit_price: string;
  vat_rate?: string;
  withholding_rate?: string;
  withholding_type?: string | null;
}

export interface UpdateBillInput {
  vendor_id?: string;
  vendor_invoice_no?: string | null;
  branch_code?: string;
  issue_date?: string;
  due_date?: string;
  vat_inclusive?: boolean;
  notes?: string | null;
  lines?: UpdateBillLineInput[];
}

async function validateDraftInput(
  tx: Tx,
  input: CreateBillInput,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  if (input.lines.length < 1) {
    throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'min_one_line' });
  }

  const vendor = await tx.vendor.findFirst({
    where: { id: input.vendor_id, deleted_at: null },
  });
  if (!vendor) {
    throw new BusinessRuleError('NOT_FOUND', { vendor_id: input.vendor_id });
  }

  // Per spec 03 §3: vendor_invoice_no is required to claim input VAT.
  // Missing is a warning (not a hard error) so the draft can still be saved.
  if (!input.vendor_invoice_no) {
    warnings.push('vendor_invoice_no_missing_vat_claim_at_risk');
  }

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    await assertPostable(tx, line.expense_account_code);

    if (line.withholding_type && !VALID_WHT_KEYS.has(line.withholding_type)) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        line: i + 1,
        field: 'withholding_type',
        reason: 'invalid_wht_key',
        value: line.withholding_type,
      });
    }
  }

  return { warnings };
}

/**
 * Create a DRAFT Bill with computed totals (spec T-4.5).
 *
 * Validates: vendor exists; ≥1 line; each expense_account_code is postable;
 * withholding_type (if provided) must be a valid WHT key from wht-rates.ts.
 * Missing vendor_invoice_no produces a warning but not an error — the VAT
 * claim will be non-claimable at post time per spec 03 §3.
 * Totals are computed via billTotals (spec bill-math T-4.4).
 * No bill_no is assigned yet — that happens on post (T-4.7).
 */
export async function createDraft(
  input: CreateBillInput,
  actor_id?: string,
): Promise<CreateBillResult> {
  return db.$transaction(async (tx: Tx) => {
    const { warnings } = await validateDraftInput(tx, input);

    const vatInclusive = input.vat_inclusive ?? true;

    const totals = billTotals(
      input.lines.map(l => ({
        qty: l.qty ?? '1',
        unit_price: l.unit_price,
        vat_rate: l.vat_rate ?? '7',
        wht_rate: l.withholding_rate ?? '0',
      })),
      { vat_inclusive: vatInclusive },
    );

    const bill = await tx.bill.create({
      data: {
        bill_no: makeDraftBillNo(),
        vendor_id: input.vendor_id,
        vendor_invoice_no: input.vendor_invoice_no ?? null,
        branch_code: input.branch_code,
        issue_date: new Date(input.issue_date),
        due_date: new Date(input.due_date),
        vat_inclusive: vatInclusive,
        subtotal: totals.subtotal.toFixed(2),
        vat_amount: totals.vat_total.toFixed(2),
        withholding_amount: totals.withholding_total.toFixed(2),
        total: totals.total.toFixed(2),
        status: 'DRAFT',
        notes: input.notes ?? null,
        lines: {
          create: input.lines.map((l, i) => {
            const lineAmount = lineNet({
              qty: l.qty ?? '1',
              unit_price: l.unit_price,
            });
            const split = lineVat({
              net: lineAmount,
              vat_rate: l.vat_rate ?? '7',
              vat_inclusive: vatInclusive,
            });
            return {
              line_no: i + 1,
              description: l.description,
              expense_account_code: l.expense_account_code,
              qty: l.qty ?? '1',
              unit_price: l.unit_price,
              vat_rate: l.vat_rate ?? '7',
              withholding_rate: l.withholding_rate ?? '0',
              withholding_type: l.withholding_type ?? null,
              line_total: split.gross.toFixed(2),
            };
          }),
        },
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'Bill',
      entity_id: bill.id,
      after: bill,
    });

    return { bill, warnings };
  });
}

/**
 * Update a DRAFT Bill (spec T-4.6).
 *
 * Rejects if the bill is not DRAFT (BILL_NOT_DRAFT) or if the caller's
 * ifMatch timestamp is stale (STALE_RECORD). Lines are fully replaced when
 * provided; all draft validations are re-run on the merged state.
 */
export async function update(
  id: string,
  input: UpdateBillInput,
  actor_id?: string,
  ifMatch?: string,
): Promise<CreateBillResult> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.bill.findUnique({
      where: { id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }

    if (ifMatch !== undefined && existing.updated_at.toISOString() !== ifMatch) {
      throw new BusinessRuleError('STALE_RECORD', { id });
    }

    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('BILL_NOT_DRAFT', { id, status: existing.status });
    }

    const mergedLines: CreateBillLineInput[] = input.lines
      ? input.lines.map(l => ({
          description: l.description,
          expense_account_code: l.expense_account_code,
          qty: l.qty,
          unit_price: l.unit_price,
          vat_rate: l.vat_rate,
          withholding_rate: l.withholding_rate,
          withholding_type: l.withholding_type,
        }))
      : existing.lines.map(l => ({
          description: l.description,
          expense_account_code: l.expense_account_code,
          qty: l.qty.toString(),
          unit_price: l.unit_price.toString(),
          vat_rate: l.vat_rate.toString(),
          withholding_rate: l.withholding_rate.toString(),
          withholding_type: l.withholding_type ?? null,
        }));

    const merged: CreateBillInput = {
      vendor_id: input.vendor_id ?? existing.vendor_id,
      vendor_invoice_no:
        input.vendor_invoice_no !== undefined
          ? input.vendor_invoice_no
          : existing.vendor_invoice_no,
      branch_code: input.branch_code ?? existing.branch_code,
      issue_date: input.issue_date ?? existing.issue_date.toISOString().split('T')[0],
      due_date: input.due_date ?? existing.due_date.toISOString().split('T')[0],
      vat_inclusive: input.vat_inclusive ?? existing.vat_inclusive,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      lines: mergedLines,
    };

    const { warnings } = await validateDraftInput(tx, merged);

    const vatInclusive = merged.vat_inclusive ?? true;

    const totals = billTotals(
      merged.lines.map(l => ({
        qty: l.qty ?? '1',
        unit_price: l.unit_price,
        vat_rate: l.vat_rate ?? '7',
        wht_rate: l.withholding_rate ?? '0',
      })),
      { vat_inclusive: vatInclusive },
    );

    await tx.billLine.deleteMany({ where: { bill_id: id } });

    const bill = await tx.bill.update({
      where: { id },
      data: {
        vendor_id: merged.vendor_id,
        vendor_invoice_no: merged.vendor_invoice_no ?? null,
        branch_code: merged.branch_code,
        issue_date: new Date(merged.issue_date),
        due_date: new Date(merged.due_date),
        vat_inclusive: vatInclusive,
        subtotal: totals.subtotal.toFixed(2),
        vat_amount: totals.vat_total.toFixed(2),
        withholding_amount: totals.withholding_total.toFixed(2),
        total: totals.total.toFixed(2),
        notes: merged.notes ?? null,
        lines: {
          create: merged.lines.map((l, i) => {
            const lineAmount = lineNet({
              qty: l.qty ?? '1',
              unit_price: l.unit_price,
            });
            const split = lineVat({
              net: lineAmount,
              vat_rate: l.vat_rate ?? '7',
              vat_inclusive: vatInclusive,
            });
            return {
              line_no: i + 1,
              description: l.description,
              expense_account_code: l.expense_account_code,
              qty: l.qty ?? '1',
              unit_price: l.unit_price,
              vat_rate: l.vat_rate ?? '7',
              withholding_rate: l.withholding_rate ?? '0',
              withholding_type: l.withholding_type ?? null,
              line_total: split.gross.toFixed(2),
            };
          }),
        },
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'Bill',
      entity_id: id,
      before: existing,
      after: bill,
    });

    return { bill, warnings };
  });
}

/**
 * Post a DRAFT Bill (spec T-4.7, spec 02 §4.5, spec 03 §3).
 *
 * Within a single transaction:
 *  1. Re-validate (defense in depth — DRAFT could have drifted out-of-band).
 *  2. Assert the period derived from issue_date is OPEN.
 *  3. Allocate `bill_no` via `nextDocNo('BILL', ...)`.
 *  4. Build the balanced JE per spec §4.5:
 *       Dr Expense (per line)        each line's net (one debit per line)
 *       Dr VAT Receivable (14010)    vat_total                (only if > 0)
 *       Cr AP (21010)                total - withholding_total
 *       Cr WHT Payable (21120)       withholding_total        (only if > 0)
 *     Posted via JournalEntryService so it gets sequential je_no + audit.
 *  5. Insert one VatRegister row with vat_type='INPUT' carrying the vendor's
 *     name + tax_id and per-bill net/vat/gross. Per spec 03 §3, `claimable`
 *     is false when vendor.tax_id is missing OR vendor_invoice_no is blank;
 *     posting still succeeds — the accountant can re-flag from PP30 later.
 *  6. Flip the bill to POSTED, link je_id, stamp posted_at / posted_by_id, and
 *     replace the draft placeholder bill_no.
 *  7. Emit AuditLog action=POST.
 *
 * WHT does NOT generate a WithholdingRecord here (spec 03 §5.3) — that is
 * issued at Payment post (T-4.11), since the WHT certificate accompanies
 * the actual payment.
 */
export async function post(
  id: string,
  actor_id: string,
): Promise<BillWithLines> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.bill.findUnique({
      where: { id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('BILL_NOT_DRAFT', { id, status: existing.status });
    }
    if (existing.lines.length < 1) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'min_one_line' });
    }

    const vendor = await tx.vendor.findFirst({
      where: { id: existing.vendor_id, deleted_at: null },
    });
    if (!vendor) {
      throw new BusinessRuleError('NOT_FOUND', { vendor_id: existing.vendor_id });
    }

    for (const l of existing.lines) {
      await assertPostable(tx, l.expense_account_code);
      if (l.withholding_type && !VALID_WHT_KEYS.has(l.withholding_type)) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          line: l.line_no,
          field: 'withholding_type',
          reason: 'invalid_wht_key',
          value: l.withholding_type,
        });
      }
    }

    const period_code = derivePeriodCode(existing.issue_date);
    await assertOpen(tx, period_code);

    const year = parseInt(period_code.slice(0, 4), 10);
    const bill_no = await nextDocNo(tx, 'BILL', year, 'bills', 'bill_no');

    const total = D(existing.total.toString());
    const subtotal = D(existing.subtotal.toString());
    const vatTotal = D(existing.vat_amount.toString());
    const whtTotal = D(existing.withholding_amount.toString());
    const apCredit = total.minus(whtTotal);

    const jeLines: CreateJELineInput[] = [];
    for (const l of existing.lines) {
      const lineAmount = lineNet({
        qty: l.qty.toString(),
        unit_price: l.unit_price.toString(),
      });
      const split = lineVat({
        net: lineAmount,
        vat_rate: l.vat_rate.toString(),
        vat_inclusive: existing.vat_inclusive,
      });
      jeLines.push({
        account_code: l.expense_account_code,
        branch_code: existing.branch_code,
        debit: split.net.toFixed(2),
        description: l.description,
      });
    }
    if (vatTotal.gt(0)) {
      jeLines.push({
        account_code: VAT_RECEIVABLE_ACCOUNT,
        branch_code: existing.branch_code,
        debit: vatTotal.toFixed(2),
        description: `Input VAT ${bill_no}`,
      });
    }
    jeLines.push({
      account_code: AP_ACCOUNT,
      branch_code: existing.branch_code,
      credit: apCredit.toFixed(2),
      description: `AP ${bill_no}`,
    });
    if (whtTotal.gt(0)) {
      jeLines.push({
        account_code: WHT_PAYABLE_ACCOUNT,
        branch_code: existing.branch_code,
        credit: whtTotal.toFixed(2),
        description: `WHT payable ${bill_no}`,
      });
    }

    const jeDraft = await jeCreateDraft(
      tx,
      {
        entry_date: existing.issue_date,
        branch_code: existing.branch_code,
        description: `Bill ${bill_no}`,
        source_type: 'BILL',
        source_id: existing.id,
        lines: jeLines,
      },
      actor_id,
    );
    const postedJe = await jePostInTx(tx, jeDraft.id, actor_id);

    // Per spec 03 §3: input VAT is only claimable if the vendor has a 13-digit
    // tax_id AND the vendor's tax invoice number was recorded. Either missing
    // → flag claimable=false; the accountant can re-flag from PP30 later.
    const claimable = !!vendor.tax_id && !!existing.vendor_invoice_no;

    const headerVatRate = existing.lines[0]
      ? D(existing.lines[0].vat_rate.toString())
      : D(7);

    await tx.vatRegister.create({
      data: {
        vat_type: 'INPUT',
        txn_date: existing.issue_date,
        period_code,
        tax_invoice_no: existing.vendor_invoice_no,
        counterparty_name: vendor.name_th ?? vendor.name,
        counterparty_tax_id: vendor.tax_id,
        net_amount: subtotal.toFixed(2),
        vat_amount: vatTotal.toFixed(2),
        gross_amount: total.toFixed(2),
        vat_rate: headerVatRate.toFixed(2),
        claimable,
        source_type: 'BILL',
        source_id: existing.id,
      },
    });

    const updated = await tx.bill.update({
      where: { id },
      data: {
        bill_no,
        status: 'POSTED',
        je_id: postedJe.id,
        posted_at: new Date(),
        posted_by_id: toUserFk(actor_id),
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'POST',
      entity_type: 'Bill',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

/**
 * Void a POSTED Bill (spec T-4.8, spec 02 §5.3).
 *
 * Within a single transaction:
 *  1. Load the bill. NOT_FOUND if missing; ALREADY_VOIDED if status=VOID;
 *     BILL_NOT_DRAFT for any non-POSTED state.
 *  2. Block with BILL_HAS_PAYMENTS if any PaymentApplication exists with
 *     applied_amount > 0 — caller must void the payment first (§5.3).
 *  3. Void the linked JE via JournalEntryService.voidEntryInTx — this creates
 *     a reversal JE and flips the original JE to VOID. Period-closed checks
 *     and audit logging happen there.
 *  4. Insert a reversing VatRegister row (negated net/vat/gross) with
 *     reversal_of_id back-pointer, so PP30 aggregation can SUM blindly.
 *  5. Set bill status=VOID, voided_at, voided_by_id, void_reason.
 *  6. AuditLog action=VOID.
 */
export async function voidBill(
  id: string,
  actor_id: string,
  reason: string,
): Promise<BillWithLines> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.bill.findUnique({
      where: { id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }

    if (existing.status === 'VOID') {
      throw new BusinessRuleError('ALREADY_VOIDED', { id });
    }

    if (existing.status !== 'POSTED') {
      throw new BusinessRuleError('BILL_NOT_DRAFT', {
        id,
        status: existing.status,
        reason: 'only_posted_can_be_voided',
      });
    }

    if (!existing.je_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id,
        reason: 'bill_missing_je_link',
      });
    }

    const paid = await tx.paymentApplication.findFirst({
      where: { bill_id: id, applied_amount: { gt: 0 } },
      select: { id: true },
    });
    if (paid) {
      throw new BusinessRuleError('BILL_HAS_PAYMENTS', { id });
    }

    await jeVoidEntryInTx(tx, existing.je_id, actor_id, reason);

    const originals = await tx.vatRegister.findMany({
      where: {
        source_type: 'BILL',
        source_id: existing.id,
        reversal_of_id: null,
      },
    });
    for (const orig of originals) {
      await tx.vatRegister.create({
        data: {
          vat_type: orig.vat_type,
          txn_date: orig.txn_date,
          period_code: orig.period_code,
          tax_invoice_no: orig.tax_invoice_no,
          counterparty_name: orig.counterparty_name,
          counterparty_tax_id: orig.counterparty_tax_id,
          net_amount: D(orig.net_amount.toString()).negated().toFixed(2),
          vat_amount: D(orig.vat_amount.toString()).negated().toFixed(2),
          gross_amount: D(orig.gross_amount.toString()).negated().toFixed(2),
          vat_rate: orig.vat_rate,
          claimable: orig.claimable,
          source_type: orig.source_type,
          source_id: orig.source_id,
          reversal_of_id: orig.id,
        },
      });
    }

    const updated = await tx.bill.update({
      where: { id },
      data: {
        status: 'VOID',
        voided_at: new Date(),
        voided_by_id: toUserFk(actor_id),
        void_reason: reason,
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'VOID',
      entity_type: 'Bill',
      entity_id: id,
      before: existing,
      after: updated,
      reason,
    });

    return updated;
  });
}

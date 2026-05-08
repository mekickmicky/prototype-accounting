import type { Prisma, SalesInvoice, SalesInvoiceLine } from '@prisma/client';
import { D, invoiceTotals, lineNet, lineVat } from '@wind-acc/shared';
import type { CreateSalesInvoiceBodyType, UpdateSalesInvoiceBodyType } from '@wind-acc/shared';
import { prisma as db } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { logAuditEvent } from './audit-log';
import { assertPostable } from './account';
import {
  createDraft as jeCreateDraft,
  postInTx as jePostInTx,
  voidEntryInTx as jeVoidEntryInTx,
  type CreateJELineInput,
} from './journal-entry';
import { assertOpen, derivePeriodCode } from './period';
import { nextDocNo } from './numbering';

const AR_ACCOUNT = '12010';
const WHT_RECEIVABLE_ACCOUNT = '14020';
const VAT_PAYABLE_ACCOUNT = '21110';

type Tx = Prisma.TransactionClient;

export type SalesInvoiceWithLines = SalesInvoice & { lines: SalesInvoiceLine[] };

// invoice_no is NOT NULL UNIQUE in the DB. Drafts use a placeholder until
// T-3.7 (post) replaces it with the sequential INV-{year}-{NNNN} number.
function makeDraftInvoiceNo(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}

async function validateDraftInput(
  tx: Tx,
  input: CreateSalesInvoiceBodyType,
): Promise<void> {
  if (input.lines.length < 1) {
    throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'min_one_line' });
  }

  const customer = await tx.customer.findFirst({
    where: { id: input.customer_id, deleted_at: null },
  });
  if (!customer) {
    throw new BusinessRuleError('NOT_FOUND', { customer_id: input.customer_id });
  }

  if (input.is_tax_invoice) {
    const missing: string[] = [];
    if (!customer.tax_id) missing.push('tax_id');
    if (!customer.address) missing.push('address');
    if (missing.length > 0) {
      throw new BusinessRuleError('INVALID_TAX_INVOICE', {
        customer_id: input.customer_id,
        missing,
      });
    }
  }

  for (let i = 0; i < input.lines.length; i++) {
    await assertPostable(tx, input.lines[i].revenue_account_code);
  }
}

/**
 * Create a DRAFT SalesInvoice with computed totals (spec T-3.5).
 *
 * Validates: customer exists; ≥1 line; each revenue_account_code is postable;
 * is_tax_invoice=true requires customer.tax_id + customer.address.
 * Totals are computed via invoiceTotals (spec 02 §13, spec 03 §7).
 * No invoice_no or tax_invoice_no is assigned yet — that happens on post (T-3.7).
 */
export async function createDraft(
  input: CreateSalesInvoiceBodyType,
  actor_id?: string,
): Promise<SalesInvoiceWithLines> {
  return db.$transaction(async tx => {
    await validateDraftInput(tx, input);

    const totals = invoiceTotals(
      input.lines.map(l => ({
        qty: l.qty,
        unit_price: l.unit_price,
        discount: l.discount,
        vat_rate: l.vat_rate,
        wht_rate: null,
      })),
      { vat_inclusive: input.vat_inclusive },
    );

    const invoice = await tx.salesInvoice.create({
      data: {
        invoice_no: makeDraftInvoiceNo(),
        customer_id: input.customer_id,
        branch_code: input.branch_code,
        issue_date: new Date(input.issue_date),
        due_date: new Date(input.due_date),
        is_tax_invoice: input.is_tax_invoice,
        vat_inclusive: input.vat_inclusive,
        subtotal: totals.subtotal.toFixed(2),
        discount: totals.discount_total.toFixed(2),
        vat_amount: totals.vat_total.toFixed(2),
        withholding_amount: totals.withholding_total.toFixed(2),
        total: totals.total.toFixed(2),
        status: 'DRAFT',
        notes: input.notes ?? null,
        source_type: input.source_type ?? null,
        source_ref: input.source_ref ?? null,
        lines: {
          create: input.lines.map((l, i) => {
            const lineAmount = lineNet({
              qty: l.qty,
              unit_price: l.unit_price,
              discount: l.discount,
            });
            const split = lineVat({
              net: lineAmount,
              vat_rate: l.vat_rate,
              vat_inclusive: input.vat_inclusive,
            });
            return {
              line_no: i + 1,
              description: l.description,
              service_code: l.service_code ?? null,
              product_code: l.product_code ?? null,
              qty: l.qty,
              unit_price: l.unit_price,
              discount: l.discount,
              vat_rate: l.vat_rate,
              revenue_account_code: l.revenue_account_code,
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
      entity_type: 'SalesInvoice',
      entity_id: invoice.id,
      after: invoice,
    });

    return invoice;
  });
}

/**
 * Update a DRAFT SalesInvoice (spec T-3.6).
 *
 * Rejects if the invoice is not DRAFT (INVOICE_NOT_DRAFT) or if the caller's
 * ifMatch timestamp is stale (STALE_RECORD). Lines are fully replaced when
 * provided; all draft validations are re-run on the merged state.
 */
export async function update(
  id: string,
  input: UpdateSalesInvoiceBodyType,
  actor_id?: string,
  ifMatch?: string,
): Promise<SalesInvoiceWithLines> {
  return db.$transaction(async tx => {
    const existing = await tx.salesInvoice.findUnique({
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
      throw new BusinessRuleError('INVOICE_NOT_DRAFT', { id, status: existing.status });
    }

    // Merge partial input with existing values so validations see a full picture.
    const mergedLines: CreateSalesInvoiceBodyType['lines'] = input.lines
      ? input.lines
      : existing.lines.map(l => ({
          description: l.description,
          service_code: l.service_code ?? undefined,
          product_code: l.product_code ?? undefined,
          qty: l.qty.toString(),
          unit_price: l.unit_price.toString(),
          discount: l.discount.toString(),
          vat_rate: l.vat_rate.toString(),
          revenue_account_code: l.revenue_account_code,
        }));

    const merged: CreateSalesInvoiceBodyType = {
      customer_id: input.customer_id ?? existing.customer_id,
      branch_code: input.branch_code ?? existing.branch_code,
      issue_date: input.issue_date ?? existing.issue_date.toISOString().split('T')[0],
      due_date: input.due_date ?? existing.due_date.toISOString().split('T')[0],
      is_tax_invoice: input.is_tax_invoice ?? existing.is_tax_invoice,
      vat_inclusive: input.vat_inclusive ?? existing.vat_inclusive,
      notes: input.notes !== undefined ? input.notes : (existing.notes ?? undefined),
      source_type: input.source_type !== undefined ? input.source_type : (existing.source_type ?? undefined),
      source_ref: input.source_ref !== undefined ? input.source_ref : (existing.source_ref ?? undefined),
      lines: mergedLines,
    };

    await validateDraftInput(tx, merged);

    const totals = invoiceTotals(
      merged.lines.map(l => ({
        qty: l.qty,
        unit_price: l.unit_price,
        discount: l.discount,
        vat_rate: l.vat_rate,
        wht_rate: null,
      })),
      { vat_inclusive: merged.vat_inclusive },
    );

    await tx.salesInvoiceLine.deleteMany({ where: { invoice_id: id } });

    const updated = await tx.salesInvoice.update({
      where: { id },
      data: {
        customer_id: merged.customer_id,
        branch_code: merged.branch_code,
        issue_date: new Date(merged.issue_date),
        due_date: new Date(merged.due_date),
        is_tax_invoice: merged.is_tax_invoice,
        vat_inclusive: merged.vat_inclusive,
        subtotal: totals.subtotal.toFixed(2),
        discount: totals.discount_total.toFixed(2),
        vat_amount: totals.vat_total.toFixed(2),
        withholding_amount: totals.withholding_total.toFixed(2),
        total: totals.total.toFixed(2),
        notes: merged.notes ?? null,
        source_type: merged.source_type ?? null,
        source_ref: merged.source_ref ?? null,
        lines: {
          create: merged.lines.map((l, i) => {
            const lineAmount = lineNet({
              qty: l.qty,
              unit_price: l.unit_price,
              discount: l.discount,
            });
            const split = lineVat({
              net: lineAmount,
              vat_rate: l.vat_rate,
              vat_inclusive: merged.vat_inclusive,
            });
            return {
              line_no: i + 1,
              description: l.description,
              service_code: l.service_code ?? null,
              product_code: l.product_code ?? null,
              qty: l.qty,
              unit_price: l.unit_price,
              discount: l.discount,
              vat_rate: l.vat_rate,
              revenue_account_code: l.revenue_account_code,
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
      entity_type: 'SalesInvoice',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

/**
 * Post a DRAFT SalesInvoice (spec T-3.7, spec 02 §4.1, spec 03 §2).
 *
 * Within a single transaction:
 *  1. Re-validate the invoice (defense in depth — DRAFT could have drifted).
 *  2. Assert the period derived from issue_date is OPEN.
 *  3. Allocate `invoice_no` via `nextDocNo('INV', ...)`. If `is_tax_invoice`,
 *     also allocate a separate `tax_invoice_no` via `nextDocNo('TAX', ...)`.
 *  4. Build the balanced JE per spec §4.1:
 *       Dr AR (12010)              total - withholding_amount
 *       Dr WHT Receivable (14020)  withholding_amount        (only if > 0)
 *       Cr Revenue (per line)      each line's net           (one credit per line)
 *       Cr VAT Payable (21110)     vat_total                 (only if > 0)
 *     Posted via JournalEntryService so it gets sequential je_no + audit.
 *  5. Insert one VatRegister row with vat_type='OUTPUT' carrying the customer's
 *     name + tax_id and per-invoice net/vat/gross.
 *  6. Flip the invoice to POSTED, link je_id, stamp posted_at / posted_by_id.
 *  7. Emit AuditLog action=POST.
 */
export async function post(
  id: string,
  actor_id: string,
): Promise<SalesInvoiceWithLines> {
  return db.$transaction(async tx => {
    const existing = await tx.salesInvoice.findUnique({
      where: { id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('INVOICE_NOT_DRAFT', { id, status: existing.status });
    }
    if (existing.lines.length < 1) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'min_one_line' });
    }

    const customer = await tx.customer.findFirst({
      where: { id: existing.customer_id, deleted_at: null },
    });
    if (!customer) {
      throw new BusinessRuleError('NOT_FOUND', { customer_id: existing.customer_id });
    }

    if (existing.is_tax_invoice) {
      const missing: string[] = [];
      if (!customer.tax_id) missing.push('tax_id');
      if (!customer.address) missing.push('address');
      if (missing.length > 0) {
        throw new BusinessRuleError('INVALID_TAX_INVOICE', {
          customer_id: customer.id,
          missing,
        });
      }
    }

    for (const l of existing.lines) {
      await assertPostable(tx, l.revenue_account_code);
    }

    const period_code = derivePeriodCode(existing.issue_date);
    await assertOpen(tx, period_code);

    const year = parseInt(period_code.slice(0, 4), 10);
    const invoice_no = await nextDocNo(tx, 'INV', year, 'sales_invoices', 'invoice_no');
    const tax_invoice_no = existing.is_tax_invoice
      ? await nextDocNo(tx, 'TAX', year, 'sales_invoices', 'tax_invoice_no')
      : null;

    const total = D(existing.total.toString());
    const subtotal = D(existing.subtotal.toString());
    const vatTotal = D(existing.vat_amount.toString());
    const whtTotal = D(existing.withholding_amount.toString());
    const arDebit = total.minus(whtTotal);

    const jeLines: CreateJELineInput[] = [];
    jeLines.push({
      account_code: AR_ACCOUNT,
      branch_code: existing.branch_code,
      debit: arDebit.toFixed(2),
      description: `AR ${invoice_no}`,
    });
    if (whtTotal.gt(0)) {
      jeLines.push({
        account_code: WHT_RECEIVABLE_ACCOUNT,
        branch_code: existing.branch_code,
        debit: whtTotal.toFixed(2),
        description: `WHT receivable ${invoice_no}`,
      });
    }
    for (const l of existing.lines) {
      const lineAmount = lineNet({
        qty: l.qty.toString(),
        unit_price: l.unit_price.toString(),
        discount: l.discount.toString(),
      });
      const split = lineVat({
        net: lineAmount,
        vat_rate: l.vat_rate.toString(),
        vat_inclusive: existing.vat_inclusive,
      });
      jeLines.push({
        account_code: l.revenue_account_code,
        branch_code: existing.branch_code,
        credit: split.net.toFixed(2),
        description: l.description,
      });
    }
    if (vatTotal.gt(0)) {
      jeLines.push({
        account_code: VAT_PAYABLE_ACCOUNT,
        branch_code: existing.branch_code,
        credit: vatTotal.toFixed(2),
        description: `Output VAT ${invoice_no}`,
      });
    }

    const jeDraft = await jeCreateDraft(
      tx,
      {
        entry_date: existing.issue_date,
        branch_code: existing.branch_code,
        description: `Sales Invoice ${invoice_no}`,
        source_type: 'SALES_INVOICE',
        source_id: existing.id,
        lines: jeLines,
      },
      actor_id,
    );
    const postedJe = await jePostInTx(tx, jeDraft.id, actor_id);

    const headerVatRate = existing.lines[0]
      ? D(existing.lines[0].vat_rate.toString())
      : D(7);

    await tx.vatRegister.create({
      data: {
        vat_type: 'OUTPUT',
        txn_date: existing.issue_date,
        period_code,
        tax_invoice_no,
        counterparty_name: customer.name_th ?? customer.name,
        counterparty_tax_id: customer.tax_id,
        net_amount: subtotal.toFixed(2),
        vat_amount: vatTotal.toFixed(2),
        gross_amount: total.toFixed(2),
        vat_rate: headerVatRate.toFixed(2),
        source_type: 'SALES_INVOICE',
        source_id: existing.id,
      },
    });

    const updated = await tx.salesInvoice.update({
      where: { id },
      data: {
        invoice_no,
        tax_invoice_no,
        status: 'POSTED',
        je_id: postedJe.id,
        posted_at: new Date(),
        posted_by_id: actor_id,
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'POST',
      entity_type: 'SalesInvoice',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

/**
 * Void a POSTED SalesInvoice (spec T-3.8, spec 02 §4.2, §5.3).
 *
 * Within a single transaction:
 *  1. Load the invoice. ALREADY_VOIDED if status=VOID; INVOICE_NOT_DRAFT-style
 *     guard for any non-POSTED state.
 *  2. Block with INVOICE_HAS_PAYMENTS if any ReceiptApplication with
 *     applied_amount > 0 exists — caller must void receipts first (§5.3).
 *  3. Void the linked JE via JournalEntryService.voidEntryInTx — this creates
 *     a reversal JE and flips the original JE to VOID. Period-closed checks
 *     and audit logging happen there.
 *  4. Insert a reversing VatRegister row with negative net/vat/gross and
 *     reversal_of_id back-pointer. PP30 aggregation can SUM blindly — the
 *     reversal nets the original to zero.
 *  5. Set invoice status=VOID, voided_at, voided_by_id, void_reason.
 *  6. AuditLog action=VOID.
 */
export async function voidInvoice(
  id: string,
  actor_id: string,
  reason: string,
): Promise<SalesInvoiceWithLines> {
  return db.$transaction(async tx => {
    const existing = await tx.salesInvoice.findUnique({
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
      throw new BusinessRuleError('INVOICE_NOT_DRAFT', {
        id,
        status: existing.status,
        reason: 'only_posted_can_be_voided',
      });
    }

    if (!existing.je_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id,
        reason: 'invoice_missing_je_link',
      });
    }

    const paid = await tx.receiptApplication.findFirst({
      where: { invoice_id: id, applied_amount: { gt: 0 } },
      select: { id: true },
    });
    if (paid) {
      throw new BusinessRuleError('INVOICE_HAS_PAYMENTS', { id });
    }

    await jeVoidEntryInTx(tx, existing.je_id, actor_id, reason);

    const originals = await tx.vatRegister.findMany({
      where: {
        source_type: 'SALES_INVOICE',
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
          source_type: orig.source_type,
          source_id: orig.source_id,
          reversal_of_id: orig.id,
        },
      });
    }

    const updated = await tx.salesInvoice.update({
      where: { id },
      data: {
        status: 'VOID',
        voided_at: new Date(),
        voided_by_id: actor_id,
        void_reason: reason,
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'VOID',
      entity_type: 'SalesInvoice',
      entity_id: id,
      before: existing,
      after: updated,
      reason,
    });

    return updated;
  });
}

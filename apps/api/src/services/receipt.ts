import type { Prisma, Receipt, ReceiptApplication, Customer, BankAccount, DocStatus, PaymentMethod } from '@prisma/client';
import { D } from '@wind-acc/shared';
import type { CreateReceiptBodyType, UpdateReceiptBodyType } from '@wind-acc/shared';
import { prisma as db } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { logAuditEvent } from './audit-log';
import {
  createDraft as jeCreateDraft,
  postInTx as jePostInTx,
  voidEntryInTx as jeVoidEntryInTx,
  type CreateJELineInput,
} from './journal-entry';
import { assertOpen, derivePeriodCode } from './period';
import { nextDocNo } from './numbering';
import { applyToInvoices, unapplyFromInvoices } from './receipt-application';

type Tx = Prisma.TransactionClient;

const CASH_ACCOUNT = '11010';
const AR_ACCOUNT = '12010';
const CUSTOMER_DEPOSITS_ACCOUNT = '21210';
const CARD_FEE_ACCOUNT = '61070';

export type ReceiptWithApplications = Receipt & {
  applications: ReceiptApplication[];
};

// receipt_no is NOT NULL UNIQUE in DB. Drafts use a placeholder until
// T-3.12 (post) replaces it with the sequential RCT-{year}-{NNNN} number.
function makeDraftReceiptNo(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}

/**
 * Create a DRAFT Receipt with optional invoice applications (spec T-3.10).
 *
 * Validates:
 *  - customer exists and is not deleted
 *  - if payment_method != CASH then bank_account_id is required (and must exist)
 *  - sum of applications[].applied_amount <= total_amount (RECEIPT_OVERAPPLIED)
 *  - each application's invoice: same customer_id, status POSTED or PARTIAL_PAID,
 *    and paid_amount + applied_amount <= invoice.total (RECEIPT_OVERAPPLIED)
 *
 * No receipt_no is assigned yet — that happens on post (T-3.12).
 */
export async function createDraft(
  input: CreateReceiptBodyType,
  actor_id?: string,
): Promise<ReceiptWithApplications> {
  return db.$transaction(async tx => {
    await validateDraftInput(tx, input);

    const receipt = await tx.receipt.create({
      data: {
        receipt_no: makeDraftReceiptNo(),
        customer_id: input.customer_id,
        branch_code: input.branch_code,
        receipt_date: new Date(input.receipt_date),
        total_amount: D(input.total_amount).toFixed(2),
        payment_method: input.payment_method,
        bank_account_id: input.bank_account_id ?? null,
        card_fee: D(input.card_fee).toFixed(2),
        slip_ref: input.slip_ref ?? null,
        notes: input.notes ?? null,
        status: 'DRAFT',
        applications: {
          create: input.applications.map(a => ({
            invoice_id: a.invoice_id,
            applied_amount: D(a.applied_amount).toFixed(2),
          })),
        },
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'Receipt',
      entity_id: receipt.id,
      after: receipt,
    });

    return receipt;
  });
}

async function validateDraftInput(tx: Tx, input: CreateReceiptBodyType): Promise<void> {
  const customer = await tx.customer.findFirst({
    where: { id: input.customer_id, deleted_at: null },
  });
  if (!customer) {
    throw new BusinessRuleError('NOT_FOUND', { customer_id: input.customer_id });
  }

  if (input.payment_method !== 'CASH' && !input.bank_account_id) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'bank_account_id_required_for_non_cash',
    });
  }

  if (input.bank_account_id) {
    const bankAccount = await tx.bankAccount.findUnique({
      where: { id: input.bank_account_id },
    });
    if (!bankAccount) {
      throw new BusinessRuleError('NOT_FOUND', { bank_account_id: input.bank_account_id });
    }
  }

  const total = D(input.total_amount);
  const sumApplied = input.applications.reduce(
    (sum, a) => sum.plus(D(a.applied_amount)),
    D(0),
  );
  if (sumApplied.gt(total)) {
    throw new BusinessRuleError('RECEIPT_OVERAPPLIED', {
      total_amount: total.toFixed(2),
      sum_applied: sumApplied.toFixed(2),
    });
  }

  for (const app of input.applications) {
    const invoice = await tx.salesInvoice.findUnique({
      where: { id: app.invoice_id },
    });
    if (!invoice) {
      throw new BusinessRuleError('NOT_FOUND', { invoice_id: app.invoice_id });
    }
    if (invoice.customer_id !== input.customer_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'invoice_customer_mismatch',
        invoice_id: app.invoice_id,
      });
    }
    if (invoice.status !== 'POSTED' && invoice.status !== 'PARTIAL_PAID') {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'invoice_not_collectible',
        invoice_id: app.invoice_id,
        status: invoice.status,
      });
    }
    const invoiceBalance = D(invoice.total.toString()).minus(D(invoice.paid_amount.toString()));
    if (D(app.applied_amount).gt(invoiceBalance)) {
      throw new BusinessRuleError('RECEIPT_OVERAPPLIED', {
        invoice_id: app.invoice_id,
        invoice_balance: invoiceBalance.toFixed(2),
        applied_amount: app.applied_amount,
      });
    }
  }
}

/**
 * Post a DRAFT Receipt (spec T-3.12, spec 02 §4.3, §4.4).
 *
 * Within a single transaction:
 *  1. Load the receipt with applications. Reject non-DRAFT (RECEIPT_NOT_DRAFT).
 *  2. Re-validate overapplication (defense in depth): sum of applied_amount
 *     ≤ total_amount, and each invoice balance still covers its application.
 *  3. Assert the period derived from receipt_date is OPEN.
 *  4. Allocate `receipt_no` via `nextDocNo('RCT', ...)`.
 *  5. Resolve the cash/bank account:
 *       payment_method=CASH → 11010
 *       otherwise           → bank_account.gl_account_code
 *  6. Build the balanced JE per spec §4.3 (with applications) or §4.4 (advance):
 *       Dr Cash/Bank                    total_amount - card_fee
 *       Dr Bank Fees (61070)            card_fee                (only if > 0)
 *          Cr AR (12010)                sum_applied             (only if > 0)
 *          Cr Customer Deposits (21210) total_amount - sum_applied  (only if > 0)
 *     Posted via JournalEntryService so it gets sequential je_no + audit.
 *  7. Apply the receipt to each invoice via applyToInvoices (T-3.11):
 *     increments paid_amount and recomputes status (PAID / PARTIAL_PAID).
 *  8. Flip the receipt to POSTED and link je_id.
 *  9. Emit AuditLog action=POST.
 */
export async function post(
  id: string,
  actor_id: string,
): Promise<ReceiptWithApplications> {
  return db.$transaction(async tx => {
    const existing = await tx.receipt.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('RECEIPT_NOT_DRAFT', {
        id,
        status: existing.status,
      });
    }

    const total = D(existing.total_amount.toString());
    const cardFee = D(existing.card_fee.toString());

    if (cardFee.lt(0) || cardFee.gt(total)) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'card_fee_out_of_range',
        card_fee: cardFee.toFixed(2),
        total_amount: total.toFixed(2),
      });
    }

    const sumApplied = existing.applications.reduce(
      (acc, a) => acc.plus(D(a.applied_amount.toString())),
      D(0),
    );
    if (sumApplied.gt(total)) {
      throw new BusinessRuleError('RECEIPT_OVERAPPLIED', {
        total_amount: total.toFixed(2),
        sum_applied: sumApplied.toFixed(2),
      });
    }

    // Re-check each invoice balance under transaction (POSTED/PARTIAL_PAID).
    for (const app of existing.applications) {
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: app.invoice_id },
        select: {
          customer_id: true,
          status: true,
          total: true,
          paid_amount: true,
        },
      });
      if (!invoice) {
        throw new BusinessRuleError('NOT_FOUND', { invoice_id: app.invoice_id });
      }
      if (invoice.customer_id !== existing.customer_id) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'invoice_customer_mismatch',
          invoice_id: app.invoice_id,
        });
      }
      if (invoice.status !== 'POSTED' && invoice.status !== 'PARTIAL_PAID') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'invoice_not_collectible',
          invoice_id: app.invoice_id,
          status: invoice.status,
        });
      }
      const balance = D(invoice.total.toString()).minus(D(invoice.paid_amount.toString()));
      if (D(app.applied_amount.toString()).gt(balance)) {
        throw new BusinessRuleError('RECEIPT_OVERAPPLIED', {
          invoice_id: app.invoice_id,
          invoice_balance: balance.toFixed(2),
          applied_amount: app.applied_amount.toString(),
        });
      }
    }

    // Resolve cash/bank GL account for the debit side.
    let cashAccount: string;
    if (existing.payment_method === 'CASH') {
      cashAccount = CASH_ACCOUNT;
    } else {
      if (!existing.bank_account_id) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'bank_account_id_required_for_non_cash',
        });
      }
      const bank = await tx.bankAccount.findUnique({
        where: { id: existing.bank_account_id },
        select: { gl_account_code: true },
      });
      if (!bank) {
        throw new BusinessRuleError('NOT_FOUND', {
          bank_account_id: existing.bank_account_id,
        });
      }
      cashAccount = bank.gl_account_code;
    }

    const period_code = derivePeriodCode(existing.receipt_date);
    await assertOpen(tx, period_code);

    const year = parseInt(period_code.slice(0, 4), 10);
    const receipt_no = await nextDocNo(tx, 'RCT', year, 'receipts', 'receipt_no');

    const cashDebit = total.minus(cardFee);
    const advanceCredit = total.minus(sumApplied);

    const jeLines: CreateJELineInput[] = [];
    if (cashDebit.gt(0)) {
      jeLines.push({
        account_code: cashAccount,
        branch_code: existing.branch_code,
        debit: cashDebit.toFixed(2),
        description: `Cash/Bank ${receipt_no}`,
      });
    }
    if (cardFee.gt(0)) {
      jeLines.push({
        account_code: CARD_FEE_ACCOUNT,
        branch_code: existing.branch_code,
        debit: cardFee.toFixed(2),
        description: `Card fee ${receipt_no}`,
      });
    }
    if (sumApplied.gt(0)) {
      jeLines.push({
        account_code: AR_ACCOUNT,
        branch_code: existing.branch_code,
        credit: sumApplied.toFixed(2),
        description: `AR settlement ${receipt_no}`,
      });
    }
    if (advanceCredit.gt(0)) {
      jeLines.push({
        account_code: CUSTOMER_DEPOSITS_ACCOUNT,
        branch_code: existing.branch_code,
        credit: advanceCredit.toFixed(2),
        description: `Customer deposit ${receipt_no}`,
      });
    }

    const jeDraft = await jeCreateDraft(
      tx,
      {
        entry_date: existing.receipt_date,
        branch_code: existing.branch_code,
        description: `Receipt ${receipt_no}`,
        source_type: 'RECEIPT',
        source_id: existing.id,
        lines: jeLines,
      },
      actor_id,
    );
    const postedJe = await jePostInTx(tx, jeDraft.id, actor_id);

    await applyToInvoices(
      tx,
      existing.id,
      existing.applications.map(a => ({
        invoice_id: a.invoice_id,
        applied_amount: a.applied_amount.toString(),
      })),
    );

    const updated = await tx.receipt.update({
      where: { id },
      data: {
        receipt_no,
        status: 'POSTED',
        je_id: postedJe.id,
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'POST',
      entity_type: 'Receipt',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

/**
 * Void a POSTED Receipt (spec T-3.13, spec 02 §5.2, §5.3).
 *
 * Within a single transaction:
 *  1. Load the receipt. ALREADY_VOIDED if status=VOID; RECEIPT_NOT_DRAFT-style
 *     guard for any non-POSTED state (mirrors voidInvoice's pattern).
 *  2. Void the linked JE via JournalEntryService.voidEntryInTx — creates a
 *     reversal JE and flips the original JE to VOID. The period-open check
 *     (§5.4) and JE-side audit happen there.
 *  3. Cascade-unapply the receipt's applications via unapplyFromInvoices
 *     (T-3.11): each invoice's paid_amount is decremented and its status is
 *     reset to PARTIAL_PAID or POSTED depending on remaining paid balance.
 *  4. Set receipt status=VOID, voided_at, voided_by_id, void_reason.
 *  5. AuditLog action=VOID.
 *
 * Named `voidReceipt` because `void` is a TypeScript reserved word.
 */
export async function voidReceipt(
  id: string,
  actor_id: string,
  reason: string,
): Promise<ReceiptWithApplications> {
  return db.$transaction(async tx => {
    const existing = await tx.receipt.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }

    if (existing.status === 'VOID') {
      throw new BusinessRuleError('ALREADY_VOIDED', { id });
    }

    if (existing.status !== 'POSTED') {
      throw new BusinessRuleError('RECEIPT_NOT_DRAFT', {
        id,
        status: existing.status,
        reason: 'only_posted_can_be_voided',
      });
    }

    if (!existing.je_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id,
        reason: 'receipt_missing_je_link',
      });
    }

    await jeVoidEntryInTx(tx, existing.je_id, actor_id, reason);

    await unapplyFromInvoices(tx, existing.id);

    const updated = await tx.receipt.update({
      where: { id },
      data: {
        status: 'VOID',
        voided_at: new Date(),
        voided_by_id: actor_id,
        void_reason: reason,
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'VOID',
      entity_type: 'Receipt',
      entity_id: id,
      before: existing,
      after: updated,
      reason,
    });

    return updated;
  });
}

export type ReceiptFull = Receipt & {
  applications: ReceiptApplication[];
  customer: Customer;
  bank_account: BankAccount | null;
};

export async function listReceipts(params: {
  customer_id?: string;
  status?: string;
  period?: string;
  payment_method?: string;
  branch?: string;
  date_from?: string;
  date_to?: string;
  q?: string;
  limit: number;
  offset: number;
}): Promise<{ items: ReceiptFull[]; total: number }> {
  const where: Prisma.ReceiptWhereInput = {};

  if (params.customer_id) where.customer_id = params.customer_id;
  if (params.status) where.status = params.status as DocStatus;
  if (params.payment_method) where.payment_method = params.payment_method as PaymentMethod;
  if (params.branch) where.branch_code = params.branch;

  if (params.period) {
    const [y, m] = params.period.split('-').map(Number);
    where.receipt_date = {
      gte: new Date(`${y}-${String(m).padStart(2, '0')}-01`),
      lt: new Date(y, m, 1),
    };
  } else if (params.date_from || params.date_to) {
    where.receipt_date = {};
    if (params.date_from) (where.receipt_date as Prisma.DateTimeFilter).gte = new Date(params.date_from);
    if (params.date_to) (where.receipt_date as Prisma.DateTimeFilter).lte = new Date(params.date_to);
  }

  if (params.q) {
    where.OR = [
      { receipt_no: { contains: params.q, mode: 'insensitive' } },
      { customer: { name: { contains: params.q, mode: 'insensitive' } } },
      { slip_ref: { contains: params.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    db.receipt.count({ where }),
    db.receipt.findMany({
      where,
      include: { applications: true, customer: true, bank_account: true },
      orderBy: { receipt_date: 'desc' },
      skip: params.offset,
      take: params.limit,
    }),
  ]);

  return { items, total };
}

export async function getReceipt(id: string): Promise<ReceiptFull | null> {
  return db.receipt.findUnique({
    where: { id },
    include: { applications: true, customer: true, bank_account: true },
  });
}

export async function updateDraft(
  id: string,
  input: UpdateReceiptBodyType,
  actor_id?: string,
): Promise<ReceiptWithApplications> {
  return db.$transaction(async tx => {
    const existing = await tx.receipt.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('RECEIPT_NOT_DRAFT', { id, status: existing.status });
    }

    const newMethod = input.payment_method ?? existing.payment_method;
    const newBankAccountId = input.bank_account_id !== undefined
      ? input.bank_account_id
      : existing.bank_account_id;

    if (newMethod !== 'CASH' && !newBankAccountId) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'bank_account_id_required_for_non_cash',
      });
    }
    if (newBankAccountId) {
      const bank = await tx.bankAccount.findUnique({ where: { id: newBankAccountId } });
      if (!bank) {
        throw new BusinessRuleError('NOT_FOUND', { bank_account_id: newBankAccountId });
      }
    }

    const updated = await tx.receipt.update({
      where: { id },
      data: {
        ...(input.receipt_date !== undefined && { receipt_date: new Date(input.receipt_date) }),
        ...(input.payment_method !== undefined && { payment_method: input.payment_method }),
        ...(input.bank_account_id !== undefined && { bank_account_id: input.bank_account_id }),
        ...(input.card_fee !== undefined && { card_fee: D(input.card_fee).toFixed(2) }),
        ...(input.slip_ref !== undefined && { slip_ref: input.slip_ref }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'Receipt',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

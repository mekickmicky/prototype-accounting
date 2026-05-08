import type { Payment, PaymentApplication, Prisma } from '@prisma/client';
import { D, lineNet, lineVat, WHT_THRESHOLD } from '@wind-acc/shared';
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
import { applyToBills, unapplyFromBills } from './payment-application';
import type { BillApplicationInput } from './payment-application';

const AP_ACCOUNT = '21010';
const CASH_ACCOUNT = '11010';
const WHT_PAYABLE_ACCOUNT = '21120';

type Tx = Prisma.TransactionClient;

export type PaymentWithApplications = Payment & { applications: PaymentApplication[] };

// payment_no is NOT NULL UNIQUE in DB. Drafts use a placeholder until
// T-4.11 (post) replaces it with the sequential PAY-{year}-{NNNN} number.
function makeDraftPaymentNo(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}

export interface CreatePaymentApplicationInput {
  bill_id: string;
  applied_amount: string;
}

export interface CreatePaymentInput {
  vendor_id: string;
  branch_code: string;
  payment_date: string;
  total_amount: string;
  payment_method: string;
  bank_account_id?: string | null;
  cheque_no?: string | null;
  notes?: string | null;
  applications: CreatePaymentApplicationInput[];
}

/**
 * Validate a payment draft input (spec T-4.10, spec 05 §POST /payments).
 *
 * Checks:
 *  - vendor exists and is not deleted
 *  - bank_account_id required for non-CASH payment methods
 *  - bank_account exists if provided
 *  - sum of applied_amounts <= total_amount (PAYMENT_OVERAPPLIED)
 *  - each bill: belongs to same vendor, status POSTED or PARTIAL_PAID,
 *    applied_amount <= bill's remaining net_payable balance
 */
async function validateDraftInput(tx: Tx, input: CreatePaymentInput): Promise<void> {
  const vendor = await tx.vendor.findFirst({
    where: { id: input.vendor_id, deleted_at: null },
  });
  if (!vendor) {
    throw new BusinessRuleError('NOT_FOUND', { vendor_id: input.vendor_id });
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
    throw new BusinessRuleError('PAYMENT_OVERAPPLIED', {
      total_amount: total.toFixed(2),
      sum_applied: sumApplied.toFixed(2),
    });
  }

  for (const app of input.applications) {
    const bill = await tx.bill.findUnique({
      where: { id: app.bill_id },
    });
    if (!bill) {
      throw new BusinessRuleError('NOT_FOUND', { bill_id: app.bill_id });
    }
    if (bill.vendor_id !== input.vendor_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'bill_vendor_mismatch',
        bill_id: app.bill_id,
      });
    }
    if (bill.status !== 'POSTED' && bill.status !== 'PARTIAL_PAID') {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'bill_not_payable',
        bill_id: app.bill_id,
        status: bill.status,
      });
    }
    // Net payable = total - withholding (WHT was pre-deducted at bill post).
    const netPayable = D(bill.total.toString()).minus(D(bill.withholding_amount.toString()));
    const billBalance = netPayable.minus(D(bill.paid_amount.toString()));
    if (D(app.applied_amount).gt(billBalance)) {
      throw new BusinessRuleError('PAYMENT_OVERAPPLIED', {
        bill_id: app.bill_id,
        bill_balance: billBalance.toFixed(2),
        applied_amount: app.applied_amount,
      });
    }
  }
}

/**
 * Create a DRAFT Payment with optional bill applications (spec T-4.10).
 *
 * Validates:
 *  - vendor exists and is not deleted
 *  - payment_method != CASH requires bank_account_id
 *  - sum of applications[].applied_amount <= total_amount (PAYMENT_OVERAPPLIED)
 *  - each application's bill: same vendor_id, status POSTED or PARTIAL_PAID,
 *    applied_amount <= bill's net_payable balance (total - withholding - paid)
 *
 * withholding_total is set to 0 at draft time; it is recomputed proportionally
 * from the applied bills in PaymentService.post (T-4.11).
 * No payment_no is assigned yet — that happens on post.
 */
export async function createDraft(
  input: CreatePaymentInput,
  actor_id?: string,
): Promise<PaymentWithApplications> {
  return db.$transaction(async (tx: Tx) => {
    await validateDraftInput(tx, input);

    const payment = await tx.payment.create({
      data: {
        payment_no: makeDraftPaymentNo(),
        vendor_id: input.vendor_id,
        branch_code: input.branch_code,
        payment_date: new Date(input.payment_date),
        total_amount: D(input.total_amount).toFixed(2),
        withholding_total: '0.00',
        net_paid: D(input.total_amount).toFixed(2),
        payment_method: input.payment_method as import('@prisma/client').PaymentMethod,
        bank_account_id: input.bank_account_id ?? null,
        cheque_no: input.cheque_no ?? null,
        notes: input.notes ?? null,
        status: 'DRAFT',
        applications: {
          create: input.applications.map(a => ({
            bill_id: a.bill_id,
            applied_amount: D(a.applied_amount).toFixed(2),
          })),
        },
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'Payment',
      entity_id: payment.id,
      after: payment,
    });

    return payment;
  });
}

/**
 * Post a DRAFT Payment (spec T-4.11, spec 02 §4.6, spec 03 §5.3, §5.4).
 *
 * Within a single transaction:
 *  1. Load payment with applications. Reject non-DRAFT (PAYMENT_NOT_DRAFT).
 *  2. Re-validate (defense in depth): vendor exists, sum_applied ≤ total,
 *     each bill belongs to vendor + is POSTED/PARTIAL_PAID, applied_amount
 *     ≤ remaining net_payable balance.
 *  3. Resolve cash/bank GL account (CASH→11010 else bank.gl_account_code).
 *  4. Assert period derived from payment_date is OPEN; allocate `payment_no`.
 *  5. Compute proportional WHT certificates per applied bill+line:
 *       proportion = applied_amount / netPayable
 *       gross_portion = line_pre_vat_net * proportion
 *       wht_portion   = gross_portion * (line.withholding_rate / 100)
 *     Apply WHT_THRESHOLD (1,000 THB) per vendor per payment to the
 *     "incremental" path only — bills that already booked WHT at post
 *     keep their cert regardless (spec 03 §5.2).
 *  6. Build the balanced JE per spec §4.6 / §5.3:
 *     Standard path (bill.withholding_amount > 0 — already booked at post):
 *       Dr AP (21010)        sum_applied
 *          Cr Cash/Bank      sum_applied
 *     Incremental path (bill.withholding_amount == 0 — rare, e.g. bill below
 *     threshold but combined payment crosses it):
 *       Dr AP (21010)        sum_applied
 *          Cr Cash/Bank      sum_applied - incremental_wht
 *          Cr WHT Payable    incremental_wht
 *     Mixed payments (some bills withheld, some not) blend both: the
 *     incremental_wht is summed only over not-yet-withheld bills.
 *  7. Insert one WithholdingRecord per cert with a sequential cert_no via
 *     `nextDocNo('WHT', ...)`. Each record links payment_id, bill_id, vendor.
 *  8. Apply the payment to bills via applyToBills (mutates paid_amount/status).
 *  9. Set payment status=POSTED, replace draft payment_no, link je_id, stamp
 *     withholding_total + net_paid.
 * 10. Emit AuditLog action=POST.
 *
 * Note (spec 03 §5.3): when the bill already booked WHT at post, WHT Payable
 * does NOT move at payment time — the cert is still issued (it accompanies
 * the actual payment to the vendor) but the GL liability was already accrued.
 */
export async function post(
  id: string,
  actor_id: string,
): Promise<PaymentWithApplications> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.payment.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('PAYMENT_NOT_DRAFT', {
        id,
        status: existing.status,
      });
    }

    const vendor = await tx.vendor.findFirst({
      where: { id: existing.vendor_id, deleted_at: null },
    });
    if (!vendor) {
      throw new BusinessRuleError('NOT_FOUND', { vendor_id: existing.vendor_id });
    }

    const total = D(existing.total_amount.toString());
    const sumApplied = existing.applications.reduce(
      (acc, a) => acc.plus(D(a.applied_amount.toString())),
      D(0),
    );
    if (sumApplied.gt(total)) {
      throw new BusinessRuleError('PAYMENT_OVERAPPLIED', {
        total_amount: total.toFixed(2),
        sum_applied: sumApplied.toFixed(2),
      });
    }

    const bills = await tx.bill.findMany({
      where: { id: { in: existing.applications.map(a => a.bill_id) } },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    const billMap = new Map(bills.map(b => [b.id, b]));

    for (const app of existing.applications) {
      const bill = billMap.get(app.bill_id);
      if (!bill) {
        throw new BusinessRuleError('NOT_FOUND', { bill_id: app.bill_id });
      }
      if (bill.vendor_id !== existing.vendor_id) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'bill_vendor_mismatch',
          bill_id: bill.id,
        });
      }
      if (bill.status !== 'POSTED' && bill.status !== 'PARTIAL_PAID') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'bill_not_payable',
          bill_id: bill.id,
          status: bill.status,
        });
      }
      const netPayable = D(bill.total.toString()).minus(
        D(bill.withholding_amount.toString()),
      );
      const balance = netPayable.minus(D(bill.paid_amount.toString()));
      if (D(app.applied_amount.toString()).gt(balance)) {
        throw new BusinessRuleError('PAYMENT_OVERAPPLIED', {
          bill_id: bill.id,
          bill_balance: balance.toFixed(2),
          applied_amount: app.applied_amount.toString(),
        });
      }
    }

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

    const period_code = derivePeriodCode(existing.payment_date);
    await assertOpen(tx, period_code);

    const year = parseInt(period_code.slice(0, 4), 10);
    const payment_no = await nextDocNo(tx, 'PAY', year, 'payments', 'payment_no');

    // Threshold check (spec 03 §5.2): if total payment to vendor is below
    // 1,000 THB AND the bill never booked WHT, suppress the incremental cert.
    // Bills that already booked WHT at post keep their cert regardless — the
    // bill-level threshold was evaluated at bill post time.
    const thresholdSatisfied = sumApplied.gte(WHT_THRESHOLD);

    interface CertDraft {
      bill_id: string;
      wht_type: string;
      wht_rate: string;
      gross_amount: string;
      wht_amount: string;
    }
    const certDrafts: CertDraft[] = [];
    let incrementalWhtTotal = D(0);
    let totalCertWht = D(0);

    for (const app of existing.applications) {
      const bill = billMap.get(app.bill_id)!;
      const billTotal = D(bill.total.toString());
      const billWht = D(bill.withholding_amount.toString());
      const netPayable = billTotal.minus(billWht);
      if (netPayable.lte(0)) continue;
      const applied = D(app.applied_amount.toString());
      const proportion = applied.div(netPayable);
      const billWasWithheld = billWht.gt(0);

      for (const l of bill.lines) {
        const lineRate = D(l.withholding_rate.toString());
        if (lineRate.lte(0) || !l.withholding_type) continue;

        const lineAmount = lineNet({
          qty: l.qty.toString(),
          unit_price: l.unit_price.toString(),
        });
        const split = lineVat({
          net: lineAmount,
          vat_rate: l.vat_rate.toString(),
          vat_inclusive: bill.vat_inclusive,
        });
        const grossPortion = split.net.times(proportion).toDecimalPlaces(2);
        const whtPortion = grossPortion
          .times(lineRate.div(100))
          .toDecimalPlaces(2);
        if (whtPortion.lte(0)) continue;
        // Suppress only when bill never withheld AND threshold not met.
        if (!billWasWithheld && !thresholdSatisfied) continue;

        certDrafts.push({
          bill_id: bill.id,
          wht_type: l.withholding_type,
          wht_rate: lineRate.toFixed(2),
          gross_amount: grossPortion.toFixed(2),
          wht_amount: whtPortion.toFixed(2),
        });
        totalCertWht = totalCertWht.plus(whtPortion);
        if (!billWasWithheld) {
          incrementalWhtTotal = incrementalWhtTotal.plus(whtPortion);
        }
      }
    }

    const cashCredit = sumApplied.minus(incrementalWhtTotal);
    const jeLines: CreateJELineInput[] = [
      {
        account_code: AP_ACCOUNT,
        branch_code: existing.branch_code,
        debit: sumApplied.toFixed(2),
        description: `AP settlement ${payment_no}`,
      },
      {
        account_code: cashAccount,
        branch_code: existing.branch_code,
        credit: cashCredit.toFixed(2),
        description: `Cash/Bank ${payment_no}`,
      },
    ];
    if (incrementalWhtTotal.gt(0)) {
      jeLines.push({
        account_code: WHT_PAYABLE_ACCOUNT,
        branch_code: existing.branch_code,
        credit: incrementalWhtTotal.toFixed(2),
        description: `WHT payable ${payment_no}`,
      });
    }

    const jeDraft = await jeCreateDraft(
      tx,
      {
        entry_date: existing.payment_date,
        branch_code: existing.branch_code,
        description: `Payment ${payment_no}`,
        source_type: 'PAYMENT',
        source_id: existing.id,
        lines: jeLines,
      },
      actor_id,
    );
    const postedJe = await jePostInTx(tx, jeDraft.id, actor_id);

    for (const c of certDrafts) {
      const cert_no = await nextDocNo(
        tx,
        'WHT',
        year,
        'withholding_records',
        'cert_no',
      );
      await tx.withholdingRecord.create({
        data: {
          payment_id: existing.id,
          bill_id: c.bill_id,
          vendor_id: vendor.id,
          vendor_tax_id: vendor.tax_id ?? null,
          wht_type: c.wht_type,
          wht_rate: c.wht_rate,
          gross_amount: c.gross_amount,
          wht_amount: c.wht_amount,
          payment_date: existing.payment_date,
          period_code,
          cert_no,
        },
      });
    }

    await applyToBills(
      tx,
      existing.id,
      existing.applications.map(a => ({
        bill_id: a.bill_id,
        applied_amount: a.applied_amount.toString(),
      })),
    );

    const updated = await tx.payment.update({
      where: { id },
      data: {
        payment_no,
        status: 'POSTED',
        je_id: postedJe.id,
        withholding_total: totalCertWht.toFixed(2),
        net_paid: cashCredit.toFixed(2),
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'POST',
      entity_type: 'Payment',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

/**
 * Void a POSTED Payment (spec T-4.12, spec 02 §5.2, §5.3).
 *
 * Within a single transaction:
 *  1. Load the payment. ALREADY_VOIDED if status=VOID; reject any non-POSTED
 *     state — only posted payments can be voided.
 *  2. Void the linked JE via JournalEntryService.voidEntryInTx — creates a
 *     reversal JE and flips the original JE to VOID. The period-open check
 *     (§5.4) and JE-side audit happen there.
 *  3. Mark every associated WithholdingRecord status=VOID with voided_at.
 *     Cert numbers stay allocated (cert_no is sequential per year, gaps via
 *     void are expected — never deletion).
 *  4. Cascade-unapply the payment's applications via unapplyFromBills:
 *     each bill's paid_amount is decremented and status reset to
 *     POSTED/PARTIAL_PAID/PAID based on remaining paid balance.
 *  5. Set payment status=VOID, voided_at, voided_by_id, void_reason.
 *  6. AuditLog action=VOID.
 *
 * Named `voidPayment` because `void` is a TypeScript reserved word.
 */
export async function voidPayment(
  id: string,
  actor_id: string,
  reason: string,
): Promise<PaymentWithApplications> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.payment.findUnique({
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
      throw new BusinessRuleError('PAYMENT_NOT_DRAFT', {
        id,
        status: existing.status,
        reason: 'only_posted_can_be_voided',
      });
    }

    if (!existing.je_id) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id,
        reason: 'payment_missing_je_link',
      });
    }

    await jeVoidEntryInTx(tx, existing.je_id, actor_id, reason);

    await tx.withholdingRecord.updateMany({
      where: { payment_id: existing.id, status: 'ACTIVE' },
      data: { status: 'VOID', voided_at: new Date() },
    });

    await unapplyFromBills(tx, existing.id);

    const updated = await tx.payment.update({
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
      entity_type: 'Payment',
      entity_id: id,
      before: existing,
      after: updated,
      reason,
    });

    return updated;
  });
}

export interface UpdatePaymentInput {
  payment_date?: string;
  payment_method?: string;
  bank_account_id?: string | null;
  cheque_no?: string | null;
  notes?: string | null;
}

/**
 * Update a DRAFT Payment's header fields (spec T-4.15).
 * Only allowed while status=DRAFT. Does not touch applications or amounts.
 */
export async function updateDraft(
  id: string,
  input: UpdatePaymentInput,
  actor_id?: string,
): Promise<PaymentWithApplications> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.payment.findUnique({
      where: { id },
      include: { applications: true },
    });
    if (!existing) {
      throw new BusinessRuleError('NOT_FOUND', { id });
    }
    if (existing.status !== 'DRAFT') {
      throw new BusinessRuleError('PAYMENT_NOT_DRAFT', { id, status: existing.status });
    }

    const effectiveMethod = (input.payment_method ?? existing.payment_method) as string;
    const effectiveBankId =
      input.bank_account_id !== undefined ? input.bank_account_id : existing.bank_account_id;

    if (effectiveMethod !== 'CASH' && !effectiveBankId) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'bank_account_id_required_for_non_cash',
      });
    }

    if (effectiveBankId) {
      const bankAccount = await tx.bankAccount.findUnique({ where: { id: effectiveBankId } });
      if (!bankAccount) {
        throw new BusinessRuleError('NOT_FOUND', { bank_account_id: effectiveBankId });
      }
    }

    const updated = await tx.payment.update({
      where: { id },
      data: {
        ...(input.payment_date !== undefined && { payment_date: new Date(input.payment_date) }),
        ...(input.payment_method !== undefined && {
          payment_method: input.payment_method as import('@prisma/client').PaymentMethod,
        }),
        ...(input.bank_account_id !== undefined && { bank_account_id: input.bank_account_id }),
        ...(input.cheque_no !== undefined && { cheque_no: input.cheque_no }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: { applications: true },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'Payment',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

// Re-export apply/unapply so T-4.11 and T-4.12 can import from one place.
export { applyToBills, unapplyFromBills } from './payment-application';
export type { BillApplicationInput };

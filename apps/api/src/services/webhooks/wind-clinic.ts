import { D } from '@wind-acc/shared';
import type { VisitCompletedPayload } from '@wind-acc/shared';
import { prisma } from '../../lib/prisma';
import { BusinessRuleError } from '../../lib/errors';
import {
  getAccountMap,
  mapServiceToAccount,
  mapProductToAccount,
} from '../../lib/account-map';
import * as salesInvoice from '../sales-invoice';
import * as receipt from '../receipt';
import { postCommissionAccrual } from './doctor-commission';

const SYSTEM_ACTOR_ID = 'SYSTEM';
const ROUNDING_TOLERANCE = '0.02';

export interface VisitCompletedResult {
  invoice_no: string;
  tax_invoice_no: string | null;
  receipt_no: string;
  je_no: string;
  receipt_je_no: string;
  commission_je_nos: string[];
}

export interface HandleVisitCompletedReturn {
  result: VisitCompletedResult;
  replayed: boolean;
}

/**
 * Pre-flight payload validation that must run before any DB writes.
 * Mirrors spec 09 §1 "Edge cases" + the T-8.5 spec checklist step 1.
 */
function validatePayload(payload: VisitCompletedPayload): void {
  const cardFee = D(payload.payment.card_fee ?? '0');
  if (payload.payment.method === 'CASH' && cardFee.gt(0)) {
    throw new BusinessRuleError('CARD_FEE_ON_CASH', {
      method: payload.payment.method,
      card_fee: cardFee.toFixed(2),
    });
  }

  if (payload.payment.method !== 'CASH' && !payload.payment.bank_account_code) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'bank_account_code_required_for_non_cash',
    });
  }

  // Sum of (qty * unit_price - discount) per item must equal payment.amount - card_fee
  // within ROUNDING_TOLERANCE. Items are vat-inclusive grosses (clinic always sends vat_inclusive=true).
  const itemSum = payload.items.reduce((acc, item) => {
    const lineGross = D(item.qty)
      .times(item.unit_price)
      .minus(item.discount ?? '0');
    return acc.plus(lineGross);
  }, D(0));

  const expectedNetCash = D(payload.payment.amount).minus(cardFee);
  const diff = itemSum.minus(expectedNetCash).abs();
  if (diff.gt(ROUNDING_TOLERANCE)) {
    throw new BusinessRuleError('EXPLICIT_TOTAL_MISMATCH', {
      item_sum: itemSum.toFixed(2),
      payment_amount: D(payload.payment.amount).toFixed(2),
      card_fee: cardFee.toFixed(2),
      diff: diff.toFixed(2),
      tolerance: ROUNDING_TOLERANCE,
    });
  }
}

async function findOrCreateCustomer(payload: VisitCompletedPayload) {
  const code = `WIND-${payload.patient_id}`;
  const existing = await prisma.customer.findUnique({ where: { code } });
  if (existing) return existing;

  return prisma.customer.create({
    data: {
      code,
      name: payload.patient_name,
      name_th: payload.patient_name_th ?? null,
      tax_id: payload.patient_tax_id ?? null,
      address: payload.patient_address ?? null,
      phone: payload.patient_phone ?? null,
      branch_office: '00000',
    },
  });
}

/**
 * Process a wind-clinic visit.completed webhook: idempotent across retries on
 * the same visit_id. Creates Customer (if new), posts a SalesInvoice + Receipt
 * (fully applied), and posts one DOCTOR_COMMISSION JE per (doctor, visit) pair.
 *
 * Note on transactions: each downstream service (SalesInvoiceService,
 * ReceiptService, JournalEntryService) opens its own DB transaction. We rely on
 * (a) the WebhookProcessed record being persisted only after every step
 * succeeds, and (b) Customer lookup by stable code (`WIND-{patient_id}`) so
 * partial-failure retries don't duplicate the customer. If a retry happens
 * after invoice creation but before idempotency persistence, downstream
 * cleanup is the operator's responsibility — wind-clinic surfaces this as a
 * 5xx and queues for manual review.
 */
export async function handleVisitCompleted(
  payload: VisitCompletedPayload,
  actorId: string = SYSTEM_ACTOR_ID,
): Promise<HandleVisitCompletedReturn> {
  validatePayload(payload);

  const replayed = await prisma.webhookProcessed.findUnique({
    where: {
      source_idempotency_key: {
        source: 'wind-clinic',
        idempotency_key: payload.visit_id,
      },
    },
  });
  if (replayed) {
    return {
      result: replayed.result_json as unknown as VisitCompletedResult,
      replayed: true,
    };
  }

  const customer = await findOrCreateCustomer(payload);
  const accountMap = await getAccountMap(prisma);

  // Build invoice line bodies. VAT rate is always 7 for clinic services/products.
  const invoiceLines = payload.items.map(item => {
    const revenueAccount =
      item.type === 'service'
        ? mapServiceToAccount(item.code, accountMap)
        : mapProductToAccount(item.code, accountMap);
    return {
      description: item.name_th ?? item.name,
      service_code: item.type === 'service' ? item.code : undefined,
      product_code: item.type === 'product' ? item.code : undefined,
      qty: D(item.qty).toString(),
      unit_price: D(item.unit_price).toFixed(2),
      discount: D(item.discount ?? '0').toFixed(2),
      vat_rate: '7',
      revenue_account_code: revenueAccount,
    };
  });

  const issueDate = payload.visit_date.slice(0, 10);

  const draftInvoice = await salesInvoice.createDraft(
    {
      customer_id: customer.id,
      branch_code: payload.branch_code,
      issue_date: issueDate,
      due_date: issueDate,
      is_tax_invoice: payload.request_full_tax_invoice,
      vat_inclusive: true,
      notes: payload.notes,
      source_type: 'WIND_VISIT',
      source_ref: payload.visit_id,
      lines: invoiceLines,
    },
    actorId,
  );
  const postedInvoice = await salesInvoice.post(draftInvoice.id, actorId);

  // Resolve bank_account_id from the payload code (BankAccount.code, not GL code).
  let bankAccountId: string | undefined;
  if (payload.payment.method !== 'CASH') {
    const bank = await prisma.bankAccount.findUnique({
      where: { code: payload.payment.bank_account_code! },
    });
    if (!bank) {
      throw new BusinessRuleError('NOT_FOUND', {
        bank_account_code: payload.payment.bank_account_code,
      });
    }
    bankAccountId = bank.id;
  }

  const draftReceipt = await receipt.createDraft(
    {
      customer_id: customer.id,
      branch_code: payload.branch_code,
      receipt_date: issueDate,
      total_amount: D(postedInvoice.total.toString()).toFixed(2),
      payment_method: payload.payment.method,
      bank_account_id: bankAccountId,
      card_fee: D(payload.payment.card_fee ?? '0').toFixed(2),
      slip_ref: payload.payment.slip_ref,
      notes: payload.notes,
      applications: [
        {
          invoice_id: postedInvoice.id,
          applied_amount: D(postedInvoice.total.toString()).toFixed(2),
        },
      ],
    },
    actorId,
  );
  const postedReceipt = await receipt.post(draftReceipt.id, actorId);

  // Sum commissions by doctor across items so we post one JE per (doctor, visit).
  const commissionByDoctor = new Map<string, ReturnType<typeof D>>();
  for (const item of payload.items) {
    if (!item.doctor_id || !item.doctor_commission_pct) continue;
    const base = D(item.qty)
      .times(item.unit_price)
      .minus(item.discount ?? '0');
    const commission = base.times(item.doctor_commission_pct).div(100);
    if (commission.lte(0)) continue;
    const prev = commissionByDoctor.get(item.doctor_id) ?? D(0);
    commissionByDoctor.set(item.doctor_id, prev.plus(commission));
  }

  const commissionJeNos: string[] = [];
  for (const [doctorId, amount] of commissionByDoctor) {
    await prisma.$transaction(async tx => {
      await postCommissionAccrual(tx, {
        doctor_id: doctorId,
        amount,
        branch_code: payload.branch_code,
        date: new Date(issueDate),
        source_ref: payload.visit_id,
      });
    });
    const commissionJe = await prisma.journalEntry.findFirst({
      where: {
        source_type: 'DOCTOR_COMMISSION',
        source_id: `${payload.visit_id}-${doctorId}`,
      },
      orderBy: { created_at: 'desc' },
    });
    if (commissionJe) commissionJeNos.push(commissionJe.je_no);
  }

  const [invoiceJe, receiptJe] = await Promise.all([
    postedInvoice.je_id
      ? prisma.journalEntry.findUnique({ where: { id: postedInvoice.je_id } })
      : null,
    postedReceipt.je_id
      ? prisma.journalEntry.findUnique({ where: { id: postedReceipt.je_id } })
      : null,
  ]);

  const result: VisitCompletedResult = {
    invoice_no: postedInvoice.invoice_no,
    tax_invoice_no: postedInvoice.tax_invoice_no,
    receipt_no: postedReceipt.receipt_no,
    je_no: invoiceJe?.je_no ?? '',
    receipt_je_no: receiptJe?.je_no ?? '',
    commission_je_nos: commissionJeNos,
  };

  await prisma.webhookProcessed.create({
    data: {
      source: 'wind-clinic',
      idempotency_key: payload.visit_id,
      result_json: result as unknown as Record<string, unknown>,
    },
  });

  return { result, replayed: false };
}

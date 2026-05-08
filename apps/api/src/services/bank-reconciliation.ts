import type { BankTransaction, Prisma } from '@prisma/client';
import { D, type Decimal } from '@wind-acc/shared';
import { logAuditEvent } from './audit-log';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';
import { createDraft, postInTx, type CreateJEInput, type JournalEntryWithLines } from './journal-entry';
import { suggestMatches, type MatchSuggestion } from '../lib/bank/auto-match';

type Tx = Prisma.TransactionClient;

export type DocumentType = 'RECEIPT' | 'PAYMENT';
export type ReconcileLinkType = DocumentType | 'BANK_FEE' | 'IGNORED';
export type BankTxnStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';

const AMOUNT_TOLERANCE = D('0.01');

function deriveStatus(txn: {
  reconciled_with_id: string | null;
  reconciled_with_type: string | null;
}): BankTxnStatus {
  if (txn.reconciled_with_type === 'IGNORED') return 'IGNORED';
  if (txn.reconciled_with_id !== null && txn.reconciled_with_type !== null) return 'MATCHED';
  return 'UNMATCHED';
}

async function loadBankTxn(tx: Tx, bank_txn_id: string): Promise<BankTransaction> {
  const row = await tx.bankTransaction.findUnique({ where: { id: bank_txn_id } });
  if (!row) throw new BusinessRuleError('NOT_FOUND', { entity: 'BankTransaction', id: bank_txn_id });
  return row;
}

function txnAmountAndDirection(txn: { debit: unknown; credit: unknown }): {
  direction: 'IN' | 'OUT';
  amount: Decimal;
} {
  const debit = D(String(txn.debit));
  const credit = D(String(txn.credit));
  if (credit.gt(debit)) return { direction: 'IN', amount: credit };
  if (debit.gt(credit)) return { direction: 'OUT', amount: debit };
  throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'bank_txn_zero_amount' });
}

/**
 * Match a bank transaction to a Receipt or Payment (spec 02 §8.3).
 *
 * Validates the document exists, is POSTED, references the same bank account,
 * has a compatible amount and direction (RECEIPT → bank credit, PAYMENT →
 * bank debit), and is not already linked to another bank txn. Throws
 * ALREADY_MATCHED if the bank txn is not UNMATCHED.
 */
export async function match(
  bank_txn_id: string,
  document_type: DocumentType,
  document_id: string,
  actor_id: string,
  confidence?: number,
): Promise<BankTransaction> {
  return db.$transaction(async (tx: Tx) => {
    const txn = await loadBankTxn(tx, bank_txn_id);
    const status = deriveStatus(txn);
    if (status === 'MATCHED') {
      throw new BusinessRuleError('ALREADY_MATCHED', {
        bank_txn_id,
        reconciled_with_type: txn.reconciled_with_type,
        reconciled_with_id: txn.reconciled_with_id,
      });
    }
    if (status === 'IGNORED') {
      throw new BusinessRuleError('ALREADY_IGNORED', { bank_txn_id });
    }

    const { direction, amount } = txnAmountAndDirection(txn);

    if (document_type === 'RECEIPT') {
      if (direction !== 'IN') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'direction_mismatch',
          expected: 'IN',
          actual: direction,
        });
      }
      const receipt = await tx.receipt.findUnique({ where: { id: document_id } });
      if (!receipt) throw new BusinessRuleError('NOT_FOUND', { entity: 'Receipt', id: document_id });
      if (receipt.status !== 'POSTED') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'document_not_posted',
          status: receipt.status,
        });
      }
      if (receipt.bank_account_id !== txn.bank_account_id) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'bank_account_mismatch',
          document_bank_account_id: receipt.bank_account_id,
          txn_bank_account_id: txn.bank_account_id,
        });
      }
      const docAmount = D(receipt.total_amount.toString());
      if (docAmount.minus(amount).abs().gt(AMOUNT_TOLERANCE)) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'amount_mismatch',
          document_amount: docAmount.toFixed(2),
          txn_amount: amount.toFixed(2),
        });
      }
    } else {
      if (direction !== 'OUT') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'direction_mismatch',
          expected: 'OUT',
          actual: direction,
        });
      }
      const payment = await tx.payment.findUnique({ where: { id: document_id } });
      if (!payment) throw new BusinessRuleError('NOT_FOUND', { entity: 'Payment', id: document_id });
      if (payment.status !== 'POSTED') {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'document_not_posted',
          status: payment.status,
        });
      }
      if (payment.bank_account_id !== txn.bank_account_id) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'bank_account_mismatch',
          document_bank_account_id: payment.bank_account_id,
          txn_bank_account_id: txn.bank_account_id,
        });
      }
      const docAmount = D(payment.net_paid.toString());
      if (docAmount.minus(amount).abs().gt(AMOUNT_TOLERANCE)) {
        throw new BusinessRuleError('VALIDATION_ERROR', {
          reason: 'amount_mismatch',
          document_amount: docAmount.toFixed(2),
          txn_amount: amount.toFixed(2),
        });
      }
    }

    const otherLink = await tx.bankTransaction.findFirst({
      where: {
        reconciled_with_type: document_type,
        reconciled_with_id: document_id,
        NOT: { id: bank_txn_id },
      },
      select: { id: true },
    });
    if (otherLink) {
      throw new BusinessRuleError('ALREADY_MATCHED', {
        bank_txn_id: otherLink.id,
        document_type,
        document_id,
      });
    }

    const updated = await tx.bankTransaction.update({
      where: { id: bank_txn_id },
      data: {
        reconciled_with_type: document_type,
        reconciled_with_id: document_id,
        reconciled_at: new Date(),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'BankTransaction',
      entity_id: bank_txn_id,
      before: txn,
      after: {
        ...updated,
        reconcile_confidence: confidence ?? null,
        operation: 'match',
      },
    });

    return updated;
  });
}

/**
 * Clear a match link, returning the bank txn to UNMATCHED.
 */
export async function unmatch(
  bank_txn_id: string,
  actor_id: string,
  reason: string,
): Promise<BankTransaction> {
  return db.$transaction(async (tx: Tx) => {
    const txn = await loadBankTxn(tx, bank_txn_id);
    const status = deriveStatus(txn);
    if (status !== 'MATCHED') {
      throw new BusinessRuleError('NOT_MATCHED', { bank_txn_id, status });
    }

    const updated = await tx.bankTransaction.update({
      where: { id: bank_txn_id },
      data: {
        reconciled_with_type: null,
        reconciled_with_id: null,
        reconciled_at: null,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'BankTransaction',
      entity_id: bank_txn_id,
      before: txn,
      after: { ...updated, operation: 'unmatch' },
      reason,
    });

    return updated;
  });
}

/**
 * Mark a bank txn as IGNORED (e.g., bank fees auto-debited, internal transfers).
 */
export async function ignoreTxn(
  bank_txn_id: string,
  actor_id: string,
  reason: string,
): Promise<BankTransaction> {
  return db.$transaction(async (tx: Tx) => {
    const txn = await loadBankTxn(tx, bank_txn_id);
    const status = deriveStatus(txn);
    if (status === 'MATCHED') {
      throw new BusinessRuleError('ALREADY_MATCHED', {
        bank_txn_id,
        reconciled_with_type: txn.reconciled_with_type,
        reconciled_with_id: txn.reconciled_with_id,
      });
    }
    if (status === 'IGNORED') {
      throw new BusinessRuleError('ALREADY_IGNORED', { bank_txn_id });
    }

    const updated = await tx.bankTransaction.update({
      where: { id: bank_txn_id },
      data: {
        reconciled_with_type: 'IGNORED',
        reconciled_with_id: null,
        reconciled_at: new Date(),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'BankTransaction',
      entity_id: bank_txn_id,
      before: txn,
      after: { ...updated, operation: 'ignore' },
      reason,
    });

    return updated;
  });
}

/**
 * Create a JE from a bank transaction (e.g., bank fee not yet recorded), post
 * it, and link the bank txn to that JE via reconciled_with_type='BANK_FEE'.
 *
 * Per spec 02 §8.3: "Create JE from this transaction" pre-fills Dr. Bank Fee
 * Expense, Cr. Cash/Bank — but the actual lines are passed by the caller so
 * the function works for any ad-hoc reconciliation JE (interest income, FX
 * adjustments, internal transfers, etc.).
 */
export async function createJEFromTxn(
  bank_txn_id: string,
  je_input: CreateJEInput,
  actor_id: string,
): Promise<{ je: JournalEntryWithLines; bank_txn: BankTransaction }> {
  return db.$transaction(async (tx: Tx) => {
    const txn = await loadBankTxn(tx, bank_txn_id);
    const status = deriveStatus(txn);
    if (status === 'MATCHED') {
      throw new BusinessRuleError('ALREADY_MATCHED', {
        bank_txn_id,
        reconciled_with_type: txn.reconciled_with_type,
        reconciled_with_id: txn.reconciled_with_id,
      });
    }
    if (status === 'IGNORED') {
      throw new BusinessRuleError('ALREADY_IGNORED', { bank_txn_id });
    }

    const draft = await createDraft(tx, je_input, actor_id);
    const posted = await postInTx(tx, draft.id, actor_id);

    const updated = await tx.bankTransaction.update({
      where: { id: bank_txn_id },
      data: {
        reconciled_with_type: 'BANK_FEE',
        reconciled_with_id: posted.id,
        reconciled_at: new Date(),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'BankTransaction',
      entity_id: bank_txn_id,
      before: txn,
      after: { ...updated, operation: 'create_je_from_txn', je_id: posted.id, je_no: posted.je_no },
    });

    return { je: posted, bank_txn: updated };
  });
}

export interface UnmatchedReceipt {
  type: 'RECEIPT';
  id: string;
  no: string;
  date: Date;
  amount: Decimal;
  counterpartyName: string;
}

export interface UnmatchedPayment {
  type: 'PAYMENT';
  id: string;
  no: string;
  date: Date;
  amount: Decimal;
  counterpartyName: string;
}

export type UnmatchedDocument = UnmatchedReceipt | UnmatchedPayment;

export interface ReconciliationView {
  bank_account_id: string;
  unmatched_bank_txns: BankTransaction[];
  unmatched_documents: UnmatchedDocument[];
  suggestions_per_txn: Record<string, MatchSuggestion[]>;
}

/**
 * Composite query backing the reconcile workspace UI.
 *
 * Returns unmatched bank txns for the account, unmatched (POSTED, not-yet-
 * linked) Receipts/Payments for the account, and ranked match suggestions
 * keyed by bank_txn id.
 */
export async function getReconciliationView(account_id: string): Promise<ReconciliationView> {
  const account = await db.bankAccount.findUnique({ where: { id: account_id } });
  if (!account) throw new BusinessRuleError('NOT_FOUND', { bank_account_id: account_id });

  const unmatchedTxns = await db.bankTransaction.findMany({
    where: {
      bank_account_id: account_id,
      reconciled_with_id: null,
      OR: [{ reconciled_with_type: null }, { reconciled_with_type: { not: 'IGNORED' } }],
    },
    orderBy: [{ txn_date: 'asc' }, { imported_at: 'asc' }],
  });

  const linkedReceipts = await db.bankTransaction.findMany({
    where: {
      bank_account_id: account_id,
      reconciled_with_type: 'RECEIPT',
      reconciled_with_id: { not: null },
    },
    select: { reconciled_with_id: true },
  });
  const linkedReceiptIds = linkedReceipts
    .map((r) => r.reconciled_with_id)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  const linkedPayments = await db.bankTransaction.findMany({
    where: {
      bank_account_id: account_id,
      reconciled_with_type: 'PAYMENT',
      reconciled_with_id: { not: null },
    },
    select: { reconciled_with_id: true },
  });
  const linkedPaymentIds = linkedPayments
    .map((r) => r.reconciled_with_id)
    .filter((s): s is string => typeof s === 'string' && s.length > 0);

  const unmatchedReceipts = await db.receipt.findMany({
    where: {
      bank_account_id: account_id,
      status: 'POSTED',
      ...(linkedReceiptIds.length > 0 ? { id: { notIn: linkedReceiptIds } } : {}),
    },
    select: {
      id: true,
      receipt_no: true,
      receipt_date: true,
      total_amount: true,
      customer: { select: { name: true, name_th: true } },
    },
    orderBy: { receipt_date: 'asc' },
  });

  const unmatchedPayments = await db.payment.findMany({
    where: {
      bank_account_id: account_id,
      status: 'POSTED',
      ...(linkedPaymentIds.length > 0 ? { id: { notIn: linkedPaymentIds } } : {}),
    },
    select: {
      id: true,
      payment_no: true,
      payment_date: true,
      net_paid: true,
      vendor: { select: { name: true, name_th: true } },
    },
    orderBy: { payment_date: 'asc' },
  });

  const unmatchedDocuments: UnmatchedDocument[] = [
    ...unmatchedReceipts.map<UnmatchedReceipt>((r) => ({
      type: 'RECEIPT',
      id: r.id,
      no: r.receipt_no,
      date: r.receipt_date,
      amount: D(r.total_amount.toString()),
      counterpartyName: r.customer.name_th ?? r.customer.name,
    })),
    ...unmatchedPayments.map<UnmatchedPayment>((p) => ({
      type: 'PAYMENT',
      id: p.id,
      no: p.payment_no,
      date: p.payment_date,
      amount: D(p.net_paid.toString()),
      counterpartyName: p.vendor.name_th ?? p.vendor.name,
    })),
  ];

  const suggestions_per_txn: Record<string, MatchSuggestion[]> = {};
  for (const t of unmatchedTxns) {
    suggestions_per_txn[t.id] = await suggestMatches(
      {
        id: t.id,
        bank_account_id: t.bank_account_id,
        txn_date: t.txn_date,
        description: t.description,
        debit: t.debit.toString(),
        credit: t.credit.toString(),
      },
      { hideBelowCandidate: true },
    );
  }

  return {
    bank_account_id: account_id,
    unmatched_bank_txns: unmatchedTxns,
    unmatched_documents: unmatchedDocuments,
    suggestions_per_txn,
  };
}

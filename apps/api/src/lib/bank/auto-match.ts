import { D, Decimal } from '@wind-acc/shared';
import { prisma as db } from '../prisma';

export type DocumentType = 'RECEIPT' | 'PAYMENT';
export type MatchTier = 'AUTO_CONFIRM' | 'SUGGEST' | 'CANDIDATE' | 'HIDDEN';

export interface BankTxnLike {
  id?: string;
  bank_account_id: string;
  txn_date: Date;
  description: string;
  debit: Decimal | string | number;
  credit: Decimal | string | number;
}

export interface MatchSuggestion {
  type: DocumentType;
  id: string;
  no: string;
  counterpartyName: string;
  amount: Decimal;
  date: Date;
  bankAccountId: string;
  daysDiff: number;
  amountDiff: Decimal;
  descriptionMatched: boolean;
  confidence: number;
  tier: MatchTier;
}

export interface SuggestMatchesOptions {
  hideBelowCandidate?: boolean;
}

const AMOUNT_TOLERANCE = D('0.01');
const DATE_WINDOW_DAYS = 3;

export const MATCH_THRESHOLDS = {
  AUTO_CONFIRM: 0.95,
  SUGGEST: 0.7,
  CANDIDATE: 0.4,
} as const;

function tierFor(confidence: number): MatchTier {
  if (confidence >= MATCH_THRESHOLDS.AUTO_CONFIRM) return 'AUTO_CONFIRM';
  if (confidence >= MATCH_THRESHOLDS.SUGGEST) return 'SUGGEST';
  if (confidence >= MATCH_THRESHOLDS.CANDIDATE) return 'CANDIDATE';
  return 'HIDDEN';
}

function daysBetween(a: Date, b: Date): number {
  const aUTC = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUTC = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((aUTC - bUTC) / 86_400_000);
}

function shiftDate(d: Date, deltaDays: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + deltaDays);
  return out;
}

function firstWord(s: string): string {
  return (s ?? '').trim().split(/\s+/)[0] ?? '';
}

function descriptionMatches(description: string, ...candidates: (string | null | undefined)[]): boolean {
  const haystack = (description ?? '').toLowerCase();
  for (const c of candidates) {
    const word = firstWord(c ?? '');
    if (word.length < 2) continue;
    if (haystack.includes(word.toLowerCase())) return true;
  }
  return false;
}

function scoreMatch(input: { amountDiff: Decimal; daysDiff: number; descMatch: boolean }): number {
  let score = 0;
  if (input.amountDiff.lte(AMOUNT_TOLERANCE)) score += 0.5;
  score += Math.max(0, 0.3 - input.daysDiff * 0.1);
  if (input.descMatch) score += 0.2;
  if (score < 0) score = 0;
  if (score > 1) score = 1;
  return score;
}

export async function suggestMatches(
  bankTxn: BankTxnLike,
  options: SuggestMatchesOptions = {},
): Promise<MatchSuggestion[]> {
  const debit = D(bankTxn.debit.toString());
  const credit = D(bankTxn.credit.toString());

  let direction: 'IN' | 'OUT';
  let amount: Decimal;
  if (credit.gt(debit)) {
    direction = 'IN';
    amount = credit;
  } else if (debit.gt(credit)) {
    direction = 'OUT';
    amount = debit;
  } else {
    return [];
  }
  if (amount.lte(0)) return [];

  const dateFrom = shiftDate(bankTxn.txn_date, -DATE_WINDOW_DAYS);
  const dateTo = shiftDate(bankTxn.txn_date, DATE_WINDOW_DAYS);
  const amountMin = amount.minus(AMOUNT_TOLERANCE).toFixed(2);
  const amountMax = amount.plus(AMOUNT_TOLERANCE).toFixed(2);

  const suggestions: MatchSuggestion[] = [];

  if (direction === 'IN') {
    const matchedRows = await db.bankTransaction.findMany({
      where: { reconciled_with_type: 'RECEIPT', reconciled_with_id: { not: null } },
      select: { reconciled_with_id: true },
    });
    const excludeIds = matchedRows
      .map((r) => r.reconciled_with_id)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);

    const receipts = await db.receipt.findMany({
      where: {
        bank_account_id: bankTxn.bank_account_id,
        status: 'POSTED',
        receipt_date: { gte: dateFrom, lte: dateTo },
        total_amount: { gte: amountMin, lte: amountMax },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: {
        id: true,
        receipt_no: true,
        total_amount: true,
        receipt_date: true,
        customer: { select: { name: true, name_th: true } },
      },
    });

    for (const r of receipts) {
      const rAmount = D(r.total_amount.toString());
      const amountDiff = rAmount.minus(amount).abs();
      const daysDiff = Math.abs(daysBetween(bankTxn.txn_date, r.receipt_date));
      const descMatch = descriptionMatches(bankTxn.description, r.customer.name, r.customer.name_th);
      const confidence = scoreMatch({ amountDiff, daysDiff, descMatch });
      const tier = tierFor(confidence);
      if (options.hideBelowCandidate && tier === 'HIDDEN') continue;
      suggestions.push({
        type: 'RECEIPT',
        id: r.id,
        no: r.receipt_no,
        counterpartyName: r.customer.name_th ?? r.customer.name,
        amount: rAmount,
        date: r.receipt_date,
        bankAccountId: bankTxn.bank_account_id,
        daysDiff,
        amountDiff,
        descriptionMatched: descMatch,
        confidence,
        tier,
      });
    }
  } else {
    const matchedRows = await db.bankTransaction.findMany({
      where: { reconciled_with_type: 'PAYMENT', reconciled_with_id: { not: null } },
      select: { reconciled_with_id: true },
    });
    const excludeIds = matchedRows
      .map((r) => r.reconciled_with_id)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);

    const payments = await db.payment.findMany({
      where: {
        bank_account_id: bankTxn.bank_account_id,
        status: 'POSTED',
        payment_date: { gte: dateFrom, lte: dateTo },
        net_paid: { gte: amountMin, lte: amountMax },
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: {
        id: true,
        payment_no: true,
        net_paid: true,
        payment_date: true,
        vendor: { select: { name: true, name_th: true } },
      },
    });

    for (const p of payments) {
      const pAmount = D(p.net_paid.toString());
      const amountDiff = pAmount.minus(amount).abs();
      const daysDiff = Math.abs(daysBetween(bankTxn.txn_date, p.payment_date));
      const descMatch = descriptionMatches(bankTxn.description, p.vendor.name, p.vendor.name_th);
      const confidence = scoreMatch({ amountDiff, daysDiff, descMatch });
      const tier = tierFor(confidence);
      if (options.hideBelowCandidate && tier === 'HIDDEN') continue;
      suggestions.push({
        type: 'PAYMENT',
        id: p.id,
        no: p.payment_no,
        counterpartyName: p.vendor.name_th ?? p.vendor.name,
        amount: pAmount,
        date: p.payment_date,
        bankAccountId: bankTxn.bank_account_id,
        daysDiff,
        amountDiff,
        descriptionMatched: descMatch,
        confidence,
        tier,
      });
    }
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);
  return suggestions;
}

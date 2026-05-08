import type { AccountType, JESourceType, Prisma } from '@prisma/client';
import { D, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { type BranchFilter, branchClause, dateRangeForPeriod } from './common';

type Db = Prisma.TransactionClient | typeof prisma;

export interface GLDetailRow {
  entry_date: Date;
  je_no: string;
  je_id: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
  source_type: JESourceType;
  source_id: string | null;
  source_doc_link: string;
}

export interface GLDetailTotals {
  debit: string;
  credit: string;
}

export interface GLDetail {
  account_code: string;
  name_th: string;
  name_en: string;
  account_type: AccountType;
  period_from: Date | null;
  period_to: Date | null;
  branch: BranchFilter;
  opening_balance: string;
  rows: GLDetailRow[];
  totals: GLDetailTotals;
  closing_balance: string;
}

export interface GLDetailOptions {
  account_code: string;
  period_from?: string;
  period_to?: string;
  branch?: BranchFilter;
}

const DEBIT_NORMAL: AccountType[] = ['ASSET', 'EXPENSE'];

function isDebitNormal(type: AccountType): boolean {
  return DEBIT_NORMAL.includes(type);
}

function buildRunningBalance(prev: Decimal, debit: Decimal, credit: Decimal, type: AccountType): Decimal {
  return isDebitNormal(type)
    ? prev.plus(debit).minus(credit)
    : prev.plus(credit).minus(debit);
}

function sourceDocLink(sourceType: JESourceType, sourceId: string | null, jeId: string): string {
  if (!sourceId) return `/gl/journal-entries/${jeId}`;
  switch (sourceType) {
    case 'SALES_INVOICE': return `/ar/invoices/${sourceId}`;
    case 'RECEIPT': return `/ar/receipts/${sourceId}`;
    case 'BILL': return `/ap/bills/${sourceId}`;
    case 'PAYMENT': return `/ap/payments/${sourceId}`;
    case 'TAX_FILING': return `/tax/filings/${sourceId}`;
    case 'BANK_TRANSFER': return `/bank/transactions/${sourceId}`;
    default: return `/gl/journal-entries/${jeId}`;
  }
}

/**
 * Compute General Ledger account detail for a given account and period (spec 08 §5).
 *
 * Returns the opening balance (cumulative balance before period_from), per-transaction
 * rows with a running balance, period totals, and closing balance.
 *
 * Invariant: opening_balance + sum(period debit - period credit) = closing_balance
 * for debit-normal accounts (ASSET, EXPENSE), and opening_balance +
 * sum(period credit - period debit) = closing_balance for credit-normal accounts.
 *
 * The closing_balance will match the Trial Balance for this account as of period_to.
 */
export async function generalLedger(
  options: GLDetailOptions,
  client: Db = prisma,
): Promise<GLDetail> {
  const { account_code, period_from, period_to, branch = 'ALL' } = options;

  const periodStart = period_from ? dateRangeForPeriod(period_from).start : null;
  const periodEnd = period_to ? dateRangeForPeriod(period_to).end : null;

  const account = await client.account.findUniqueOrThrow({ where: { code: account_code } });

  const lineFilter = branchClause(branch);

  // 1. Opening balance: sum all POSTED lines for this account before periodStart
  let openingBalance = D(0);

  if (periodStart) {
    const openingAgg = await client.journalLine.aggregate({
      where: {
        account_code,
        ...lineFilter,
        je: { status: 'POSTED', entry_date: { lt: periodStart } },
      },
      _sum: { debit: true, credit: true },
    });

    const openingDebit = D(openingAgg._sum.debit?.toString() ?? '0');
    const openingCredit = D(openingAgg._sum.credit?.toString() ?? '0');
    openingBalance = isDebitNormal(account.type)
      ? openingDebit.minus(openingCredit)
      : openingCredit.minus(openingDebit);
  }

  // 2. Fetch period rows sorted by entry_date ASC, je_no ASC
  const dateFilter: Prisma.DateTimeFilter<'JournalEntry'> = {};
  if (periodStart) dateFilter.gte = periodStart;
  if (periodEnd) dateFilter.lte = periodEnd;

  const lines = await client.journalLine.findMany({
    where: {
      account_code,
      ...lineFilter,
      je: {
        status: 'POSTED',
        ...(periodStart || periodEnd ? { entry_date: dateFilter } : {}),
      },
    },
    include: {
      je: {
        select: {
          je_no: true,
          entry_date: true,
          description: true,
          source_type: true,
          source_id: true,
        },
      },
    },
    orderBy: [
      { je: { entry_date: 'asc' } },
      { je: { je_no: 'asc' } },
    ],
  });

  // 3. Compute rows with running balance
  let runningBalance = openingBalance;
  let totalDebit = D(0);
  let totalCredit = D(0);

  const rows: GLDetailRow[] = lines.map(line => {
    const debit = D(line.debit.toString());
    const credit = D(line.credit.toString());
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    runningBalance = buildRunningBalance(runningBalance, debit, credit, account.type);

    return {
      entry_date: line.je.entry_date,
      je_no: line.je.je_no,
      je_id: line.je_id,
      description: line.description ?? line.je.description,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      running_balance: runningBalance.toFixed(2),
      source_type: line.je.source_type,
      source_id: line.je.source_id,
      source_doc_link: sourceDocLink(line.je.source_type, line.je.source_id, line.je_id),
    };
  });

  return {
    account_code,
    name_th: account.name_th,
    name_en: account.name_en,
    account_type: account.type,
    period_from: periodStart,
    period_to: periodEnd,
    branch,
    opening_balance: openingBalance.toFixed(2),
    rows,
    totals: {
      debit: totalDebit.toFixed(2),
      credit: totalCredit.toFixed(2),
    },
    closing_balance: runningBalance.toFixed(2),
  };
}

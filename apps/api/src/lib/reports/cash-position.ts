import type { Prisma } from '@prisma/client';
import { D, sumD, type BranchCodeType, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type BranchFilter = BranchCodeType | 'ALL';

export interface CashPositionRow {
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
  bank_name: string;
  account_number: string | null;
  gl_account_code: string;
  opening_balance: string;
  total_in: string;
  total_out: string;
  closing_balance: string;
  last_reconciled_date: string | null;
  unmatched_count: number;
}

export interface CashPositionTotals {
  opening_balance: string;
  total_in: string;
  total_out: string;
  closing_balance: string;
}

export interface CashPositionResult {
  as_of: Date;
  period_from: Date;
  branch: BranchFilter;
  rows: CashPositionRow[];
  totals: CashPositionTotals;
  receivables: string;
  payables: string;
  projected_net_cash: string;
}

export interface CashPositionOptions {
  as_of: Date;
  branch?: BranchFilter;
}

function periodStart(asOf: Date): Date {
  const bkk = new Date(asOf.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return new Date(Date.UTC(bkk.getFullYear(), bkk.getMonth(), 1));
}

export async function cashPosition(
  options: CashPositionOptions,
  client: Db = prisma,
): Promise<CashPositionResult> {
  const { as_of, branch = 'ALL' } = options;
  const period_from = periodStart(as_of);

  const bankAccounts = await client.bankAccount.findMany({
    where: { is_active: true },
    orderBy: { code: 'asc' },
  });

  const glCodes = [...new Set(bankAccounts.map(ba => ba.gl_account_code))];

  const openingLineWhere: Prisma.JournalLineWhereInput = {
    account_code: { in: glCodes },
    je: { status: 'POSTED', entry_date: { lt: period_from } },
  };
  if (branch !== 'ALL') openingLineWhere.branch_code = branch;

  const periodLineWhere: Prisma.JournalLineWhereInput = {
    account_code: { in: glCodes },
    je: { status: 'POSTED', entry_date: { gte: period_from, lte: as_of } },
  };
  if (branch !== 'ALL') periodLineWhere.branch_code = branch;

  const [openingAgg, periodAgg] = await Promise.all([
    client.journalLine.groupBy({
      by: ['account_code'],
      where: openingLineWhere,
      _sum: { debit: true, credit: true },
    }),
    client.journalLine.groupBy({
      by: ['account_code'],
      where: periodLineWhere,
      _sum: { debit: true, credit: true },
    }),
  ]);

  const openingMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of openingAgg) {
    openingMap.set(a.account_code, {
      debit: D(a._sum.debit?.toString() ?? '0'),
      credit: D(a._sum.credit?.toString() ?? '0'),
    });
  }

  const periodMap = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of periodAgg) {
    periodMap.set(a.account_code, {
      debit: D(a._sum.debit?.toString() ?? '0'),
      credit: D(a._sum.credit?.toString() ?? '0'),
    });
  }

  const reconData = await Promise.all(
    bankAccounts.map(async ba => {
      const [lastRec, unmatchedCount] = await Promise.all([
        client.bankTransaction.findFirst({
          where: { bank_account_id: ba.id, reconciled_at: { not: null } },
          orderBy: { reconciled_at: 'desc' },
          select: { reconciled_at: true },
        }),
        client.bankTransaction.count({
          where: { bank_account_id: ba.id, reconciled_at: null },
        }),
      ]);
      return { bank_account_id: ba.id, last_reconciled_date: lastRec?.reconciled_at ?? null, unmatched_count: unmatchedCount };
    }),
  );

  const reconMap = new Map(reconData.map(r => [r.bank_account_id, r]));

  const rows: CashPositionRow[] = bankAccounts.map(ba => {
    const opening = openingMap.get(ba.gl_account_code) ?? { debit: D(0), credit: D(0) };
    const period = periodMap.get(ba.gl_account_code) ?? { debit: D(0), credit: D(0) };

    const openingBal = opening.debit.minus(opening.credit);
    const totalIn = period.debit;
    const totalOut = period.credit;
    const closingBal = openingBal.plus(totalIn).minus(totalOut);

    const recon = reconMap.get(ba.id);

    return {
      bank_account_id: ba.id,
      bank_account_code: ba.code,
      bank_account_name: ba.name,
      bank_name: ba.bank_name,
      account_number: ba.account_number,
      gl_account_code: ba.gl_account_code,
      opening_balance: openingBal.toFixed(2),
      total_in: totalIn.toFixed(2),
      total_out: totalOut.toFixed(2),
      closing_balance: closingBal.toFixed(2),
      last_reconciled_date: recon?.last_reconciled_date
        ? recon.last_reconciled_date.toISOString().slice(0, 10)
        : null,
      unmatched_count: recon?.unmatched_count ?? 0,
    };
  });

  const totals: CashPositionTotals = {
    opening_balance: sumD(rows.map(r => D(r.opening_balance))).toFixed(2),
    total_in: sumD(rows.map(r => D(r.total_in))).toFixed(2),
    total_out: sumD(rows.map(r => D(r.total_out))).toFixed(2),
    closing_balance: sumD(rows.map(r => D(r.closing_balance))).toFixed(2),
  };

  const recvWhere: Prisma.JournalLineWhereInput = {
    account_code: { startsWith: '12' },
    je: { status: 'POSTED', entry_date: { lte: as_of } },
  };
  if (branch !== 'ALL') recvWhere.branch_code = branch;

  const payWhere: Prisma.JournalLineWhereInput = {
    account_code: { startsWith: '21' },
    je: { status: 'POSTED', entry_date: { lte: as_of } },
  };
  if (branch !== 'ALL') payWhere.branch_code = branch;

  const [recvAgg, payAgg] = await Promise.all([
    client.journalLine.aggregate({ where: recvWhere, _sum: { debit: true, credit: true } }),
    client.journalLine.aggregate({ where: payWhere, _sum: { debit: true, credit: true } }),
  ]);

  const receivables = D(recvAgg._sum.debit?.toString() ?? '0').minus(
    D(recvAgg._sum.credit?.toString() ?? '0'),
  );
  const payables = D(payAgg._sum.credit?.toString() ?? '0').minus(
    D(payAgg._sum.debit?.toString() ?? '0'),
  );
  const projectedNetCash = D(totals.closing_balance).plus(receivables).minus(payables);

  return {
    as_of,
    period_from,
    branch,
    rows,
    totals,
    receivables: receivables.toFixed(2),
    payables: payables.toFixed(2),
    projected_net_cash: projectedNetCash.toFixed(2),
  };
}

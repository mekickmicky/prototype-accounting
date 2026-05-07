import type { AccountType, Prisma } from '@prisma/client';
import { D, sumD, type BranchCodeType, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type BranchFilter = BranchCodeType | 'ALL';

export interface TBRow {
  account_code: string;
  name_th: string;
  name_en: string;
  type: AccountType;
  debit_total: string;
  credit_total: string;
  balance: string;
}

export interface TBGroup {
  type: AccountType;
  debit_total: string;
  credit_total: string;
  balance: string;
}

export interface TrialBalanceTotals {
  debit: string;
  credit: string;
  balance: string;
}

export interface TrialBalanceResult {
  as_of: Date;
  branch: BranchFilter;
  rows: TBRow[];
  grouped_by_type?: TBGroup[];
  totals: TrialBalanceTotals;
  imbalance?: string;
}

export interface TrialBalanceOptions {
  as_of: Date;
  branch?: BranchFilter;
  group_by_type?: boolean;
}

const TYPE_ORDER: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

/**
 * Compute the Trial Balance as of a date (spec 08 §1).
 *
 * Aggregates SUM(debit) and SUM(credit) per postable account from all
 * `POSTED` journal lines whose entry_date is on or before `as_of`, optionally
 * filtered by `branch_code`. VOID journal entries are excluded by the
 * `status='POSTED'` filter; their reversal JEs are themselves POSTED and
 * cancel the originals exactly, so the trial balance stays balanced.
 *
 * Header (non-postable) accounts are excluded from `rows`. When
 * `group_by_type` is true, an additional `grouped_by_type` array rolls
 * postable rows up by AccountType so the report can render type subtotals.
 *
 * Invariant: SUM(debit_total) === SUM(credit_total). When violated, the
 * result includes an `imbalance` field (signed Decimal as string) so the UI
 * can show the data-integrity banner.
 *
 * All arithmetic is in Decimal; rounding happens only at output via
 * `.toFixed(2)`.
 */
export async function trialBalance(
  options: TrialBalanceOptions,
  client: Db = prisma,
): Promise<TrialBalanceResult> {
  const { as_of, branch = 'ALL', group_by_type = false } = options;

  const lineWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { lte: as_of } },
  };
  if (branch !== 'ALL') {
    lineWhere.branch_code = branch;
  }

  const aggregates = await client.journalLine.groupBy({
    by: ['account_code'],
    where: lineWhere,
    _sum: { debit: true, credit: true },
  });

  const sums = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of aggregates) {
    sums.set(a.account_code, {
      debit: D(a._sum.debit?.toString() ?? '0'),
      credit: D(a._sum.credit?.toString() ?? '0'),
    });
  }

  const accounts = await client.account.findMany({
    where: { is_postable: true },
    orderBy: { code: 'asc' },
  });

  const rowsRaw = accounts.map(acc => {
    const s = sums.get(acc.code) ?? { debit: D(0), credit: D(0) };
    return {
      account_code: acc.code,
      name_th: acc.name_th,
      name_en: acc.name_en,
      type: acc.type,
      debit: s.debit,
      credit: s.credit,
    };
  });

  const totalDebit = sumD(rowsRaw.map(r => r.debit));
  const totalCredit = sumD(rowsRaw.map(r => r.credit));
  const totalBalance = totalDebit.minus(totalCredit);

  const rows: TBRow[] = rowsRaw.map(r => ({
    account_code: r.account_code,
    name_th: r.name_th,
    name_en: r.name_en,
    type: r.type,
    debit_total: r.debit.toFixed(2),
    credit_total: r.credit.toFixed(2),
    balance: r.debit.minus(r.credit).toFixed(2),
  }));

  const result: TrialBalanceResult = {
    as_of,
    branch,
    rows,
    totals: {
      debit: totalDebit.toFixed(2),
      credit: totalCredit.toFixed(2),
      balance: totalBalance.toFixed(2),
    },
  };

  if (!totalDebit.eq(totalCredit)) {
    result.imbalance = totalBalance.toFixed(2);
  }

  if (group_by_type) {
    const byType = new Map<AccountType, { debit: Decimal; credit: Decimal }>();
    for (const r of rowsRaw) {
      const cur = byType.get(r.type) ?? { debit: D(0), credit: D(0) };
      byType.set(r.type, {
        debit: cur.debit.plus(r.debit),
        credit: cur.credit.plus(r.credit),
      });
    }
    result.grouped_by_type = TYPE_ORDER.filter(t => byType.has(t)).map(t => {
      const s = byType.get(t)!;
      return {
        type: t,
        debit_total: s.debit.toFixed(2),
        credit_total: s.credit.toFixed(2),
        balance: s.debit.minus(s.credit).toFixed(2),
      };
    });
  }

  return result;
}

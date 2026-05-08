import type { Prisma } from '@prisma/client';
import { D, sumD, type BranchCodeType, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { buildComparativeBS } from './comparative';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type BranchFilter = BranchCodeType | 'ALL';

export interface BSRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

export interface BSSection {
  rows: BSRow[];
  total: string;
  comparative_total?: string;
  pct_change?: string;
}

export interface BSResult {
  as_of: Date;
  branch: BranchFilter;
  assets: { current: BSSection; non_current: BSSection; total: string };
  liabilities: { current: BSSection; non_current: BSSection; total: string };
  equity: { items: BSSection; total: string };
  total_l_and_e: string;
  net_income_ytd: string;
  balanced: boolean;
  imbalance?: string;
  comparative_as_of?: Date;
  prior?: BSResult;
}

export interface BalanceSheetOptions {
  as_of: Date;
  branch?: BranchFilter;
  comparative?: boolean;
}

// Account-code prefix groupings per spec 08 §3.
const CURRENT_ASSET_PREFIXES = ['11', '12', '13', '14', '15'] as const;
const NON_CURRENT_ASSET_PREFIXES = ['16', '17', '18'] as const;
const CURRENT_LIAB_PREFIXES = ['21', '22'] as const;
const NON_CURRENT_LIAB_PREFIXES = ['23', '24', '25'] as const;
const EQUITY_PREFIXES = ['31', '32', '33'] as const;

const CURRENT_YEAR_EARNINGS_CODE = '31030';

function startsWithAny(code: string, prefixes: readonly string[]): boolean {
  return prefixes.some(p => code.startsWith(p));
}

/**
 * First instant of the calendar year that `as_of` falls in, expressed in
 * Asia/Bangkok time. Fiscal year is locked to the calendar year for the
 * prototype (CLAUDE.md).
 */
function fiscalYearStart(asOf: Date): Date {
  const bkk = new Date(asOf.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return new Date(`${bkk.getFullYear()}-01-01T00:00:00+07:00`);
}

/**
 * Compute the Balance Sheet as of a date (spec 08 §3).
 *
 * Aggregates SUM(debit) and SUM(credit) per postable ASSET / LIABILITY /
 * EQUITY account from POSTED journal lines whose entry_date is on or before
 * `as_of`, optionally filtered by `branch_code`. VOID JEs are excluded; their
 * reversal JEs are POSTED and net to zero.
 *
 * Account 31030 (Current Year Earnings) is computed on-the-fly = YTD net
 * income from REVENUE / EXPENSE postings within the current fiscal year up
 * through `as_of`. The stored balance for 31030 is ignored. After year-end
 * close moves earnings into 31020 (Retained Earnings) and zeroes 31030, the
 * on-the-fly value naturally restarts from zero on Jan 1.
 *
 * Accounts are bucketed into Current / Non-current via numeric code prefix.
 *
 * Invariant: assets.total === liabilities.total + equity.total. The function
 * never throws on imbalance; instead it sets `balanced=false` and returns
 * `imbalance` (signed Decimal as string: assets - L&E) so the UI can render a
 * data-integrity banner.
 *
 * All arithmetic uses Decimal; rounding happens only at output via `.toFixed(2)`.
 */
export async function balanceSheet(
  options: BalanceSheetOptions,
  client: Db = prisma,
): Promise<BSResult> {
  const { as_of, branch = 'ALL', comparative = false } = options;

  const bsLineWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { lte: as_of } },
  };
  if (branch !== 'ALL') bsLineWhere.branch_code = branch;

  const fyStart = fiscalYearStart(as_of);
  const plLineWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { gte: fyStart, lte: as_of } },
  };
  if (branch !== 'ALL') plLineWhere.branch_code = branch;

  const [bsAggregates, plAggregates, accounts] = await Promise.all([
    client.journalLine.groupBy({
      by: ['account_code'],
      where: bsLineWhere,
      _sum: { debit: true, credit: true },
    }),
    client.journalLine.groupBy({
      by: ['account_code'],
      where: plLineWhere,
      _sum: { debit: true, credit: true },
    }),
    client.account.findMany({
      where: { is_postable: true },
      orderBy: { code: 'asc' },
    }),
  ]);

  const bsSums = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of bsAggregates) {
    bsSums.set(a.account_code, {
      debit: D(a._sum.debit?.toString() ?? '0'),
      credit: D(a._sum.credit?.toString() ?? '0'),
    });
  }

  const plSums = new Map<string, { debit: Decimal; credit: Decimal }>();
  for (const a of plAggregates) {
    plSums.set(a.account_code, {
      debit: D(a._sum.debit?.toString() ?? '0'),
      credit: D(a._sum.credit?.toString() ?? '0'),
    });
  }

  let netIncomeYtd = D(0);
  for (const acc of accounts) {
    const s = plSums.get(acc.code);
    if (!s) continue;
    if (acc.type === 'REVENUE') {
      netIncomeYtd = netIncomeYtd.plus(s.credit.minus(s.debit));
    } else if (acc.type === 'EXPENSE') {
      netIncomeYtd = netIncomeYtd.minus(s.debit.minus(s.credit));
    }
  }

  const currentAssets: BSRow[] = [];
  const nonCurrentAssets: BSRow[] = [];
  const currentLiabs: BSRow[] = [];
  const nonCurrentLiabs: BSRow[] = [];
  const equityItems: BSRow[] = [];

  for (const acc of accounts) {
    if (acc.type !== 'ASSET' && acc.type !== 'LIABILITY' && acc.type !== 'EQUITY') continue;

    const s = bsSums.get(acc.code) ?? { debit: D(0), credit: D(0) };
    let balance: Decimal;
    if (acc.type === 'ASSET') {
      balance = s.debit.minus(s.credit);
    } else {
      balance = s.credit.minus(s.debit);
    }
    if (acc.code === CURRENT_YEAR_EARNINGS_CODE) {
      balance = netIncomeYtd;
    }

    const row: BSRow = {
      account_code: acc.code,
      name_th: acc.name_th,
      name_en: acc.name_en,
      amount: balance.toFixed(2),
    };

    if (acc.type === 'ASSET') {
      if (startsWithAny(acc.code, CURRENT_ASSET_PREFIXES)) currentAssets.push(row);
      else if (startsWithAny(acc.code, NON_CURRENT_ASSET_PREFIXES)) nonCurrentAssets.push(row);
    } else if (acc.type === 'LIABILITY') {
      if (startsWithAny(acc.code, CURRENT_LIAB_PREFIXES)) currentLiabs.push(row);
      else if (startsWithAny(acc.code, NON_CURRENT_LIAB_PREFIXES)) nonCurrentLiabs.push(row);
    } else {
      if (startsWithAny(acc.code, EQUITY_PREFIXES)) equityItems.push(row);
    }
  }

  const sumRows = (rows: BSRow[]): Decimal => sumD(rows.map(r => D(r.amount)));

  const currentAssetTotal = sumRows(currentAssets);
  const nonCurrentAssetTotal = sumRows(nonCurrentAssets);
  const assetsTotal = currentAssetTotal.plus(nonCurrentAssetTotal);

  const currentLiabTotal = sumRows(currentLiabs);
  const nonCurrentLiabTotal = sumRows(nonCurrentLiabs);
  const liabsTotal = currentLiabTotal.plus(nonCurrentLiabTotal);

  const equityTotal = sumRows(equityItems);
  const totalLAndE = liabsTotal.plus(equityTotal);

  const imbalance = assetsTotal.minus(totalLAndE);
  const balanced = imbalance.isZero();

  const result: BSResult = {
    as_of,
    branch,
    assets: {
      current: { rows: currentAssets, total: currentAssetTotal.toFixed(2) },
      non_current: { rows: nonCurrentAssets, total: nonCurrentAssetTotal.toFixed(2) },
      total: assetsTotal.toFixed(2),
    },
    liabilities: {
      current: { rows: currentLiabs, total: currentLiabTotal.toFixed(2) },
      non_current: { rows: nonCurrentLiabs, total: nonCurrentLiabTotal.toFixed(2) },
      total: liabsTotal.toFixed(2),
    },
    equity: {
      items: { rows: equityItems, total: equityTotal.toFixed(2) },
      total: equityTotal.toFixed(2),
    },
    total_l_and_e: totalLAndE.toFixed(2),
    net_income_ytd: netIncomeYtd.toFixed(2),
    balanced,
  };
  if (!balanced) result.imbalance = imbalance.toFixed(2);

  if (!comparative) return result;

  const priorAsOf = new Date(as_of);
  priorAsOf.setFullYear(priorAsOf.getFullYear() - 1);
  const prior = await balanceSheet({ as_of: priorAsOf, branch, comparative: false }, client);
  return buildComparativeBS(result, prior);
}

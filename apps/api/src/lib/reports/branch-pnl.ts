import { D } from '@wind-acc/shared';
import { profitLoss } from './profit-loss';
import type { ReportSection } from './common';

export interface BranchAmounts {
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

export interface BranchPnLRow {
  account_code: string;
  name_th: string;
  name_en: string;
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

export interface BranchPnLSection {
  title_th: string;
  title_en: string;
  rows: BranchPnLRow[];
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

export interface BranchPnLResult {
  start_date: Date;
  end_date: Date;
  revenue: BranchPnLSection;
  cogs: BranchPnLSection;
  gross_profit: BranchAmounts;
  opex: BranchPnLSection;
  operating_income: BranchAmounts;
  other: BranchPnLSection;
  net_income: BranchAmounts;
  /** true when TL + EK + RAMA9 === total for all net_income amounts */
  balanced: boolean;
}

export interface BranchPnLOptions {
  start_date: Date;
  end_date: Date;
}

function mergeSection(
  tl: ReportSection,
  ek: ReportSection,
  rama9: ReportSection,
  all: ReportSection,
): BranchPnLSection {
  const tlMap = new Map(tl.rows.map(r => [r.account_code, r]));
  const ekMap = new Map(ek.rows.map(r => [r.account_code, r]));
  const rama9Map = new Map(rama9.rows.map(r => [r.account_code, r]));
  const allMap = new Map(all.rows.map(r => [r.account_code, r]));

  const allCodes = Array.from(
    new Set([
      ...tl.rows.map(r => r.account_code),
      ...ek.rows.map(r => r.account_code),
      ...rama9.rows.map(r => r.account_code),
      ...all.rows.map(r => r.account_code),
    ]),
  ).sort();

  const rows: BranchPnLRow[] = allCodes.map(code => {
    const base = allMap.get(code) ?? tlMap.get(code) ?? ekMap.get(code) ?? rama9Map.get(code)!;
    return {
      account_code: code,
      name_th: base.name_th,
      name_en: base.name_en,
      tl: tlMap.get(code)?.amount ?? '0.00',
      ek: ekMap.get(code)?.amount ?? '0.00',
      rama9: rama9Map.get(code)?.amount ?? '0.00',
      total: allMap.get(code)?.amount ?? '0.00',
    };
  });

  return {
    title_th: tl.title_th,
    title_en: tl.title_en,
    rows,
    tl: tl.total,
    ek: ek.total,
    rama9: rama9.total,
    total: all.total,
  };
}

function amounts(tl: string, ek: string, rama9: string, total: string): BranchAmounts {
  return { tl, ek, rama9, total };
}

/**
 * Branch P&L: runs profitLoss for each branch (TL, EK, RAMA9) and ALL in
 * parallel, then merges into a multi-column structure per spec 08 §2.
 *
 * Invariant: TL + EK + RAMA9 should equal Total (the ALL result) for every
 * derived amount. This holds when every journal line carries a branch_code.
 */
export async function branchPnl(options: BranchPnLOptions): Promise<BranchPnLResult> {
  const { start_date, end_date } = options;
  const base = { start_date, end_date, comparative: false } as const;

  const [tlRes, ekRes, rama9Res, allRes] = await Promise.all([
    profitLoss({ ...base, branch: 'TL' }),
    profitLoss({ ...base, branch: 'EK' }),
    profitLoss({ ...base, branch: 'RAMA9' }),
    profitLoss({ ...base, branch: 'ALL' }),
  ]);

  const revenue = mergeSection(tlRes.revenue, ekRes.revenue, rama9Res.revenue, allRes.revenue);
  const cogs = mergeSection(tlRes.cogs, ekRes.cogs, rama9Res.cogs, allRes.cogs);
  const opex = mergeSection(tlRes.opex, ekRes.opex, rama9Res.opex, allRes.opex);
  const other = mergeSection(tlRes.other, ekRes.other, rama9Res.other, allRes.other);

  const gross_profit = amounts(tlRes.gross_profit, ekRes.gross_profit, rama9Res.gross_profit, allRes.gross_profit);
  const operating_income = amounts(tlRes.operating_income, ekRes.operating_income, rama9Res.operating_income, allRes.operating_income);
  const net_income = amounts(tlRes.net_income, ekRes.net_income, rama9Res.net_income, allRes.net_income);

  const branchSum = D(net_income.tl).plus(D(net_income.ek)).plus(D(net_income.rama9));
  const balanced = branchSum.eq(D(net_income.total));

  return {
    start_date,
    end_date,
    revenue,
    cogs,
    gross_profit,
    opex,
    operating_income,
    other,
    net_income,
    balanced,
  };
}

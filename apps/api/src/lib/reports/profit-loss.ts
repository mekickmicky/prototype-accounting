import type { Prisma } from '@prisma/client';
import { D, sumD, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';
import {
  type BranchFilter,
  type ReportRow,
  type ReportSection,
  pctChange,
} from './common';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export interface PLResult {
  start_date: Date;
  end_date: Date;
  branch: BranchFilter;
  revenue: ReportSection;
  cogs: ReportSection;
  gross_profit: string;
  opex: ReportSection;
  operating_income: string;
  other: ReportSection;
  net_income: string;
  comparative?: PLResult;
}

export interface ProfitLossOptions {
  start_date: Date;
  end_date: Date;
  branch?: BranchFilter;
  comparative?: boolean;
}

type Bucket = 'revenue' | 'cogs' | 'opex' | 'other';

/**
 * Bucket assignment for P&L (spec 08 §2):
 *   49xxx → other (other income — REVENUE-typed accounts)
 *   4xxxx → revenue (operating revenue)
 *   5xxxx → cogs (cost of goods/services)
 *   69xxx → other (other expense — EXPENSE-typed accounts)
 *   6xxxx → opex (operating expenses)
 * Anything else: not part of P&L.
 */
function classify(code: string): Bucket | null {
  if (code.startsWith('49')) return 'other';
  if (code.startsWith('4')) return 'revenue';
  if (code.startsWith('5')) return 'cogs';
  if (code.startsWith('69')) return 'other';
  if (code.startsWith('6')) return 'opex';
  return null;
}

/**
 * Per-row signed amount.
 *
 *   revenue / cogs / opex: shown in "natural" direction so the section total is
 *   a positive number when balances are normal (REVENUE: credit-debit;
 *   EXPENSE: debit-credit).
 *
 *   other: shown as net contribution to net income — credit-debit for both
 *   49xxx (REVENUE) and 69xxx (EXPENSE). Other expenses come out negative,
 *   matching the parens convention in spec 08 §2.
 */
function signedAmount(bucket: Bucket, debit: Decimal, credit: Decimal): Decimal {
  if (bucket === 'revenue') return credit.minus(debit);
  if (bucket === 'cogs' || bucket === 'opex') return debit.minus(credit);
  return credit.minus(debit);
}

interface RawRow {
  code: string;
  name_th: string;
  name_en: string;
  amount: Decimal;
}

function toSection(rows: RawRow[], title_th: string, title_en: string): ReportSection {
  const sorted = [...rows].sort((a, b) => a.code.localeCompare(b.code));
  const total = sumD(sorted.map(r => r.amount));
  return {
    title_th,
    title_en,
    rows: sorted.map(r => ({
      account_code: r.code,
      name_th: r.name_th,
      name_en: r.name_en,
      amount: r.amount.toFixed(2),
    })),
    total: total.toFixed(2),
  };
}

async function runOnce(
  start_date: Date,
  end_date: Date,
  branch: BranchFilter,
  client: Db,
): Promise<Omit<PLResult, 'comparative'>> {
  const lineWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { gte: start_date, lte: end_date } },
    account: { type: { in: ['REVENUE', 'EXPENSE'] } },
  };
  if (branch !== 'ALL') lineWhere.branch_code = branch;

  const aggregates = await client.journalLine.groupBy({
    by: ['account_code'],
    where: lineWhere,
    _sum: { debit: true, credit: true },
  });

  const codes = aggregates.map(a => a.account_code);
  const accounts = codes.length
    ? await client.account.findMany({ where: { code: { in: codes } } })
    : [];
  const accountMap = new Map(accounts.map(a => [a.code, a]));

  const buckets: Record<Bucket, RawRow[]> = {
    revenue: [],
    cogs: [],
    opex: [],
    other: [],
  };

  for (const a of aggregates) {
    const acc = accountMap.get(a.account_code);
    if (!acc) continue;
    const bucket = classify(acc.code);
    if (!bucket) continue;
    const debit = D(a._sum.debit?.toString() ?? '0');
    const credit = D(a._sum.credit?.toString() ?? '0');
    const amount = signedAmount(bucket, debit, credit);
    if (amount.isZero()) continue;
    buckets[bucket].push({ code: acc.code, name_th: acc.name_th, name_en: acc.name_en, amount });
  }

  const revenue = toSection(buckets.revenue, 'รายได้', 'Revenue');
  const cogs = toSection(buckets.cogs, 'ต้นทุนขาย', 'Cost of Goods Sold');
  const opex = toSection(buckets.opex, 'ค่าใช้จ่ายในการดำเนินงาน', 'Operating Expenses');
  const other = toSection(buckets.other, 'รายได้ / (ค่าใช้จ่าย) อื่น', 'Other Income / (Expense)');

  const grossProfit = D(revenue.total).minus(D(cogs.total));
  const operatingIncome = grossProfit.minus(D(opex.total));
  const netIncome = operatingIncome.plus(D(other.total));

  return {
    start_date,
    end_date,
    branch,
    revenue,
    cogs,
    gross_profit: grossProfit.toFixed(2),
    opex,
    operating_income: operatingIncome.toFixed(2),
    other,
    net_income: netIncome.toFixed(2),
  };
}

/**
 * Merge a section's prior-period numbers into the current-period section so
 * each row carries comparative_amount / pct_change. Rows present in only one
 * period get a zero counterpart in the other.
 */
function withComparative(cur: ReportSection, prev: ReportSection): ReportSection {
  const curRows = new Map(cur.rows.map(r => [r.account_code, r]));
  const prevRows = new Map(prev.rows.map(r => [r.account_code, r]));
  const codes = Array.from(new Set([...curRows.keys(), ...prevRows.keys()])).sort();

  const rows: ReportRow[] = codes.map(code => {
    const c = curRows.get(code);
    const p = prevRows.get(code);
    const base = c ?? p!;
    const curAmt = c ? D(c.amount) : D(0);
    const prevAmt = p ? D(p.amount) : D(0);
    const pc = pctChange(prevAmt, curAmt);
    const row: ReportRow = {
      account_code: base.account_code,
      name_th: base.name_th,
      name_en: base.name_en,
      amount: curAmt.toFixed(2),
      comparative_amount: prevAmt.toFixed(2),
    };
    if (pc) row.pct_change = pc.toFixed(2);
    return row;
  });

  const totalPc = pctChange(D(prev.total), D(cur.total));
  const out: ReportSection = {
    title_th: cur.title_th,
    title_en: cur.title_en,
    rows,
    total: cur.total,
    comparative_total: prev.total,
  };
  if (totalPc) out.pct_change = totalPc.toFixed(2);
  return out;
}

/**
 * Compute Profit & Loss for a date range (spec 08 §2).
 *
 * Aggregates POSTED journal lines for REVENUE and EXPENSE accounts whose
 * entry_date falls within `[start_date, end_date]`, optionally branch-filtered.
 * VOID journal entries are excluded; their reversal pairs net to zero by
 * construction so no special handling is needed.
 *
 * Sections are bucketed by account-code prefix per spec 08:
 *   Revenue (4xxxx, excl. 49xxx) / COGS (5xxxx) / Opex (6xxxx, excl. 69xxx) /
 *   Other (49xxx + 69xxx).
 *
 * Derived totals:
 *   gross_profit     = revenue.total - cogs.total
 *   operating_income = gross_profit - opex.total
 *   net_income       = operating_income + other.total
 *
 * `comparative=true` re-runs the same query for the immediately preceding
 * period of equal length and exposes per-row `comparative_amount` /
 * `pct_change` on each section, plus the full prior result on `.comparative`.
 *
 * All math in Decimal; rounding only at output via toFixed(2).
 */
export async function profitLoss(
  options: ProfitLossOptions,
  client: Db = prisma,
): Promise<PLResult> {
  const { start_date, end_date, branch = 'ALL', comparative = false } = options;
  const main = await runOnce(start_date, end_date, branch, client);
  if (!comparative) return main;

  const lengthMs = end_date.getTime() - start_date.getTime();
  const prev_end = new Date(start_date.getTime() - 1);
  const prev_start = new Date(prev_end.getTime() - lengthMs);
  const prior = await runOnce(prev_start, prev_end, branch, client);

  return {
    ...main,
    revenue: withComparative(main.revenue, prior.revenue),
    cogs: withComparative(main.cogs, prior.cogs),
    opex: withComparative(main.opex, prior.opex),
    other: withComparative(main.other, prior.other),
    comparative: prior,
  };
}

import type { Prisma } from '@prisma/client';
import { D, sumD, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { type BranchFilter, type ReportSection } from './common';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export interface CFOperating {
  net_income: string;
  depreciation: ReportSection;
  working_capital: ReportSection;
  other: ReportSection;
  total: string;
}

export interface CFResult {
  start_date: Date;
  end_date: Date;
  branch: BranchFilter;
  operating: CFOperating;
  investing: ReportSection;
  financing: ReportSection;
  net_change: string;
  cash_begin: string;
  cash_end: string;
  cash_delta: string;
  reconciled: boolean;
  reconciliation_diff?: string;
}

export interface CashFlowOptions {
  start_date: Date;
  end_date: Date;
  branch?: BranchFilter;
}

type Bucket =
  | 'income'
  | 'cash'
  | 'depreciation'
  | 'working_capital'
  | 'investing'
  | 'financing'
  | 'other_op';

const CURRENT_YEAR_EARNINGS_CODE = '31030';
const ACCUM_DEPRECIATION_CODE = '16020';

/**
 * Bucket assignment for the indirect-method cash flow (spec 08 §4).
 *
 *   REVENUE / EXPENSE → income (collapsed into the single Net Income line)
 *   11xxx             → cash (drives cash_begin / cash_end / period delta)
 *   16020             → depreciation (operating addback — non-cash expense)
 *   12-15xxx, 21-22xxx → working_capital (current assets/liabilities,
 *                        excluding cash and accumulated depreciation)
 *   16xxx (excl. 16020), 17xxx, 18xxx → investing (non-current assets)
 *   23-25xxx, 31xxx (excl. 31030), 32-33xxx → financing
 *   31030 → null (excluded per spec — current year earnings is already
 *           reflected in net_income; double-counting it would inflate financing)
 *   anything unmatched → other_op (preserves the cash-reconciliation invariant
 *                        even if the chart of accounts grows)
 */
function classify(
  code: string,
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE',
): Bucket | null {
  if (type === 'REVENUE' || type === 'EXPENSE') return 'income';
  if (code === CURRENT_YEAR_EARNINGS_CODE) return null;
  if (code.startsWith('11')) return 'cash';
  if (code === ACCUM_DEPRECIATION_CODE) return 'depreciation';
  if (
    code.startsWith('12') ||
    code.startsWith('13') ||
    code.startsWith('14') ||
    code.startsWith('15') ||
    code.startsWith('21') ||
    code.startsWith('22')
  )
    return 'working_capital';
  if (code.startsWith('16') || code.startsWith('17') || code.startsWith('18'))
    return 'investing';
  if (
    code.startsWith('23') ||
    code.startsWith('24') ||
    code.startsWith('25') ||
    code.startsWith('3')
  )
    return 'financing';
  return 'other_op';
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

/**
 * Compute the Cash Flow Statement using the indirect method (spec 08 §4).
 *
 * Aggregates POSTED journal lines whose entry_date falls within
 * `[start_date, end_date]`, optionally branch-filtered. VOID JEs are excluded;
 * their reversal pairs net to zero.
 *
 * Algorithm
 * ─────────
 * For any balanced JE, ΣD = ΣC, so summing `credit - debit` across every
 * non-cash account equals `debit - credit` across the cash accounts (i.e. the
 * period change in cash). We exploit this directly:
 *
 *   • Net Income — sum of (credit - debit) over REVENUE + EXPENSE accounts.
 *     Mathematically equals revenue.total - expense.total.
 *
 *   • Depreciation — (credit - debit) on 16020 (Accumulated Depreciation).
 *     A typical depreciation entry credits 16020, so this naturally re-adds
 *     the non-cash expense already subtracted inside Net Income.
 *
 *   • Working capital — (credit - debit) on each non-cash current asset /
 *     current liability account (12-15xxx, 21-22xxx, except 16020). Sign
 *     follows the indirect-method convention: an AR increase shows up as
 *     negative (cash tied up); an AP increase shows up as positive.
 *
 *   • Investing — (credit - debit) on non-current asset accounts (16xxx
 *     excluding 16020, 17xxx, 18xxx). Equipment purchases produce a debit on
 *     the asset, so credit-debit is negative — i.e. cash outflow.
 *
 *   • Financing — (credit - debit) on long-term-liability and equity accounts
 *     (23-25xxx, 31xxx except 31030, 32-33xxx). Owner contributions credit
 *     equity, so credit-debit is positive — cash inflow.
 *
 * Reconciliation
 * ──────────────
 * `cash_begin` is the cumulative (debit - credit) on 11xxx accounts before
 * `start_date`; `cash_end` is `cash_begin` plus the period change. The
 * `net_change` summed from the three sections must equal `cash_end -
 * cash_begin`. They match by construction unless the data is corrupt or
 * 31030 absorbed a within-period closing entry; the result exposes
 * `reconciled` + `reconciliation_diff` either way so the UI can flag it.
 */
export async function cashFlow(
  options: CashFlowOptions,
  client: Db = prisma,
): Promise<CFResult> {
  const { start_date, end_date, branch = 'ALL' } = options;

  const periodWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { gte: start_date, lte: end_date } },
  };
  if (branch !== 'ALL') periodWhere.branch_code = branch;

  const priorWhere: Prisma.JournalLineWhereInput = {
    je: { status: 'POSTED', entry_date: { lt: start_date } },
    account: { code: { startsWith: '11' } },
  };
  if (branch !== 'ALL') priorWhere.branch_code = branch;

  const [periodAggs, priorAggs, accounts] = await Promise.all([
    client.journalLine.groupBy({
      by: ['account_code'],
      where: periodWhere,
      _sum: { debit: true, credit: true },
    }),
    client.journalLine.groupBy({
      by: ['account_code'],
      where: priorWhere,
      _sum: { debit: true, credit: true },
    }),
    client.account.findMany({ where: { is_postable: true } }),
  ]);

  const accountMap = new Map(accounts.map(a => [a.code, a]));

  let cashBegin = D(0);
  for (const a of priorAggs) {
    const acc = accountMap.get(a.account_code);
    if (!acc || acc.type !== 'ASSET') continue;
    const debit = D(a._sum.debit?.toString() ?? '0');
    const credit = D(a._sum.credit?.toString() ?? '0');
    cashBegin = cashBegin.plus(debit.minus(credit));
  }

  const buckets: Record<Exclude<Bucket, 'income' | 'cash'>, RawRow[]> = {
    depreciation: [],
    working_capital: [],
    investing: [],
    financing: [],
    other_op: [],
  };

  let netIncome = D(0);
  let cashPeriodChange = D(0);

  for (const a of periodAggs) {
    const acc = accountMap.get(a.account_code);
    if (!acc) continue;
    const bucket = classify(acc.code, acc.type);
    if (!bucket) continue;

    const debit = D(a._sum.debit?.toString() ?? '0');
    const credit = D(a._sum.credit?.toString() ?? '0');
    const cashEffect = credit.minus(debit);

    if (bucket === 'income') {
      netIncome = netIncome.plus(cashEffect);
      continue;
    }
    if (bucket === 'cash') {
      cashPeriodChange = cashPeriodChange.plus(debit.minus(credit));
      continue;
    }
    if (cashEffect.isZero()) continue;
    buckets[bucket].push({
      code: acc.code,
      name_th: acc.name_th,
      name_en: acc.name_en,
      amount: cashEffect,
    });
  }

  const depreciation = toSection(buckets.depreciation, 'ค่าเสื่อมราคา', 'Depreciation');
  const workingCapital = toSection(
    buckets.working_capital,
    'การเปลี่ยนแปลงในเงินทุนหมุนเวียน',
    'Changes in Working Capital',
  );
  const otherOp = toSection(buckets.other_op, 'ปรับปรุงอื่น', 'Other Adjustments');
  const investing = toSection(
    buckets.investing,
    'กระแสเงินสดจากการลงทุน',
    'Cash Flow from Investing Activities',
  );
  const financing = toSection(
    buckets.financing,
    'กระแสเงินสดจากการจัดหาเงิน',
    'Cash Flow from Financing Activities',
  );

  const operatingTotal = netIncome
    .plus(D(depreciation.total))
    .plus(D(workingCapital.total))
    .plus(D(otherOp.total));

  const netChange = operatingTotal.plus(D(investing.total)).plus(D(financing.total));
  const cashEnd = cashBegin.plus(cashPeriodChange);
  const cashDelta = cashEnd.minus(cashBegin);
  const diff = netChange.minus(cashDelta);
  const reconciled = diff.isZero();

  const result: CFResult = {
    start_date,
    end_date,
    branch,
    operating: {
      net_income: netIncome.toFixed(2),
      depreciation,
      working_capital: workingCapital,
      other: otherOp,
      total: operatingTotal.toFixed(2),
    },
    investing,
    financing,
    net_change: netChange.toFixed(2),
    cash_begin: cashBegin.toFixed(2),
    cash_end: cashEnd.toFixed(2),
    cash_delta: cashDelta.toFixed(2),
    reconciled,
  };
  if (!reconciled) result.reconciliation_diff = diff.toFixed(2);

  return result;
}

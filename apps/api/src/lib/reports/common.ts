import type { BranchCodeType } from '@wind-acc/shared';
import { D, type Decimal } from '@wind-acc/shared';

export type BranchFilter = BranchCodeType | 'ALL';

export interface ReportFilters {
  as_of?: string;
  period_from?: string;
  period_to?: string;
  branch?: BranchFilter;
  show_zero?: boolean;
  comparative?: boolean;
}

export interface ReportRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

export interface ReportSection {
  title_th: string;
  title_en: string;
  rows: ReportRow[];
  total: string;
  comparative_total?: string;
  pct_change?: string;
}

export interface ReportTotals {
  label_th: string;
  label_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Convert a YYYY-MM period code to a UTC date range spanning the full calendar
 * month in Asia/Bangkok time (UTC+7, no DST).
 *
 * start = midnight 00:00:00 Bangkok on the 1st  → stored as UTC-7h offset
 * end   = 23:59:59.999 Bangkok on the last day   → one millisecond before next month's midnight
 */
export function dateRangeForPeriod(code: string): DateRange {
  const [yearStr, monthStr] = code.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);

  const start = new Date(`${code}-01T00:00:00+07:00`);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextCode = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
  const end = new Date(new Date(`${nextCode}-01T00:00:00+07:00`).getTime() - 1);

  return { start, end };
}

/**
 * Return the YYYY-MM period code for the month immediately preceding the given
 * period code. Handles year roll-over: 2026-01 → 2025-12.
 */
export function previousPeriod(code: string): string {
  const [yearStr, monthStr] = code.split('-');
  const year = parseInt(yearStr!, 10);
  const month = parseInt(monthStr!, 10);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
}

/**
 * Return a Prisma partial-WHERE clause for filtering journal lines by branch.
 * When branch is 'ALL' (or omitted), returns an empty object so the WHERE is
 * unconstrained.
 */
export function branchClause(branch: BranchFilter): { branch_code?: BranchCodeType } {
  if (branch === 'ALL') return {};
  return { branch_code: branch };
}

/**
 * Compute percentage change from a base amount to a current amount.
 * Returns null when base is zero (undefined % change).
 * Result is a Decimal representing e.g. "12.50" for +12.5%.
 */
export function pctChange(base: Decimal, current: Decimal): Decimal | null {
  if (base.isZero()) return null;
  return current.minus(base).dividedBy(base.abs()).times(100);
}

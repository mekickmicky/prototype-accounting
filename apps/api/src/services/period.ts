import { Prisma } from '@prisma/client';
import type { FiscalPeriod } from '@prisma/client';
import { D, type Decimal } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { logAuditEvent } from './audit-log';
import { createDraft, postInTx, voidEntry, type CreateJELineInput } from './journal-entry';

type Tx = Prisma.TransactionClient;

// Returns "YYYY-MM" derived from the given date in Asia/Bangkok timezone.
// Example: 2026-05-31T17:30:00Z → "2026-06" (UTC+7 shifts into June).
export function derivePeriodCode(date: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  return `${year}-${month}`;
}

export async function getPeriod(tx: Tx, code: string): Promise<FiscalPeriod | null> {
  return tx.fiscalPeriod.findUnique({ where: { code } });
}

// Throws NOT_FOUND (404) if the period doesn't exist, or PERIOD_NOT_OPEN (409) if not OPEN.
export async function assertOpen(tx: Tx, code: string): Promise<void> {
  const period = await getPeriod(tx, code);
  if (!period) {
    throw new BusinessRuleError('NOT_FOUND', { period_code: code });
  }
  if (period.status !== 'OPEN') {
    throw new BusinessRuleError('PERIOD_NOT_OPEN', { period_code: code });
  }
}

// Returns the period if it exists, or auto-creates it as OPEN (spec 02 §2.5).
export async function ensurePeriodExists(tx: Tx, code: string): Promise<FiscalPeriod> {
  const existing = await getPeriod(tx, code);
  if (existing) return existing;

  const [yearStr, monthStr] = code.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const start_date = new Date(Date.UTC(year, month - 1, 1));
  const end_date = new Date(Date.UTC(year, month, 0)); // day 0 of next month = last day of this month

  return tx.fiscalPeriod.create({
    data: { code, start_date, end_date, status: 'OPEN' },
  });
}

// ────────────────────── Close checklist (spec 02 §2.2) ──────────────────────

export type ChecklistStatus = 'pass' | 'fail' | 'manual';

export interface ChecklistItem {
  id: ChecklistItemId;
  label_th: string;
  status: ChecklistStatus;
  count?: number;
  link?: string;
  confirmed_by_user?: boolean;
}

export type ChecklistItemId =
  | 'no_draft_jes'
  | 'bank_reconciled'
  | 'vat_filing_finalized'
  | 'aging_reviewed'
  | 'closing_entries_posted';

// Returns the close checklist for a fiscal period per spec 02 §2.2.
// Always emits items 1–4; item 5 (closing_entries_posted) is included only for
// a fiscal-year-end period (code ending in `-12`).
export async function closeChecklist(period_code: string): Promise<ChecklistItem[]> {
  const period = await prisma.fiscalPeriod.findUnique({ where: { code: period_code } });
  if (!period) {
    throw new BusinessRuleError('NOT_FOUND', { period_code });
  }

  const [draftJeCount, unreconciledBankCount, vatFiling] = await Promise.all([
    prisma.journalEntry.count({
      where: { period_code, status: 'DRAFT' },
    }),
    prisma.bankTransaction.count({
      where: {
        txn_date: { gte: period.start_date, lte: period.end_date },
        reconciled_with_id: null,
      },
    }),
    prisma.taxFiling.findFirst({
      where: {
        filing_type: 'PP30',
        period_code,
        status: { in: ['FINALIZED', 'SUBMITTED'] },
      },
      select: { id: true },
    }),
  ]);

  const items: ChecklistItem[] = [
    {
      id: 'no_draft_jes',
      label_th: 'ไม่มีรายการบันทึกประจำวันที่เป็นแบบร่าง',
      status: draftJeCount === 0 ? 'pass' : 'fail',
      count: draftJeCount,
      ...(draftJeCount > 0 && {
        link: `/gl/journal-entries?period_code=${period_code}&status=DRAFT`,
      }),
    },
    {
      id: 'bank_reconciled',
      label_th: 'กระทบยอดธนาคารครบถ้วน',
      status: unreconciledBankCount === 0 ? 'pass' : 'fail',
      count: unreconciledBankCount,
      ...(unreconciledBankCount > 0 && {
        link: `/bank/reconciliation?period_code=${period_code}`,
      }),
    },
    {
      id: 'vat_filing_finalized',
      label_th: 'ปิดยอดภาษีมูลค่าเพิ่ม (ภพ.30) เรียบร้อย',
      status: vatFiling ? 'pass' : 'fail',
      ...(!vatFiling && {
        link: `/tax/pp30?period_code=${period_code}`,
      }),
    },
    {
      id: 'aging_reviewed',
      label_th: 'ตรวจทานยอดค้างรับ/ค้างจ่าย (Aging)',
      status: 'manual',
      confirmed_by_user: false,
      link: `/reports/ar-aging?period_code=${period_code}`,
    },
  ];

  if (period_code.endsWith('-12')) {
    // Year-end close requires three closing JEs:
    //   (1) revenue → 31030  (2) expense → 31030  (3) 31030 → 31020.
    const closingJeCount = await prisma.journalEntry.count({
      where: {
        period_code,
        source_type: 'ADJUSTMENT',
        status: 'POSTED',
        description: { startsWith: 'YEAR_END_CLOSE ' },
      },
    });
    items.push({
      id: 'closing_entries_posted',
      label_th: 'บันทึกรายการปิดบัญชีสิ้นปีครบถ้วน',
      status: closingJeCount >= 3 ? 'pass' : 'fail',
      count: closingJeCount,
      ...(closingJeCount < 3 && {
        link: `/gl/journal-entries?period_code=${period_code}&q=YEAR_END_CLOSE`,
      }),
    });
  }

  return items;
}

// ────────────────────── Close period (spec 02 §2.3, §12.3) ──────────────────────

const CURRENT_YEAR_EARNINGS = '31030';
const RETAINED_EARNINGS = '31020';
// Year-end closing JEs are company-wide. The schema requires a single
// branch_code on the JE header and lines, so we tag them with the primary
// branch ('TL'). This does not affect P&L reporting for the closed year —
// each in-period transaction kept its own branch.
const CLOSING_BRANCH = 'TL';

interface AccountAggregate {
  account_code: string;
  debit: Decimal;
  credit: Decimal;
}

async function aggregatePostedActivity(
  tx: Prisma.TransactionClient,
  year: number,
  accountType: 'REVENUE' | 'EXPENSE',
): Promise<AccountAggregate[]> {
  const accounts = await tx.account.findMany({
    where: { type: accountType, is_postable: true },
    select: { code: true },
  });
  if (accounts.length === 0) return [];

  const grouped = await tx.journalLine.groupBy({
    by: ['account_code'],
    where: {
      account_code: { in: accounts.map(a => a.code) },
      je: {
        status: 'POSTED',
        period_code: { startsWith: `${year}-` },
      },
    },
    _sum: { debit: true, credit: true },
  });

  return grouped.map(g => ({
    account_code: g.account_code,
    debit: D(g._sum.debit?.toString() ?? '0'),
    credit: D(g._sum.credit?.toString() ?? '0'),
  }));
}

async function postYearEndClosingEntries(
  tx: Prisma.TransactionClient,
  period: FiscalPeriod,
  year: number,
  actor_id: string,
): Promise<void> {
  const entryDate = period.end_date;
  const description = `YEAR_END_CLOSE ${year}`;

  // (1) Close revenue accounts (4xxxx with credit balance) → 31030.
  const revenue = await aggregatePostedActivity(tx, year, 'REVENUE');
  const revenueLines: CreateJELineInput[] = [];
  let revenueCloseTotal = D(0);
  for (const r of revenue) {
    const balance = r.credit.minus(r.debit);
    if (balance.lte(0)) continue; // spec §2.3: only credit balances close to 31030
    revenueLines.push({
      account_code: r.account_code,
      branch_code: CLOSING_BRANCH,
      debit: balance.toFixed(2),
    });
    revenueCloseTotal = revenueCloseTotal.plus(balance);
  }
  if (revenueCloseTotal.gt(0)) {
    revenueLines.push({
      account_code: CURRENT_YEAR_EARNINGS,
      branch_code: CLOSING_BRANCH,
      credit: revenueCloseTotal.toFixed(2),
    });
    const draft = await createDraft(
      tx,
      {
        entry_date: entryDate,
        branch_code: CLOSING_BRANCH,
        description: `${description} - Close revenue to ${CURRENT_YEAR_EARNINGS}`,
        source_type: 'ADJUSTMENT',
        lines: revenueLines,
      },
      actor_id,
    );
    await postInTx(tx, draft.id, actor_id);
  }

  // (2) Close expense accounts (5xxxx, 6xxxx with debit balance) → 31030.
  const expense = await aggregatePostedActivity(tx, year, 'EXPENSE');
  const expenseLines: CreateJELineInput[] = [];
  let expenseCloseTotal = D(0);
  for (const e of expense) {
    const balance = e.debit.minus(e.credit);
    if (balance.lte(0)) continue; // spec §2.3: only debit balances close to 31030
    expenseLines.push({
      account_code: e.account_code,
      branch_code: CLOSING_BRANCH,
      credit: balance.toFixed(2),
    });
    expenseCloseTotal = expenseCloseTotal.plus(balance);
  }
  if (expenseCloseTotal.gt(0)) {
    const draft = await createDraft(
      tx,
      {
        entry_date: entryDate,
        branch_code: CLOSING_BRANCH,
        description: `${description} - Close expenses to ${CURRENT_YEAR_EARNINGS}`,
        source_type: 'ADJUSTMENT',
        lines: [
          {
            account_code: CURRENT_YEAR_EARNINGS,
            branch_code: CLOSING_BRANCH,
            debit: expenseCloseTotal.toFixed(2),
          },
          ...expenseLines,
        ],
      },
      actor_id,
    );
    await postInTx(tx, draft.id, actor_id);
  }

  // (3) Close 31030 → 31020. Profit ⇒ Dr 31030 / Cr 31020. Loss ⇒ reversed.
  const netResult = revenueCloseTotal.minus(expenseCloseTotal);
  if (!netResult.eq(0)) {
    const isProfit = netResult.gt(0);
    const amount = netResult.abs();
    const draft = await createDraft(
      tx,
      {
        entry_date: entryDate,
        branch_code: CLOSING_BRANCH,
        description: `${description} - Close ${CURRENT_YEAR_EARNINGS} to ${RETAINED_EARNINGS}`,
        source_type: 'ADJUSTMENT',
        lines: isProfit
          ? [
              { account_code: CURRENT_YEAR_EARNINGS, branch_code: CLOSING_BRANCH, debit: amount.toFixed(2) },
              { account_code: RETAINED_EARNINGS, branch_code: CLOSING_BRANCH, credit: amount.toFixed(2) },
            ]
          : [
              { account_code: RETAINED_EARNINGS, branch_code: CLOSING_BRANCH, debit: amount.toFixed(2) },
              { account_code: CURRENT_YEAR_EARNINGS, branch_code: CLOSING_BRANCH, credit: amount.toFixed(2) },
            ],
      },
      actor_id,
    );
    await postInTx(tx, draft.id, actor_id);
  }
}

/**
 * Close an OPEN fiscal period (spec 02 §2.3, §12.3).
 *
 * Flow:
 * 1. Pre-flight: run `closeChecklist`. If any non-manual item fails, throw
 *    `PERIOD_CLOSE_BLOCKED` with the full checklist as context. For a
 *    year-end (`-12`) period, `closing_entries_posted` is excluded from the
 *    pre-check because this function is what generates them.
 * 2. Open a single `prisma.$transaction` and acquire a row lock on the
 *    FiscalPeriod (`SELECT ... FOR UPDATE`). This serializes concurrent
 *    closes against the same period.
 * 3. Re-verify `status = OPEN` and re-count DRAFT JEs in the period inside
 *    the lock — defense against a draft created between pre-check and lock
 *    acquisition.
 * 4. For year-end: post three closing JEs (revenue → 31030, expenses →
 *    31030, 31030 → 31020) via `createDraft` + `postInTx`. Each is a
 *    separate POSTED JE with `source_type='ADJUSTMENT'` and a description
 *    starting with `YEAR_END_CLOSE {year}`.
 * 5. Transition the period to `CLOSED`, stamp `closed_at` / `closed_by_id`.
 * 6. Emit AuditLog action=PERIOD_CLOSE.
 */
export async function closePeriod(period_code: string, actor_id: string): Promise<void> {
  const isYearEnd = period_code.endsWith('-12');

  // Pre-flight checklist verification. closing_entries_posted is generated
  // by this function for year-end, so we exclude it from the blocking set.
  const preCheck = await closeChecklist(period_code);
  const blocking = preCheck.filter(item => {
    if (item.status !== 'fail') return false;
    if (isYearEnd && item.id === 'closing_entries_posted') return false;
    return true;
  });
  if (blocking.length > 0) {
    throw new BusinessRuleError('PERIOD_CLOSE_BLOCKED', {
      period_code,
      checklist: preCheck,
      failing_items: blocking.map(i => i.id),
    });
  }

  await prisma.$transaction(async tx => {
    // §12.3: pessimistic row lock on the period prevents concurrent closes.
    const locked = await tx.$queryRaw<FiscalPeriod[]>(
      Prisma.sql`SELECT * FROM fiscal_periods WHERE code = ${period_code} FOR UPDATE`,
    );
    if (locked.length === 0) {
      throw new BusinessRuleError('PERIOD_NOT_FOUND', { period_code });
    }
    const before = locked[0]!;
    if (before.status !== 'OPEN') {
      throw new BusinessRuleError('PERIOD_NOT_OPEN', { period_code, status: before.status });
    }

    // Defense in depth: re-count DRAFT JEs after acquiring the lock. A draft
    // created between pre-check and lock acquisition would otherwise survive
    // into a closed period.
    const draftCount = await tx.journalEntry.count({
      where: { period_code, status: 'DRAFT' },
    });
    if (draftCount > 0) {
      throw new BusinessRuleError('PERIOD_CLOSE_BLOCKED', {
        period_code,
        failing_items: ['no_draft_jes'],
        draft_count: draftCount,
      });
    }

    if (isYearEnd) {
      const year = parseInt(period_code.slice(0, 4), 10);
      await postYearEndClosingEntries(tx, before, year, actor_id);
    }

    const closed = await tx.fiscalPeriod.update({
      where: { code: period_code },
      data: {
        status: 'CLOSED',
        closed_at: new Date(),
        closed_by_id: actor_id,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'PERIOD_CLOSE',
      entity_type: 'FiscalPeriod',
      entity_id: period_code,
      before,
      after: closed,
    });
  });
}

/**
 * Reopen a CLOSED fiscal period (spec 02 §2.4) — admin only.
 *
 * The caller (API route) must assert ADMIN role before calling; this service
 * does NOT look up the actor's role.
 *
 * Flow:
 * 1. Acquire a row lock on the period.
 * 2. Throw PERIOD_LOCKED if status=LOCKED (cannot ever reopen a locked period).
 * 3. Throw VALIDATION_ERROR if the period is not CLOSED.
 * 4. Transition CLOSED → OPEN, emit AuditLog action=PERIOD_REOPEN with reason.
 * 5. For December year-end periods: find and void every auto-posted
 *    YEAR_END_CLOSE JE. This runs AFTER the period is OPEN so that
 *    voidEntry's period-open guard passes.
 */
export async function reopenPeriod(
  period_code: string,
  actor_id: string,
  reason: string,
): Promise<void> {
  const isYearEnd = period_code.endsWith('-12');

  // Transaction 1: lock, validate, transition CLOSED → OPEN, audit.
  await prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<FiscalPeriod[]>(
      Prisma.sql`SELECT * FROM fiscal_periods WHERE code = ${period_code} FOR UPDATE`,
    );
    if (locked.length === 0) {
      throw new BusinessRuleError('NOT_FOUND', { period_code });
    }
    const before = locked[0]!;

    if (before.status === 'LOCKED') {
      throw new BusinessRuleError('PERIOD_LOCKED', { period_code });
    }

    if (before.status !== 'CLOSED') {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        period_code,
        reason: 'period_not_closed',
        current_status: before.status,
      });
    }

    const after = await tx.fiscalPeriod.update({
      where: { code: period_code },
      data: { status: 'OPEN' },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'PERIOD_REOPEN',
      entity_type: 'FiscalPeriod',
      entity_id: period_code,
      before,
      after,
      reason,
    });
  });

  // The period is now OPEN. Void year-end closing JEs so the books reflect
  // the reopened state. Each voidEntry call runs in its own transaction.
  if (isYearEnd) {
    const year = parseInt(period_code.slice(0, 4), 10);
    const closingJEs = await prisma.journalEntry.findMany({
      where: {
        period_code,
        source_type: 'ADJUSTMENT',
        status: 'POSTED',
        description: { startsWith: `YEAR_END_CLOSE ${year}` },
      },
      select: { id: true },
      orderBy: { posted_at: 'asc' },
    });

    for (const je of closingJEs) {
      await voidEntry(je.id, actor_id, `Reopen ${period_code}: ${reason}`);
    }
  }
}

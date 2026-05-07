import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { prisma } from '../lib/prisma';
import { closeChecklist, closePeriod } from './period';
import { createDraft, post } from './journal-entry';

const TEST_PERIOD = '2099-03';
const YEAR_END_PERIOD = '2099-12';
const TEST_BRANCH = 'TL';

async function ensurePeriod(code: string): Promise<void> {
  const [yearStr, monthStr] = code.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  await prisma.fiscalPeriod.upsert({
    where: { code },
    update: {},
    create: {
      code,
      start_date: new Date(Date.UTC(year, month - 1, 1)),
      end_date: new Date(Date.UTC(year, month, 0)),
      status: 'OPEN',
    },
  });
}

async function pickAccount(): Promise<string> {
  const a = await prisma.account.findFirst({
    where: { is_postable: true, is_active: true },
    select: { code: true },
  });
  if (!a) throw new Error('no postable account — run db:seed first');
  return a.code;
}

async function clearTestRows(): Promise<void> {
  await prisma.taxFiling.deleteMany({
    where: { period_code: { startsWith: '2099-' } },
  });
  await prisma.journalLine.deleteMany({
    where: { je: { period_code: { startsWith: '2099-' } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { period_code: { startsWith: '2099-' } },
  });
  await prisma.auditLog.deleteMany({
    where: { entity_type: 'FiscalPeriod', entity_id: { startsWith: '2099-' } },
  });
  await prisma.fiscalPeriod.updateMany({
    where: { code: { startsWith: '2099-' } },
    data: { status: 'OPEN', closed_at: null, closed_by_id: null },
  });
}

beforeAll(async () => {
  await ensurePeriod(TEST_PERIOD);
  await ensurePeriod(YEAR_END_PERIOD);
  await clearTestRows();
});

afterEach(async () => {
  await clearTestRows();
});

async function seedJE(opts: {
  je_no: string;
  period_code: string;
  status: 'DRAFT' | 'POSTED' | 'VOID';
  source_type?:
    | 'MANUAL'
    | 'ADJUSTMENT'
    | 'REVERSAL'
    | 'SALES_INVOICE'
    | 'RECEIPT'
    | 'BILL'
    | 'PAYMENT'
    | 'TAX_FILING'
    | 'BANK_TRANSFER'
    | 'STOCK_EXPORT'
    | 'RECURRING';
  description?: string;
}): Promise<void> {
  const account = await pickAccount();
  await prisma.journalEntry.create({
    data: {
      je_no: opts.je_no,
      entry_date: new Date(`${opts.period_code}-15T00:00:00Z`),
      period_code: opts.period_code,
      branch_code: TEST_BRANCH,
      description: opts.description ?? 'fixture',
      source_type: opts.source_type ?? 'MANUAL',
      status: opts.status,
      total_debit: opts.status === 'POSTED' ? 1 : 0,
      total_credit: opts.status === 'POSTED' ? 1 : 0,
      lines: {
        create: [
          { line_no: 1, account_code: account, branch_code: TEST_BRANCH, debit: 1, credit: 0 },
          { line_no: 2, account_code: account, branch_code: TEST_BRANCH, debit: 0, credit: 1 },
        ],
      },
    },
  });
}

describe('closeChecklist', () => {
  test('returns no_draft_jes=fail with count when DRAFT JEs exist in the period', async () => {
    await seedJE({ je_no: 'TEST-2099-D1', period_code: TEST_PERIOD, status: 'DRAFT' });
    await seedJE({ je_no: 'TEST-2099-D2', period_code: TEST_PERIOD, status: 'DRAFT' });

    const items = await closeChecklist(TEST_PERIOD);
    const draft = items.find(i => i.id === 'no_draft_jes')!;

    expect(draft.status).toBe('fail');
    expect(draft.count).toBe(2);
    expect(draft.link).toContain(TEST_PERIOD);
    expect(draft.link).toContain('status=DRAFT');
  });

  test('returns no_draft_jes=pass with count=0 when only POSTED JEs exist', async () => {
    await seedJE({ je_no: 'TEST-2099-P1', period_code: TEST_PERIOD, status: 'POSTED' });

    const items = await closeChecklist(TEST_PERIOD);
    const draft = items.find(i => i.id === 'no_draft_jes')!;

    expect(draft.status).toBe('pass');
    expect(draft.count).toBe(0);
    expect(draft.link).toBeUndefined();
  });

  test('bank_reconciled passes when no bank transactions exist in the period', async () => {
    const items = await closeChecklist(TEST_PERIOD);
    const bank = items.find(i => i.id === 'bank_reconciled')!;
    expect(bank.status).toBe('pass');
    expect(bank.count).toBe(0);
  });

  test('vat_filing_finalized fails without a finalized PP30 filing', async () => {
    const items = await closeChecklist(TEST_PERIOD);
    const vat = items.find(i => i.id === 'vat_filing_finalized')!;
    expect(vat.status).toBe('fail');
    expect(vat.link).toContain('/tax/pp30');
  });

  test('vat_filing_finalized passes when PP30 filing is FINALIZED', async () => {
    await prisma.taxFiling.create({
      data: {
        filing_no: 'PP30-2099-03',
        filing_type: 'PP30',
        period_code: TEST_PERIOD,
        status: 'FINALIZED',
      },
    });

    const items = await closeChecklist(TEST_PERIOD);
    const vat = items.find(i => i.id === 'vat_filing_finalized')!;
    expect(vat.status).toBe('pass');
  });

  test('aging_reviewed is always manual with confirmed_by_user=false', async () => {
    const items = await closeChecklist(TEST_PERIOD);
    const aging = items.find(i => i.id === 'aging_reviewed')!;
    expect(aging.status).toBe('manual');
    expect(aging.confirmed_by_user).toBe(false);
  });

  test('omits closing_entries_posted for non-December periods', async () => {
    const items = await closeChecklist(TEST_PERIOD);
    expect(items.find(i => i.id === 'closing_entries_posted')).toBeUndefined();
    expect(items).toHaveLength(4);
  });

  test('includes closing_entries_posted=fail for -12 period without YEAR_END_CLOSE JEs', async () => {
    const items = await closeChecklist(YEAR_END_PERIOD);
    const ce = items.find(i => i.id === 'closing_entries_posted')!;
    expect(ce.status).toBe('fail');
    expect(ce.count).toBe(0);
    expect(items).toHaveLength(5);
  });

  test('includes closing_entries_posted=pass when 3 YEAR_END_CLOSE JEs are posted', async () => {
    for (let i = 1; i <= 3; i++) {
      await seedJE({
        je_no: `TEST-2099-YEC-${i}`,
        period_code: YEAR_END_PERIOD,
        status: 'POSTED',
        source_type: 'ADJUSTMENT',
        description: `YEAR_END_CLOSE 2099 step ${i}`,
      });
    }

    const items = await closeChecklist(YEAR_END_PERIOD);
    const ce = items.find(i => i.id === 'closing_entries_posted')!;
    expect(ce.status).toBe('pass');
    expect(ce.count).toBe(3);
  });

  test('throws BusinessRuleError NOT_FOUND when period does not exist', async () => {
    await expect(closeChecklist('1900-01')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ────────────────────── closePeriod ──────────────────────

const CLOSE_TEST_USER_EMAIL = 'period-close-test@wind';
let CLOSE_ACTOR_ID = '';

async function pickRevenueAccount(): Promise<string> {
  const a = await prisma.account.findFirst({
    where: { type: 'REVENUE', is_postable: true, is_active: true },
    select: { code: true },
  });
  if (!a) throw new Error('no revenue account — run db:seed first');
  return a.code;
}

async function pickExpenseAccount(): Promise<string> {
  const a = await prisma.account.findFirst({
    where: { type: 'EXPENSE', is_postable: true, is_active: true },
    select: { code: true },
  });
  if (!a) throw new Error('no expense account — run db:seed first');
  return a.code;
}

async function pickAssetAccount(): Promise<string> {
  // For balanced JEs offsetting revenue/expense, we need an asset (cash/AR).
  const a = await prisma.account.findFirst({
    where: { type: 'ASSET', is_postable: true, is_active: true },
    select: { code: true },
  });
  if (!a) throw new Error('no asset account — run db:seed first');
  return a.code;
}

async function postPnlActivity(
  period_code: string,
  revenueAccount: string,
  expenseAccount: string,
  assetAccount: string,
  revenueAmount: string,
  expenseAmount: string,
): Promise<void> {
  const draft1 = await prisma.$transaction(tx =>
    createDraft(
      tx,
      {
        entry_date: `${period_code}-15`,
        branch_code: TEST_BRANCH,
        description: 'seed revenue',
        source_type: 'MANUAL',
        lines: [
          { account_code: assetAccount, debit: revenueAmount },
          { account_code: revenueAccount, credit: revenueAmount },
        ],
      },
      CLOSE_ACTOR_ID,
    ),
  );
  await post(draft1.id, CLOSE_ACTOR_ID);

  const draft2 = await prisma.$transaction(tx =>
    createDraft(
      tx,
      {
        entry_date: `${period_code}-16`,
        branch_code: TEST_BRANCH,
        description: 'seed expense',
        source_type: 'MANUAL',
        lines: [
          { account_code: expenseAccount, debit: expenseAmount },
          { account_code: assetAccount, credit: expenseAmount },
        ],
      },
      CLOSE_ACTOR_ID,
    ),
  );
  await post(draft2.id, CLOSE_ACTOR_ID);
}

async function seedPP30(period_code: string): Promise<void> {
  await prisma.taxFiling.upsert({
    where: { filing_no: `PP30-${period_code}` },
    update: { status: 'FINALIZED' },
    create: {
      filing_no: `PP30-${period_code}`,
      filing_type: 'PP30',
      period_code,
      status: 'FINALIZED',
    },
  });
}

describe('closePeriod', () => {
  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: CLOSE_TEST_USER_EMAIL },
      update: {},
      create: { email: CLOSE_TEST_USER_EMAIL, name: 'Close Tester', role: 'ADMIN' },
    });
    CLOSE_ACTOR_ID = user.id;
  });

  test('throws PERIOD_CLOSE_BLOCKED when period contains DRAFT JEs', async () => {
    await seedJE({ je_no: 'TEST-2099-CD-1', period_code: TEST_PERIOD, status: 'DRAFT' });

    await expect(closePeriod(TEST_PERIOD, CLOSE_ACTOR_ID)).rejects.toMatchObject({
      code: 'PERIOD_CLOSE_BLOCKED',
    });

    const period = await prisma.fiscalPeriod.findUnique({ where: { code: TEST_PERIOD } });
    expect(period?.status).toBe('OPEN');
  });

  test('closes a non-year-end period and emits AuditLog', async () => {
    await seedPP30(TEST_PERIOD);
    await closePeriod(TEST_PERIOD, CLOSE_ACTOR_ID);

    const period = await prisma.fiscalPeriod.findUnique({ where: { code: TEST_PERIOD } });
    expect(period?.status).toBe('CLOSED');
    expect(period?.closed_at).toBeInstanceOf(Date);
    expect(period?.closed_by_id).toBe(CLOSE_ACTOR_ID);

    const audit = await prisma.auditLog.findFirst({
      where: {
        entity_type: 'FiscalPeriod',
        entity_id: TEST_PERIOD,
        action: 'PERIOD_CLOSE',
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actor_id).toBe(CLOSE_ACTOR_ID);
  });

  test('subsequent post into a closed period returns PERIOD_NOT_OPEN', async () => {
    await seedPP30(TEST_PERIOD);
    await closePeriod(TEST_PERIOD, CLOSE_ACTOR_ID);

    const asset = await pickAssetAccount();
    const revenue = await pickRevenueAccount();
    const draft = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-20`,
          branch_code: TEST_BRANCH,
          description: 'after close',
          source_type: 'MANUAL',
          lines: [
            { account_code: asset, debit: '50.00' },
            { account_code: revenue, credit: '50.00' },
          ],
        },
        CLOSE_ACTOR_ID,
      ),
    );

    await expect(post(draft.id, CLOSE_ACTOR_ID)).rejects.toMatchObject({
      code: 'PERIOD_NOT_OPEN',
    });
  });

  test('closing an already-closed period throws PERIOD_NOT_OPEN', async () => {
    await seedPP30(TEST_PERIOD);
    await closePeriod(TEST_PERIOD, CLOSE_ACTOR_ID);

    await expect(closePeriod(TEST_PERIOD, CLOSE_ACTOR_ID)).rejects.toMatchObject({
      code: 'PERIOD_NOT_OPEN',
    });
  });

  test('year-end -12 close auto-posts 3 closing JEs and transitions to CLOSED', async () => {
    const revenue = await pickRevenueAccount();
    const expense = await pickExpenseAccount();
    const asset = await pickAssetAccount();
    await postPnlActivity(YEAR_END_PERIOD, revenue, expense, asset, '1000.00', '600.00');

    // Satisfy the VAT filing checklist item (we are not testing tax).
    await seedPP30(YEAR_END_PERIOD);

    await closePeriod(YEAR_END_PERIOD, CLOSE_ACTOR_ID);

    const closingJEs = await prisma.journalEntry.findMany({
      where: {
        period_code: YEAR_END_PERIOD,
        source_type: 'ADJUSTMENT',
        status: 'POSTED',
        description: { startsWith: 'YEAR_END_CLOSE ' },
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
      orderBy: { posted_at: 'asc' },
    });
    expect(closingJEs).toHaveLength(3);

    // (1) revenue close: Dr revenue 1000, Cr 31030 1000.
    const je1 = closingJEs[0]!;
    expect(je1.description).toContain('Close revenue');
    expect(je1.total_debit.toString()).toBe('1000');
    expect(je1.total_credit.toString()).toBe('1000');
    expect(je1.lines.find(l => l.account_code === '31030')?.credit.toString()).toBe('1000');

    // (2) expense close: Dr 31030 600, Cr expense 600.
    const je2 = closingJEs[1]!;
    expect(je2.description).toContain('Close expenses');
    expect(je2.total_debit.toString()).toBe('600');
    expect(je2.lines.find(l => l.account_code === '31030')?.debit.toString()).toBe('600');

    // (3) net result close: Dr 31030 400, Cr 31020 400 (profit case).
    const je3 = closingJEs[2]!;
    expect(je3.description).toContain('Close 31030 to 31020');
    expect(je3.total_debit.toString()).toBe('400');
    expect(je3.lines.find(l => l.account_code === '31030')?.debit.toString()).toBe('400');
    expect(je3.lines.find(l => l.account_code === '31020')?.credit.toString()).toBe('400');

    const period = await prisma.fiscalPeriod.findUnique({ where: { code: YEAR_END_PERIOD } });
    expect(period?.status).toBe('CLOSED');
  });
});

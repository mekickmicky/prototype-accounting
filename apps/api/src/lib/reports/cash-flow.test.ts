import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { createDraft, post } from '../../services/journal-entry';
import { cashFlow } from './cash-flow';

const TEST_YEAR = 2098;
const TEST_PERIOD = `${TEST_YEAR}-04`;
const TEST_BRANCH = 'TL';
const OTHER_BRANCH = 'EK';
const TEST_USER_EMAIL = 'cf-test@wind';
const START = new Date(`${TEST_YEAR}-04-01T00:00:00+07:00`);
const END = new Date(`${TEST_YEAR}-04-30T23:59:59+07:00`);

let TEST_USER_ID = '';

async function pickFirst(opts: {
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  startsWith?: string;
  notCode?: string;
}): Promise<string> {
  const acc = await prisma.account.findFirst({
    where: {
      is_postable: true,
      is_active: true,
      type: opts.type,
      ...(opts.startsWith ? { code: { startsWith: opts.startsWith } } : {}),
      ...(opts.notCode ? { NOT: { code: opts.notCode } } : {}),
    },
    orderBy: { code: 'asc' },
    select: { code: true },
  });
  if (!acc) throw new Error(`seed required: ${JSON.stringify(opts)}`);
  return acc.code;
}

async function makeAndPost(opts: {
  entry_date: string | Date;
  branch: string;
  debitCode: string;
  creditCode: string;
  amount: string;
}): Promise<string> {
  const je = await prisma.$transaction(tx =>
    createDraft(
      tx,
      {
        entry_date: opts.entry_date,
        branch_code: opts.branch,
        description: 'cf fixture',
        source_type: 'MANUAL',
        lines: [
          { account_code: opts.debitCode, debit: opts.amount, branch_code: opts.branch },
          { account_code: opts.creditCode, credit: opts.amount, branch_code: opts.branch },
        ],
      },
      TEST_USER_ID,
    ),
  );
  const posted = await post(je.id, TEST_USER_ID);
  return posted.id;
}

async function clearTestRows(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { entity_type: 'JournalEntry', actor_id: TEST_USER_ID || undefined },
  });
  await prisma.journalLine.deleteMany({
    where: {
      OR: [
        { je: { period_code: { startsWith: `${TEST_YEAR}-` } } },
        { je: { je_no: { startsWith: `JE-${TEST_YEAR}-` } } },
      ],
    },
  });
  await prisma.journalEntry.deleteMany({
    where: {
      OR: [
        { period_code: { startsWith: `${TEST_YEAR}-` } },
        { je_no: { startsWith: `JE-${TEST_YEAR}-` } },
      ],
    },
  });
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'CF Tester', role: 'ACCOUNTANT' },
  });
  TEST_USER_ID = user.id;

  for (let m = 1; m <= 12; m++) {
    const code = `${TEST_YEAR}-${String(m).padStart(2, '0')}`;
    const start = new Date(`${code}-01T00:00:00+07:00`);
    const nextCode =
      m === 12 ? `${TEST_YEAR + 1}-01` : `${TEST_YEAR}-${String(m + 1).padStart(2, '0')}`;
    const end = new Date(new Date(`${nextCode}-01T00:00:00+07:00`).getTime() - 86400000);
    await prisma.fiscalPeriod.upsert({
      where: { code },
      update: { status: 'OPEN' },
      create: { code, start_date: start, end_date: end, status: 'OPEN' },
    });
  }

  await clearTestRows();
});

afterEach(async () => {
  await clearTestRows();
});

describe('cashFlow', () => {
  test('cash receipt against revenue: net_change positive, reconciles to cash delta, net income matches', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const revenue = await pickFirst({ type: 'REVENUE' });

    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: revenue,
      amount: '1000.00',
    });

    const cf = await cashFlow({ start_date: START, end_date: END });

    expect(cf.reconciled).toBe(true);
    expect(D(cf.net_change).eq(D('1000.00'))).toBe(true);
    expect(D(cf.cash_delta).eq(D('1000.00'))).toBe(true);
    expect(D(cf.operating.net_income).eq(D('1000.00'))).toBe(true);
    expect(D(cf.cash_begin).eq(D('0.00'))).toBe(true);
    expect(D(cf.cash_end).eq(D('1000.00'))).toBe(true);
  });

  test('credit sale (AR up) decreases operating cash; equipment purchase shows in investing', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const ar = await pickFirst({ type: 'ASSET', startsWith: '12' });
    const equipment = await pickFirst({ type: 'ASSET', startsWith: '16', notCode: '16020' });
    const revenue = await pickFirst({ type: 'REVENUE' });

    // Credit sale: Dr AR / Cr Revenue 500 — net income +500, AR working-capital -500.
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-05`,
      branch: TEST_BRANCH,
      debitCode: ar,
      creditCode: revenue,
      amount: '500.00',
    });
    // Buy equipment for cash: Dr Equipment / Cr Cash 700 — investing -700.
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-12`,
      branch: TEST_BRANCH,
      debitCode: equipment,
      creditCode: cash,
      amount: '700.00',
    });

    const cf = await cashFlow({ start_date: START, end_date: END });

    expect(cf.reconciled).toBe(true);
    expect(D(cf.cash_delta).eq(D('-700.00'))).toBe(true);
    expect(D(cf.net_change).eq(D('-700.00'))).toBe(true);
    expect(D(cf.operating.net_income).eq(D('500.00'))).toBe(true);

    const arRow = cf.operating.working_capital.rows.find(r => r.account_code === ar);
    expect(arRow).toBeDefined();
    expect(D(arRow!.amount).eq(D('-500.00'))).toBe(true);

    const eqRow = cf.investing.rows.find(r => r.account_code === equipment);
    expect(eqRow).toBeDefined();
    expect(D(eqRow!.amount).eq(D('-700.00'))).toBe(true);
  });

  test('owner contribution shows as financing inflow', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const capital = await pickFirst({ type: 'EQUITY', startsWith: '31' });

    await makeAndPost({
      entry_date: `${TEST_PERIOD}-15`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: capital,
      amount: '2000.00',
    });

    const cf = await cashFlow({ start_date: START, end_date: END });

    expect(cf.reconciled).toBe(true);
    expect(D(cf.financing.total).eq(D('2000.00'))).toBe(true);
    expect(D(cf.net_change).eq(D('2000.00'))).toBe(true);

    const row = cf.financing.rows.find(r => r.account_code === capital);
    expect(row).toBeDefined();
    expect(D(row!.amount).eq(D('2000.00'))).toBe(true);
  });

  test('cash_begin reflects prior-period postings', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const revenue = await pickFirst({ type: 'REVENUE' });

    // Prior-period cash inflow.
    await makeAndPost({
      entry_date: `${TEST_YEAR}-03-15`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: revenue,
      amount: '300.00',
    });
    // Within-period cash inflow.
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: revenue,
      amount: '150.00',
    });

    const cf = await cashFlow({ start_date: START, end_date: END });

    expect(cf.reconciled).toBe(true);
    expect(D(cf.cash_begin).eq(D('300.00'))).toBe(true);
    expect(D(cf.cash_end).eq(D('450.00'))).toBe(true);
    expect(D(cf.cash_delta).eq(D('150.00'))).toBe(true);
    expect(D(cf.net_change).eq(D('150.00'))).toBe(true);
  });

  test('branch filter scopes both period flows and cash_begin', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const revenue = await pickFirst({ type: 'REVENUE' });

    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: revenue,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-11`,
      branch: OTHER_BRANCH,
      debitCode: cash,
      creditCode: revenue,
      amount: '400.00',
    });

    const tl = await cashFlow({ start_date: START, end_date: END, branch: 'TL' });
    const ek = await cashFlow({ start_date: START, end_date: END, branch: 'EK' });
    const all = await cashFlow({ start_date: START, end_date: END });

    expect(tl.reconciled).toBe(true);
    expect(ek.reconciled).toBe(true);
    expect(all.reconciled).toBe(true);
    expect(D(tl.net_change).eq(D('100.00'))).toBe(true);
    expect(D(ek.net_change).eq(D('400.00'))).toBe(true);
    expect(D(all.net_change).eq(D('500.00'))).toBe(true);
  });

  test('invariant: net_change always equals cash_end - cash_begin across mixed activity', async () => {
    const cash = await pickFirst({ type: 'ASSET', startsWith: '11' });
    const ar = await pickFirst({ type: 'ASSET', startsWith: '12' });
    const equipment = await pickFirst({ type: 'ASSET', startsWith: '16', notCode: '16020' });
    const ap = await pickFirst({ type: 'LIABILITY', startsWith: '21' });
    const capital = await pickFirst({ type: 'EQUITY', startsWith: '31' });
    const revenue = await pickFirst({ type: 'REVENUE' });
    const expense = await pickFirst({ type: 'EXPENSE' });

    await makeAndPost({
      entry_date: `${TEST_PERIOD}-02`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: capital,
      amount: '5000.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-05`,
      branch: TEST_BRANCH,
      debitCode: ar,
      creditCode: revenue,
      amount: '1200.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-09`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: ap,
      amount: '300.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-15`,
      branch: TEST_BRANCH,
      debitCode: equipment,
      creditCode: cash,
      amount: '800.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-22`,
      branch: TEST_BRANCH,
      debitCode: cash,
      creditCode: ar,
      amount: '700.00',
    });

    const cf = await cashFlow({ start_date: START, end_date: END });

    expect(cf.reconciled).toBe(true);
    expect(cf.reconciliation_diff).toBeUndefined();
    // Cash legs: +5000 (capital) - 800 (equipment) + 700 (collection) = +4900.
    expect(D(cf.cash_delta).eq(D('4900.00'))).toBe(true);
    expect(D(cf.net_change).eq(D(cf.cash_delta))).toBe(true);
    // Net income = revenue (1200) - expense (300) = 900.
    expect(D(cf.operating.net_income).eq(D('900.00'))).toBe(true);
  });
});

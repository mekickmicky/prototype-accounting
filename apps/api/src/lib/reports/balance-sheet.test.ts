import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { createDraft, post } from '../../services/journal-entry';
import { balanceSheet } from './balance-sheet';

const TEST_YEAR = 2099;
const TEST_PERIOD = `${TEST_YEAR}-04`;
const TEST_BRANCH = 'TL';
const OTHER_BRANCH = 'EK';
const TEST_USER_EMAIL = 'bs-test@wind';
const AS_OF = new Date(`${TEST_YEAR}-04-30T23:59:59+07:00`);

let TEST_USER_ID = '';

async function pickAssetExpensePair(): Promise<{ asset: string; expense: string }> {
  const [asset, expense] = await Promise.all([
    prisma.account.findFirst({
      where: { is_postable: true, is_active: true, type: 'ASSET' },
      orderBy: { code: 'asc' },
      select: { code: true },
    }),
    prisma.account.findFirst({
      where: { is_postable: true, is_active: true, type: 'EXPENSE' },
      orderBy: { code: 'asc' },
      select: { code: true },
    }),
  ]);
  if (!asset || !expense) throw new Error('seed required: need ≥1 ASSET and ≥1 EXPENSE postable account');
  return { asset: asset.code, expense: expense.code };
}

async function pickAssetRevenuePair(): Promise<{ asset: string; revenue: string }> {
  const [asset, revenue] = await Promise.all([
    prisma.account.findFirst({
      where: { is_postable: true, is_active: true, type: 'ASSET' },
      orderBy: { code: 'asc' },
      select: { code: true },
    }),
    prisma.account.findFirst({
      where: { is_postable: true, is_active: true, type: 'REVENUE' },
      orderBy: { code: 'asc' },
      select: { code: true },
    }),
  ]);
  if (!asset || !revenue) throw new Error('seed required: need ≥1 ASSET and ≥1 REVENUE postable account');
  return { asset: asset.code, revenue: revenue.code };
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
        description: 'bs fixture',
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
    create: { email: TEST_USER_EMAIL, name: 'BS Tester', role: 'ACCOUNTANT' },
  });
  TEST_USER_ID = user.id;

  // Ensure the test fiscal periods exist (createDraft requires an OPEN period).
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

describe('balanceSheet', () => {
  test('is balanced after a single posted JE between asset and expense', async () => {
    const { asset, expense } = await pickAssetExpensePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '500.00',
    });

    const result = await balanceSheet({ as_of: AS_OF });

    expect(result.balanced).toBe(true);
    expect(result.imbalance).toBeUndefined();
    // assets.total === liabilities.total + equity.total
    expect(D(result.assets.total).eq(D(result.total_l_and_e))).toBe(true);
  });

  test('is balanced after revenue posting via on-the-fly current-year-earnings', async () => {
    const { asset, revenue } = await pickAssetRevenuePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: asset,
      creditCode: revenue,
      amount: '750.00',
    });

    const result = await balanceSheet({ as_of: AS_OF });

    expect(result.balanced).toBe(true);
    // YTD net income should reflect the revenue posting (>= 750).
    expect(D(result.net_income_ytd).gte(D('750.00'))).toBe(true);

    // 31030 row carries the on-the-fly amount, not the stored 0.
    const cye = result.equity.items.rows.find(r => r.account_code === '31030');
    expect(cye).toBeDefined();
    expect(D(cye!.amount).eq(D(result.net_income_ytd))).toBe(true);
  });

  test('branch filter selects only that branch and stays balanced', async () => {
    const { asset, expense } = await pickAssetExpensePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-11`,
      branch: OTHER_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '300.00',
    });

    const tlOnly = await balanceSheet({ as_of: AS_OF, branch: 'TL' });
    const ekOnly = await balanceSheet({ as_of: AS_OF, branch: 'EK' });

    expect(tlOnly.balanced).toBe(true);
    expect(ekOnly.balanced).toBe(true);
    // Net income is negative (expense); EK absorbed 3x the loss vs TL.
    expect(D(ekOnly.net_income_ytd).lte(D(tlOnly.net_income_ytd))).toBe(true);
  });

  test('respects as_of cutoff', async () => {
    const { asset, expense } = await pickAssetExpensePair();
    await makeAndPost({
      entry_date: `${TEST_YEAR}-04-10`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: `${TEST_YEAR}-04-25`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '50.00',
    });

    const early = await balanceSheet({ as_of: new Date(`${TEST_YEAR}-04-15T23:59:59+07:00`) });
    const late = await balanceSheet({ as_of: AS_OF });

    expect(early.balanced).toBe(true);
    expect(late.balanced).toBe(true);
    // Late net income absorbs the extra 50 expense → strictly more negative.
    expect(D(late.net_income_ytd).minus(D(early.net_income_ytd)).eq(D('-50.00'))).toBe(true);
  });

  test('reports balanced=false with imbalance when journal_lines are tampered (raw-update bypass)', async () => {
    const { asset, expense } = await pickAssetExpensePair();
    const jeId = await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: expense,
      creditCode: asset,
      amount: '500.00',
    });

    // Sanity check pre-tamper.
    const pre = await balanceSheet({ as_of: AS_OF });
    expect(pre.balanced).toBe(true);

    // Force imbalance: bump the asset-side line's credit by 100 without
    // updating the JE totals. The JE-level CHECK constraint only enforces
    // total_debit = total_credit on the journal_entries row, so tampering at
    // the line level slips through but produces an unbalanced BS aggregation.
    const lines = await prisma.journalLine.findMany({
      where: { je_id: jeId },
      orderBy: { line_no: 'asc' },
    });
    const creditLine = lines.find(l => l.account_code === asset && D(l.credit.toString()).gt(D(0)));
    expect(creditLine).toBeDefined();
    await prisma.journalLine.update({
      where: { id: creditLine!.id },
      data: { credit: D(creditLine!.credit.toString()).plus(D('100.00')).toFixed(2) },
    });

    const post = await balanceSheet({ as_of: AS_OF });
    expect(post.balanced).toBe(false);
    expect(post.imbalance).toBeDefined();
    // Asset side dropped by 100 (extra credit on an asset account); L&E unchanged.
    expect(D(post.imbalance!).eq(D('-100.00'))).toBe(true);
  });

  test('omits header (non-postable) accounts from rows', async () => {
    const result = await balanceSheet({ as_of: AS_OF });
    const allRows = [
      ...result.assets.current.rows,
      ...result.assets.non_current.rows,
      ...result.liabilities.current.rows,
      ...result.liabilities.non_current.rows,
      ...result.equity.items.rows,
    ];
    for (const r of allRows) {
      const acc = await prisma.account.findUnique({ where: { code: r.account_code } });
      expect(acc?.is_postable).toBe(true);
    }
  });

  test('groups assets by code prefix into current vs non-current', async () => {
    const result = await balanceSheet({ as_of: AS_OF });
    for (const r of result.assets.current.rows) {
      expect(['11', '12', '13', '14', '15']).toContain(r.account_code.slice(0, 2));
    }
    for (const r of result.assets.non_current.rows) {
      expect(['16', '17', '18']).toContain(r.account_code.slice(0, 2));
    }
  });
});

import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { createDraft, post } from '../../services/journal-entry';
import { trialBalance } from './trial-balance';

const TEST_PERIOD = '2099-04';
const TEST_BRANCH = 'TL';
const OTHER_BRANCH = 'EK';
const TEST_USER_EMAIL = 'tb-test@wind';
let TEST_USER_ID = '';

async function pickPostablePair(): Promise<{ debit: string; credit: string }> {
  const accounts = await prisma.account.findMany({
    where: { is_postable: true, is_active: true },
    select: { code: true },
    orderBy: { code: 'asc' },
    take: 2,
  });
  if (accounts.length < 2) throw new Error('need ≥2 postable accounts — run db:seed first');
  return { debit: accounts[0]!.code, credit: accounts[1]!.code };
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
        description: 'tb fixture',
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
    where: { je: { period_code: TEST_PERIOD } },
  });
  await prisma.journalEntry.deleteMany({
    where: { period_code: TEST_PERIOD },
  });
  await prisma.journalLine.deleteMany({
    where: { je: { je_no: { startsWith: 'JE-2099-' } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { je_no: { startsWith: 'JE-2099-' } },
  });
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'TB Tester', role: 'ACCOUNTANT' },
  });
  TEST_USER_ID = user.id;
  await clearTestRows();
});

afterEach(async () => {
  await clearTestRows();
});

describe('trialBalance', () => {
  test('returns balanced totals from posted JEs', async () => {
    const { debit: dCode, credit: cCode } = await pickPostablePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-15`,
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '250.50',
    });

    const result = await trialBalance({ as_of: new Date('2099-04-30') });

    expect(D(result.totals.debit).eq(D(result.totals.credit))).toBe(true);
    expect(result.imbalance).toBeUndefined();

    const debitRow = result.rows.find(r => r.account_code === dCode);
    const creditRow = result.rows.find(r => r.account_code === cCode);
    expect(debitRow).toBeDefined();
    expect(creditRow).toBeDefined();
    expect(D(debitRow!.debit_total).gte(D('350.50'))).toBe(true);
    expect(D(creditRow!.credit_total).gte(D('350.50'))).toBe(true);
  });

  test('excludes VOID JEs but counts their POSTED reversals (net zero)', async () => {
    const { debit: dCode, credit: cCode } = await pickPostablePair();
    const originalId = await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '500.00',
    });

    // Baseline before void
    const before = await trialBalance({ as_of: new Date('2099-04-30') });
    const beforeDebit = D(before.rows.find(r => r.account_code === dCode)!.debit_total);
    const beforeCredit = D(before.rows.find(r => r.account_code === cCode)!.credit_total);

    // Simulate void: flip original to VOID, post a reversing JE (debit↔credit swap).
    // We avoid depending on T-2.13 (in progress) by manipulating prisma directly.
    await prisma.journalEntry.update({
      where: { id: originalId },
      data: {
        status: 'VOID',
        voided_at: new Date(),
        voided_by_id: TEST_USER_ID,
        void_reason: 'tb test void',
      },
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: cCode,
      creditCode: dCode,
      amount: '500.00',
    });

    const after = await trialBalance({ as_of: new Date('2099-04-30') });

    // VOID original is excluded; reversal is POSTED. Net effect on each
    // account: zero relative to the pre-void baseline.
    expect(D(after.totals.debit).eq(D(after.totals.credit))).toBe(true);
    expect(after.imbalance).toBeUndefined();

    const afterDebitRow = after.rows.find(r => r.account_code === dCode)!;
    const afterCreditRow = after.rows.find(r => r.account_code === cCode)!;
    // Original VOID removes its 500 debit on dCode; reversal adds 500 credit.
    expect(D(afterDebitRow.debit_total).eq(beforeDebit.minus(D('500.00')))).toBe(true);
    expect(D(afterDebitRow.credit_total).eq(D('500.00'))).toBe(true);
    // Original VOID removes its 500 credit on cCode; reversal adds 500 debit.
    expect(D(afterCreditRow.credit_total).eq(beforeCredit.minus(D('500.00')))).toBe(true);
    expect(D(afterCreditRow.debit_total).eq(D('500.00'))).toBe(true);
  });

  test('filters by branch_code when specified', async () => {
    const { debit: dCode, credit: cCode } = await pickPostablePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: OTHER_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '200.00',
    });

    const tlOnly = await trialBalance({ as_of: new Date('2099-04-30'), branch: 'TL' });
    const ekOnly = await trialBalance({ as_of: new Date('2099-04-30'), branch: 'EK' });
    const all = await trialBalance({ as_of: new Date('2099-04-30'), branch: 'ALL' });

    const tlDebit = D(tlOnly.rows.find(r => r.account_code === dCode)!.debit_total);
    const ekDebit = D(ekOnly.rows.find(r => r.account_code === dCode)!.debit_total);
    const allDebit = D(all.rows.find(r => r.account_code === dCode)!.debit_total);

    // The branch filters together must reconstruct the unfiltered total
    // for these test JEs (other branches contribute equally to TL and EK
    // sides because seed posts predate this test window).
    expect(tlDebit.plus(ekDebit).gte(allDebit.minus(D('0.01')))).toBe(true);
    // TL got +100, EK got +200 from this test
    expect(ekDebit.minus(tlDebit).eq(D('100.00'))).toBe(true);
  });

  test('respects as_of cutoff (entry_date <= as_of)', async () => {
    const { debit: dCode, credit: cCode } = await pickPostablePair();
    await makeAndPost({
      entry_date: '2099-04-10',
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '100.00',
    });
    await makeAndPost({
      entry_date: '2099-04-25',
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '50.00',
    });

    const early = await trialBalance({ as_of: new Date('2099-04-15') });
    const late = await trialBalance({ as_of: new Date('2099-04-30') });

    const earlyDebit = D(early.rows.find(r => r.account_code === dCode)!.debit_total);
    const lateDebit = D(late.rows.find(r => r.account_code === dCode)!.debit_total);

    // Late minus early should equal the second JE's amount (50.00).
    expect(lateDebit.minus(earlyDebit).eq(D('50.00'))).toBe(true);
  });

  test('excludes header (non-postable) accounts from rows', async () => {
    const result = await trialBalance({ as_of: new Date('2099-04-30') });
    for (const r of result.rows) {
      const acc = await prisma.account.findUnique({ where: { code: r.account_code } });
      expect(acc?.is_postable).toBe(true);
    }
  });

  test('grouped_by_type rolls postable rows up by AccountType when requested', async () => {
    const { debit: dCode, credit: cCode } = await pickPostablePair();
    await makeAndPost({
      entry_date: `${TEST_PERIOD}-10`,
      branch: TEST_BRANCH,
      debitCode: dCode,
      creditCode: cCode,
      amount: '100.00',
    });

    const result = await trialBalance({
      as_of: new Date('2099-04-30'),
      group_by_type: true,
    });

    expect(result.grouped_by_type).toBeDefined();
    const totalGroupDebit = result.grouped_by_type!.reduce(
      (acc, g) => acc.plus(D(g.debit_total)),
      D(0),
    );
    const totalGroupCredit = result.grouped_by_type!.reduce(
      (acc, g) => acc.plus(D(g.credit_total)),
      D(0),
    );
    // Group rollups must reconcile to the grand totals.
    expect(totalGroupDebit.eq(D(result.totals.debit))).toBe(true);
    expect(totalGroupCredit.eq(D(result.totals.credit))).toBe(true);
  });

  test('omits grouped_by_type by default', async () => {
    const result = await trialBalance({ as_of: new Date('2099-04-30') });
    expect(result.grouped_by_type).toBeUndefined();
  });
});

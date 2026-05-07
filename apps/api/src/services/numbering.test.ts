import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { prisma } from '../lib/prisma';
import { nextDocNo } from './numbering';

const TEST_YEAR = 2099;
const TEST_BRANCH = 'TL';

async function ensurePeriod(): Promise<void> {
  await prisma.fiscalPeriod.upsert({
    where: { code: `${TEST_YEAR}-01` },
    update: {},
    create: {
      code: `${TEST_YEAR}-01`,
      start_date: new Date(`${TEST_YEAR}-01-01T00:00:00Z`),
      end_date: new Date(`${TEST_YEAR}-01-31T00:00:00Z`),
      status: 'OPEN',
    },
  });
}

async function pickUserId(): Promise<string> {
  const u = await prisma.user.findFirst({ select: { id: true } });
  if (!u) throw new Error('seed user missing — run db:seed first');
  return u.id;
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
  await prisma.journalLine.deleteMany({
    where: { je: { je_no: { startsWith: `JE-${TEST_YEAR}-` } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { je_no: { startsWith: `JE-${TEST_YEAR}-` } },
  });
}

beforeAll(async () => {
  await ensurePeriod();
  await clearTestRows();
});

afterEach(async () => {
  await clearTestRows();
});

describe('nextDocNo', () => {
  test('returns JE-YYYY-0001 when no rows exist', async () => {
    const num = await prisma.$transaction(async (tx) => {
      return nextDocNo(tx, 'JE', TEST_YEAR, 'journal_entries', 'je_no');
    });
    expect(num).toBe(`JE-${TEST_YEAR}-0001`);
  });

  test('zero-pads to 4 digits and increments past existing rows', async () => {
    const userId = await pickUserId();
    const accountCode = await pickAccount();

    // Seed an existing JE-2099-0042 to prove MAX detection.
    await prisma.journalEntry.create({
      data: {
        je_no: `JE-${TEST_YEAR}-0042`,
        entry_date: new Date(`${TEST_YEAR}-01-15T00:00:00Z`),
        period_code: `${TEST_YEAR}-01`,
        branch_code: TEST_BRANCH,
        description: 'fixture',
        source_type: 'MANUAL',
        status: 'DRAFT',
        posted_by_id: userId,
        lines: {
          create: [
            { line_no: 1, account_code: accountCode, branch_code: TEST_BRANCH, debit: 1, credit: 0 },
            { line_no: 2, account_code: accountCode, branch_code: TEST_BRANCH, debit: 0, credit: 1 },
          ],
        },
      },
    });

    const num = await prisma.$transaction(async (tx) => {
      return nextDocNo(tx, 'JE', TEST_YEAR, 'journal_entries', 'je_no');
    });
    expect(num).toBe(`JE-${TEST_YEAR}-0043`);
  });

  test('throws when called outside a transaction', async () => {
    await expect(
      // Intentionally pass the base client to verify the runtime guard.
      nextDocNo(prisma as never, 'JE', TEST_YEAR, 'journal_entries', 'je_no'),
    ).rejects.toThrow(/inside prisma\.\$transaction/);
  });

  test('rejects unsupported prefix, table, column, and year', async () => {
    await prisma.$transaction(async (tx) => {
      await expect(nextDocNo(tx, 'XX' as never, TEST_YEAR, 'journal_entries', 'je_no'))
        .rejects.toThrow(/unsupported prefix/);
      await expect(nextDocNo(tx, 'JE', TEST_YEAR, 'evil; DROP TABLE x', 'je_no'))
        .rejects.toThrow(/unsupported table/);
      await expect(nextDocNo(tx, 'JE', TEST_YEAR, 'journal_entries', 'evil; --'))
        .rejects.toThrow(/unsupported column/);
      await expect(nextDocNo(tx, 'JE', 1800, 'journal_entries', 'je_no'))
        .rejects.toThrow(/invalid year/);
    });
  });

  test('10 concurrent transactions allocate sequential numbers without duplicates', async () => {
    const userId = await pickUserId();
    const accountCode = await pickAccount();

    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        prisma.$transaction(async (tx) => {
          const num = await nextDocNo(tx, 'JE', TEST_YEAR, 'journal_entries', 'je_no');
          // Insert the row inside the same tx so the next allocator sees it
          // when it computes MAX. This mirrors how callers will use it.
          await tx.journalEntry.create({
            data: {
              je_no: num,
              entry_date: new Date(`${TEST_YEAR}-01-15T00:00:00Z`),
              period_code: `${TEST_YEAR}-01`,
              branch_code: TEST_BRANCH,
              description: `concurrent ${num}`,
              source_type: 'MANUAL',
              status: 'DRAFT',
              posted_by_id: userId,
              lines: {
                create: [
                  { line_no: 1, account_code: accountCode, branch_code: TEST_BRANCH, debit: 1, credit: 0 },
                  { line_no: 2, account_code: accountCode, branch_code: TEST_BRANCH, debit: 0, credit: 1 },
                ],
              },
            },
          });
          return num;
        }),
      ),
    );

    const sorted = [...results].sort();
    const expected = Array.from({ length: N }, (_, i) =>
      `JE-${TEST_YEAR}-${String(i + 1).padStart(4, '0')}`,
    );
    expect(sorted).toEqual(expected);
    expect(new Set(results).size).toBe(N);
  });
});

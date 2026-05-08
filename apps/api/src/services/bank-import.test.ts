import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { prisma } from '../lib/prisma';
import { importStatement } from './bank-import';

const TEST_BANK_CODE = 'TEST-IMPORT-001';
const TEST_GL_CODE = '11020';
let bankAccountId = '';

async function clearTransactions(): Promise<void> {
  if (!bankAccountId) return;
  await prisma.auditLog.deleteMany({
    where: { entity_type: 'BankAccount', entity_id: bankAccountId },
  });
  await prisma.bankTransaction.deleteMany({ where: { bank_account_id: bankAccountId } });
}

beforeAll(async () => {
  const gl = await prisma.account.findUnique({ where: { code: TEST_GL_CODE } });
  if (!gl) throw new Error(`gl account ${TEST_GL_CODE} missing — run db:seed first`);

  const acc = await prisma.bankAccount.upsert({
    where: { code: TEST_BANK_CODE },
    update: {},
    create: {
      code: TEST_BANK_CODE,
      name: 'Test Bank Import Account',
      bank_name: 'KBANK',
      account_number: '000-0-00000-0',
      gl_account_code: TEST_GL_CODE,
      is_active: true,
    },
  });
  bankAccountId = acc.id;
});

beforeEach(clearTransactions);

afterAll(async () => {
  await clearTransactions();
  if (bankAccountId) {
    await prisma.bankAccount.delete({ where: { id: bankAccountId } });
  }
});

describe('importStatement (mock)', () => {
  test('first import inserts all rows; re-import inserts 0 (all skipped)', async () => {
    const dateFrom = new Date('2026-05-01T00:00:00Z');
    const dateTo = new Date('2026-05-31T23:59:59Z');

    const r1 = await importStatement(
      bankAccountId,
      { use_mock: true, date_from: dateFrom, date_to: dateTo },
    );
    expect(r1.imported).toBeGreaterThan(0);
    expect(r1.skipped).toBe(0);

    const count1 = await prisma.bankTransaction.count({ where: { bank_account_id: bankAccountId } });
    expect(count1).toBe(r1.imported);

    const r2 = await importStatement(
      bankAccountId,
      { use_mock: true, date_from: dateFrom, date_to: dateTo },
    );
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(r1.imported);

    const count2 = await prisma.bankTransaction.count({ where: { bank_account_id: bankAccountId } });
    expect(count2).toBe(count1);

    const audits = await prisma.auditLog.findMany({
      where: { entity_type: 'BankAccount', entity_id: bankAccountId, action: 'IMPORT' },
    });
    expect(audits.length).toBe(2);
  });

  test('CSV import dedupes by composite hash when bank_ref absent', async () => {
    const csv = [
      'Date,Description,Debit,Credit,Balance',
      '07/05/2026,TRF FROM SOMCHAI,,5350.00,125640.00',
      '07/05/2026,QR PMT,,1500.00,127140.00',
      '08/05/2026,TRF TO SUPPLIER A,3200.00,,123940.00',
    ].join('\n');

    const r1 = await importStatement(bankAccountId, {
      csv_content: csv,
      date_from: new Date('2026-05-01T00:00:00Z'),
      date_to: new Date('2026-05-31T23:59:59Z'),
    });
    expect(r1.imported).toBe(3);
    expect(r1.skipped).toBe(0);

    const r2 = await importStatement(bankAccountId, {
      csv_content: csv,
      date_from: new Date('2026-05-01T00:00:00Z'),
      date_to: new Date('2026-05-31T23:59:59Z'),
    });
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(3);
  });

  test('rejects when neither use_mock nor csv_content is provided', async () => {
    await expect(
      importStatement(bankAccountId, {
        date_from: new Date('2026-05-01T00:00:00Z'),
        date_to: new Date('2026-05-31T23:59:59Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('rejects unknown bank account', async () => {
    await expect(
      importStatement('does-not-exist', {
        use_mock: true,
        date_from: new Date('2026-05-01T00:00:00Z'),
        date_to: new Date('2026-05-31T23:59:59Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

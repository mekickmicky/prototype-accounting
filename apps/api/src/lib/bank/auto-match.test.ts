import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { suggestMatches } from './auto-match';

const TEST_BANK_CODE = 'TEST-AM-001';
const TEST_GL_CODE = '11020';
const TEST_CUSTOMER_CODE = 'TEST-AM-CUST-1';
const TEST_RECEIPT_NO = 'TEST-AM-RCT-0001';

let bankAccountId = '';
let customerId = '';
let receiptId = '';

async function cleanup(): Promise<void> {
  if (receiptId) {
    await prisma.bankTransaction.deleteMany({
      where: { reconciled_with_type: 'RECEIPT', reconciled_with_id: receiptId },
    });
    await prisma.receipt.deleteMany({ where: { id: receiptId } });
  }
  if (customerId) {
    await prisma.customer.deleteMany({ where: { id: customerId } });
  }
  if (bankAccountId) {
    await prisma.bankTransaction.deleteMany({ where: { bank_account_id: bankAccountId } });
    await prisma.bankAccount.deleteMany({ where: { id: bankAccountId } });
  }
}

beforeAll(async () => {
  const gl = await prisma.account.findUnique({ where: { code: TEST_GL_CODE } });
  if (!gl) throw new Error(`gl account ${TEST_GL_CODE} missing — run db:seed first`);

  const acc = await prisma.bankAccount.upsert({
    where: { code: TEST_BANK_CODE },
    update: {},
    create: {
      code: TEST_BANK_CODE,
      name: 'Auto-match Test Bank',
      bank_name: 'KBANK',
      account_number: '000-0-00000-0',
      gl_account_code: TEST_GL_CODE,
      is_active: true,
    },
  });
  bankAccountId = acc.id;

  const customer = await prisma.customer.upsert({
    where: { code: TEST_CUSTOMER_CODE },
    update: {},
    create: {
      code: TEST_CUSTOMER_CODE,
      name: 'Somchai Phon',
      name_th: 'สมชาย พล',
      is_active: true,
    },
  });
  customerId = customer.id;

  await prisma.receipt.deleteMany({ where: { receipt_no: TEST_RECEIPT_NO } });
  const receipt = await prisma.receipt.create({
    data: {
      receipt_no: TEST_RECEIPT_NO,
      customer_id: customerId,
      branch_code: 'TL',
      receipt_date: new Date(Date.UTC(2026, 4, 7)),
      total_amount: '1500.00',
      payment_method: 'TRANSFER',
      bank_account_id: bankAccountId,
      status: 'POSTED',
    },
  });
  receiptId = receipt.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('suggestMatches', () => {
  test('top suggestion confidence >= 0.85 for exact-amount, ±1 day, counterparty in description', async () => {
    const result = await suggestMatches({
      bank_account_id: bankAccountId,
      txn_date: new Date(Date.UTC(2026, 4, 8)),
      description: 'TRF FROM Somchai - Invoice payment',
      debit: '0.00',
      credit: '1500.00',
    });

    expect(result.length).toBeGreaterThan(0);
    const top = result[0]!;
    expect(top.type).toBe('RECEIPT');
    expect(top.id).toBe(receiptId);
    expect(top.descriptionMatched).toBe(true);
    expect(top.daysDiff).toBe(1);
    expect(top.amountDiff.eq(D(0))).toBe(true);
    expect(top.confidence).toBeGreaterThanOrEqual(0.85);
    expect(top.tier === 'AUTO_CONFIRM' || top.tier === 'SUGGEST').toBe(true);
  });

  test('returns empty when amount is far off (outside ±0.01)', async () => {
    const result = await suggestMatches({
      bank_account_id: bankAccountId,
      txn_date: new Date(Date.UTC(2026, 4, 8)),
      description: 'TRF FROM Somchai',
      debit: '0.00',
      credit: '9999.00',
    });
    expect(result.find((s) => s.id === receiptId)).toBeUndefined();
  });

  test('returns empty when date is outside ±3 days', async () => {
    const result = await suggestMatches({
      bank_account_id: bankAccountId,
      txn_date: new Date(Date.UTC(2026, 4, 20)),
      description: 'TRF FROM Somchai',
      debit: '0.00',
      credit: '1500.00',
    });
    expect(result.find((s) => s.id === receiptId)).toBeUndefined();
  });

  test('matched receipt is excluded from candidates', async () => {
    const bankTxn = await prisma.bankTransaction.create({
      data: {
        bank_account_id: bankAccountId,
        txn_date: new Date(Date.UTC(2026, 4, 8)),
        description: 'TRF FROM Somchai',
        debit: '0.00',
        credit: '1500.00',
        reconciled_with_type: 'RECEIPT',
        reconciled_with_id: receiptId,
        reconciled_at: new Date(),
      },
    });

    try {
      const result = await suggestMatches({
        bank_account_id: bankAccountId,
        txn_date: new Date(Date.UTC(2026, 4, 9)),
        description: 'TRF FROM Somchai',
        debit: '0.00',
        credit: '1500.00',
      });
      expect(result.find((s) => s.id === receiptId)).toBeUndefined();
    } finally {
      await prisma.bankTransaction.delete({ where: { id: bankTxn.id } });
    }
  });

  test('returns [] when both debit and credit are zero', async () => {
    const result = await suggestMatches({
      bank_account_id: bankAccountId,
      txn_date: new Date(Date.UTC(2026, 4, 8)),
      description: 'noop',
      debit: '0.00',
      credit: '0.00',
    });
    expect(result).toEqual([]);
  });
});

import { describe, test, expect } from 'bun:test';
import { Decimal } from '@wind-acc/shared';
import { MockBankProvider } from './mock-provider';

describe('MockBankProvider.importStatement', () => {
  test('returns 30-50 deterministic txns for May 2026 KBANK-001', async () => {
    const p = new MockBankProvider();
    const dateFrom = new Date('2026-05-01T00:00:00Z');
    const dateTo = new Date('2026-05-31T00:00:00Z');

    const r1 = await p.importStatement({ bankAccountCode: 'KBANK-001', dateFrom, dateTo });
    const r2 = await p.importStatement({ bankAccountCode: 'KBANK-001', dateFrom, dateTo });

    expect(r1.length).toBeGreaterThanOrEqual(30);
    expect(r1.length).toBeLessThanOrEqual(50);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));

    const cr = r1.filter((t) => t.credit.gt(0)).length;
    const dr = r1.filter((t) => t.debit.gt(0)).length;
    const crPct = cr / r1.length;
    // Spec says "roughly 60/40" CR-heavy for an incoming clinic — accept a
    // wide band around 60% to absorb seeded-RNG variance on small samples.
    expect(crPct).toBeGreaterThan(0.5);
    expect(crPct).toBeLessThan(0.8);
    expect(cr + dr).toBe(r1.length);
  });

  test('skips weekends', async () => {
    const p = new MockBankProvider();
    const r = await p.importStatement({
      bankAccountCode: 'KBANK-001',
      dateFrom: new Date('2026-05-01T00:00:00Z'),
      dateTo: new Date('2026-05-31T00:00:00Z'),
    });
    for (const t of r) {
      const dow = t.txnDate.getUTCDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  test('different bank account codes produce different streams', async () => {
    const p = new MockBankProvider();
    const dateFrom = new Date('2026-05-01T00:00:00Z');
    const dateTo = new Date('2026-05-31T00:00:00Z');
    const r1 = await p.importStatement({ bankAccountCode: 'KBANK-001', dateFrom, dateTo });
    const r2 = await p.importStatement({ bankAccountCode: 'KBANK-002', dateFrom, dateTo });
    expect(JSON.stringify(r1)).not.toBe(JSON.stringify(r2));
  });
});

describe('MockBankProvider.verifySlip', () => {
  test('MOCK-INVALID prefix returns verified=false', async () => {
    const p = new MockBankProvider();
    const result = await p.verifySlip({ slipRef: 'MOCK-INVALID-XYZ' });
    expect(result.verified).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  test('MOCK-MISMATCH returns verified=true with amount off by 100', async () => {
    const p = new MockBankProvider();
    const result = await p.verifySlip({
      slipRef: 'MOCK-MISMATCH-1234',
      expectedAmount: new Decimal(5000),
    });
    expect(result.verified).toBe(true);
    expect(result.details?.amount.toString()).toBe('4900');
  });

  test('default ref returns verified=true with realistic data', async () => {
    const p = new MockBankProvider();
    const result = await p.verifySlip({
      slipRef: 'SLIP-ABC-123',
      expectedAmount: new Decimal(1500),
    });
    expect(result.verified).toBe(true);
    expect(result.details?.amount.toString()).toBe('1500');
    expect(result.details?.receiver.name).toContain('WIND');
  });
});

describe('MockBankProvider.getBalance', () => {
  test('returns deterministic balance >= 500000', async () => {
    const p = new MockBankProvider();
    const b1 = await p.getBalance('KBANK-001');
    const b2 = await p.getBalance('KBANK-001');
    expect(b1.eq(b2)).toBe(true);
    expect(b1.gte(500_000)).toBe(true);
  });
});

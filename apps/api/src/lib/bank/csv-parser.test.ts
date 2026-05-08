import { describe, test, expect } from 'bun:test';
import { Decimal } from '@wind-acc/shared';
import { parseBankCSV } from './csv-parser';
import { BusinessRuleError } from '../errors';

const KBANK_CSV = `Date,Time,Description,Debit,Credit,Balance
07/05/2026,09:15,TRF FROM 0123-45-6789 / SOMCHAI,,"5,350.00","125,640.00"
07/05/2026,11:30,QR PMT,,1500.00,127140.00
08/05/2026,14:22,TRF TO 9876-54-3210 / SUPPLIER A,"3,200.00",,123940.00
`;

const SCB_CSV = `Statement of Account
Account: 123-4-56789-0
Period: 01/05/2026 - 31/05/2026

Transaction Date,Description,Withdrawal,Deposit,Balance
05/05/2026,TRANSFER IN - WIND CLINIC,,"10,000.00","60,000.00"
06/05/2026,FEE - MAINTENANCE,30.00,,59970.00
`;

const BBL_CSV = `Date,Description,Withdrawal,Deposit,Balance
01/05/2026,OPENING BALANCE,,,"500,000.00"
02/05/2026,SALARY,,"25,000.00","525,000.00"
03/05/2026,UTILITY BILL,"1,234.56",,"523,765.44"
`;

describe('parseBankCSV', () => {
  test('parses KBank format with comma thousands and quoted fields', () => {
    const rows = parseBankCSV(KBANK_CSV);
    expect(rows).toHaveLength(3);

    expect(rows[0].description).toBe('TRF FROM 0123-45-6789 / SOMCHAI');
    expect(rows[0].debit.eq(0)).toBe(true);
    expect(rows[0].credit.eq(new Decimal('5350'))).toBe(true);
    expect(rows[0].balance?.eq(new Decimal('125640'))).toBe(true);
    expect(rows[0].bankRef).toBe('');

    expect(rows[2].debit.eq(new Decimal('3200'))).toBe(true);
    expect(rows[2].credit.eq(0)).toBe(true);
  });

  test('parses SCB format and skips opening rows', () => {
    const rows = parseBankCSV(SCB_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0].credit.eq(new Decimal('10000'))).toBe(true);
    expect(rows[1].debit.eq(new Decimal('30'))).toBe(true);
  });

  test('parses BBL format', () => {
    const rows = parseBankCSV(BBL_CSV);
    expect(rows).toHaveLength(3);
    expect(rows[0].description).toBe('OPENING BALANCE');
    expect(rows[0].debit.eq(0)).toBe(true);
    expect(rows[0].credit.eq(0)).toBe(true);
    expect(rows[2].debit.eq(new Decimal('1234.56'))).toBe(true);
  });

  test('uses Asia/Bangkok timezone when computing UTC date', () => {
    const rows = parseBankCSV(KBANK_CSV);
    // 07/05/2026 09:15 Bangkok = 02:15 UTC
    const d = rows[0].txnDate;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(4);
    expect(d.getUTCDate()).toBe(7);
    expect(d.getUTCHours()).toBe(2);
    expect(d.getUTCMinutes()).toBe(15);
  });

  test('throws INVALID_CSV with line ref for malformed amount', () => {
    const bad = `Date,Description,Debit,Credit,Balance
07/05/2026,FOO,abc,,1000.00
`;
    try {
      parseBankCSV(bad);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      const err = e as BusinessRuleError;
      expect(err.code).toBe('INVALID_CSV');
      expect((err.context as { line: number }).line).toBe(2);
    }
  });

  test('throws INVALID_CSV when header is unrecognized', () => {
    const bad = `Foo,Bar,Baz
07/05/2026,x,y
`;
    try {
      parseBankCSV(bad);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('INVALID_CSV');
    }
  });

  test('throws INVALID_CSV on empty input', () => {
    try {
      parseBankCSV('');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(BusinessRuleError);
      expect((e as BusinessRuleError).code).toBe('INVALID_CSV');
    }
  });
});

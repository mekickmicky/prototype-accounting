import { describe, test, expect } from 'bun:test';
import { D } from '@wind-acc/shared';
import { dateRangeForPeriod, previousPeriod, branchClause, pctChange } from './common';

describe('dateRangeForPeriod', () => {
  test('start is midnight on the 1st in Bangkok time (UTC+7)', () => {
    const { start } = dateRangeForPeriod('2026-05');
    // 2026-05-01 00:00:00 +07:00 = 2026-04-30 17:00:00 UTC
    expect(start.toISOString()).toBe('2026-04-30T17:00:00.000Z');
  });

  test('end is 23:59:59.999 Bangkok on the last day of the month', () => {
    const { end } = dateRangeForPeriod('2026-05');
    // 2026-06-01 00:00:00 +07:00 = 2026-05-31 17:00:00 UTC; minus 1ms = 2026-05-31 16:59:59.999 UTC
    expect(end.toISOString()).toBe('2026-05-31T16:59:59.999Z');
  });

  test('handles December (month 12) correctly', () => {
    const { start, end } = dateRangeForPeriod('2026-12');
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T16:59:59.999Z');
  });

  test('handles January (month 01) correctly', () => {
    const { start, end } = dateRangeForPeriod('2026-01');
    expect(start.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-31T16:59:59.999Z');
  });

  test('start is before end', () => {
    const periods = ['2026-01', '2026-02', '2026-05', '2026-12'];
    for (const code of periods) {
      const { start, end } = dateRangeForPeriod(code);
      expect(start < end).toBe(true);
    }
  });

  test('end of one period is before start of the next', () => {
    const { end: mayEnd } = dateRangeForPeriod('2026-05');
    const { start: junStart } = dateRangeForPeriod('2026-06');
    expect(mayEnd < junStart).toBe(true);
  });
});

describe('previousPeriod', () => {
  test('decrements month within a year', () => {
    expect(previousPeriod('2026-05')).toBe('2026-04');
    expect(previousPeriod('2026-12')).toBe('2026-11');
    expect(previousPeriod('2026-02')).toBe('2026-01');
  });

  test('rolls back to December of the prior year for January', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(previousPeriod('2000-01')).toBe('1999-12');
  });

  test('zero-pads month to two digits', () => {
    expect(previousPeriod('2026-10')).toBe('2026-09');
    expect(previousPeriod('2026-02')).toBe('2026-01');
  });
});

describe('branchClause', () => {
  test('returns empty object for ALL', () => {
    expect(branchClause('ALL')).toEqual({});
  });

  test('returns branch_code filter for specific branches', () => {
    expect(branchClause('TL')).toEqual({ branch_code: 'TL' });
    expect(branchClause('EK')).toEqual({ branch_code: 'EK' });
    expect(branchClause('RAMA9')).toEqual({ branch_code: 'RAMA9' });
  });
});

describe('pctChange', () => {
  test('computes positive percentage change', () => {
    const result = pctChange(D('100'), D('125'));
    expect(result!.toFixed(2)).toBe('25.00');
  });

  test('computes negative percentage change', () => {
    const result = pctChange(D('200'), D('150'));
    expect(result!.toFixed(2)).toBe('-25.00');
  });

  test('returns null when base is zero', () => {
    expect(pctChange(D('0'), D('100'))).toBeNull();
  });

  test('handles negative base (expense increased)', () => {
    // Base = -100 (expense), current = -120 (expense increased)
    // pct = (-120 - -100) / |-100| * 100 = -20/100 * 100 = -20
    const result = pctChange(D('-100'), D('-120'));
    expect(result!.toFixed(2)).toBe('-20.00');
  });
});

import type { TrialBalanceResult } from '../reports/trial-balance';
import type { ArAgingResult } from '../reports/ar-aging';
import type { ApAgingResult } from '../reports/ap-aging';

const UTF8_BOM = '﻿';

function csvEsc(v: string): string {
  return /[,"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildTrialBalanceCSV(result: TrialBalanceResult): string {
  const lines: string[] = [
    'Account Code,Name (TH),Name (EN),Type,Debit Total,Credit Total,Balance',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        csvEsc(row.account_code),
        csvEsc(row.name_th),
        csvEsc(row.name_en),
        row.type,
        row.debit_total,
        row.credit_total,
        row.balance,
      ].join(','),
    );
  }

  lines.push(
    ['', 'GRAND TOTAL', '', '', result.totals.debit, result.totals.credit, result.totals.balance].join(','),
  );

  return UTF8_BOM + lines.join('\r\n');
}

export function buildArAgingCSV(result: ArAgingResult): string {
  const lines: string[] = [
    'Customer Code,Customer Name,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        csvEsc(row.customer_code),
        csvEsc(row.customer_name),
        row.current,
        row.b1_30,
        row.b31_60,
        row.b61_90,
        row.b90plus,
        row.total,
      ].join(','),
    );
  }

  lines.push(
    [
      '',
      'TOTAL',
      result.totals.current,
      result.totals.b1_30,
      result.totals.b31_60,
      result.totals.b61_90,
      result.totals.b90plus,
      result.totals.total,
    ].join(','),
  );

  return UTF8_BOM + lines.join('\r\n');
}

export function buildApAgingCSV(result: ApAgingResult): string {
  const lines: string[] = [
    'Vendor Code,Vendor Name,Current,1-30 Days,31-60 Days,61-90 Days,90+ Days,Total',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        csvEsc(row.vendor_code),
        csvEsc(row.vendor_name),
        row.current,
        row.b1_30,
        row.b31_60,
        row.b61_90,
        row.b90plus,
        row.total,
      ].join(','),
    );
  }

  lines.push(
    [
      '',
      'TOTAL',
      result.totals.current,
      result.totals.b1_30,
      result.totals.b31_60,
      result.totals.b61_90,
      result.totals.b90plus,
      result.totals.total,
    ].join(','),
  );

  return UTF8_BOM + lines.join('\r\n');
}

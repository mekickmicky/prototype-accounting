import type { TrialBalanceResult } from '../reports/trial-balance';

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

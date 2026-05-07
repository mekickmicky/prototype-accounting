import ExcelJS from 'exceljs';
import { D } from '@wind-acc/shared';
import type { TrialBalanceResult } from '../reports/trial-balance';

const MONEY_FMT = '#,##0.00;(#,##0.00);"—"';

const TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expenses',
};

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

function applyMoneyCell(cell: ExcelJS.Cell): void {
  cell.numFmt = MONEY_FMT;
  cell.alignment = { horizontal: 'right' };
}

export async function buildTrialBalanceXLSX(result: TrialBalanceResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('Trial Balance');
  ws.columns = [
    { header: 'Account Code', key: 'code', width: 14 },
    { header: 'Name (TH)', key: 'name_th', width: 36 },
    { header: 'Name (EN)', key: 'name_en', width: 30 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Debit Total', key: 'debit', width: 16 },
    { header: 'Credit Total', key: 'credit', width: 16 },
    { header: 'Balance', key: 'balance', width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['debit', 'credit', 'balance'] as const).forEach(k =>
    headerRow.getCell(k).alignment = { horizontal: 'right' },
  );

  const grouped = new Map<string, typeof result.rows>();
  for (const row of result.rows) {
    const bucket = grouped.get(row.type) ?? [];
    bucket.push(row);
    grouped.set(row.type, bucket);
  }

  for (const type of TYPE_ORDER) {
    const rows = grouped.get(type);
    if (!rows || rows.length === 0) continue;

    const sectionRow = ws.addRow({ code: '', name_th: TYPE_LABELS[type] ?? type, name_en: '', type: '', debit: null, credit: null, balance: null });
    sectionRow.font = { bold: true, italic: true };
    sectionRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    for (const row of rows) {
      const r = ws.addRow({
        code: row.account_code,
        name_th: row.name_th,
        name_en: row.name_en,
        type: row.type,
        debit: D(row.debit_total).toNumber(),
        credit: D(row.credit_total).toNumber(),
        balance: D(row.balance).toNumber(),
      });
      applyMoneyCell(r.getCell('debit'));
      applyMoneyCell(r.getCell('credit'));
      applyMoneyCell(r.getCell('balance'));
    }
  }

  const totalsRow = ws.addRow({
    code: '',
    name_th: 'GRAND TOTAL',
    name_en: '',
    type: '',
    debit: D(result.totals.debit).toNumber(),
    credit: D(result.totals.credit).toNumber(),
    balance: D(result.totals.balance).toNumber(),
  });
  totalsRow.font = { bold: true };
  applyMoneyCell(totalsRow.getCell('debit'));
  applyMoneyCell(totalsRow.getCell('credit'));
  applyMoneyCell(totalsRow.getCell('balance'));

  const raw = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
}

import ExcelJS from 'exceljs';
import { D } from '@wind-acc/shared';
import type { TrialBalanceResult } from '../reports/trial-balance';
import type { ArAgingResult } from '../reports/ar-aging';
import type { ApAgingResult } from '../reports/ap-aging';

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

export async function buildArAgingXLSX(result: ArAgingResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('AR Aging');
  ws.columns = [
    { header: 'Customer Code', key: 'code', width: 16 },
    { header: 'Customer Name', key: 'name', width: 36 },
    { header: 'Current', key: 'current', width: 16 },
    { header: '1-30 Days', key: 'b1_30', width: 16 },
    { header: '31-60 Days', key: 'b31_60', width: 16 },
    { header: '61-90 Days', key: 'b61_90', width: 16 },
    { header: '90+ Days', key: 'b90plus', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['current', 'b1_30', 'b31_60', 'b61_90', 'b90plus', 'total'] as const).forEach(k =>
    (headerRow.getCell(k).alignment = { horizontal: 'right' }),
  );

  const moneyCols = ['current', 'b1_30', 'b31_60', 'b61_90', 'b90plus', 'total'] as const;

  for (const row of result.rows) {
    const r = ws.addRow({
      code: row.customer_code,
      name: row.customer_name,
      current: D(row.current).toNumber(),
      b1_30: D(row.b1_30).toNumber(),
      b31_60: D(row.b31_60).toNumber(),
      b61_90: D(row.b61_90).toNumber(),
      b90plus: D(row.b90plus).toNumber(),
      total: D(row.total).toNumber(),
    });
    moneyCols.forEach(k => applyMoneyCell(r.getCell(k)));
  }

  const totalsRow = ws.addRow({
    code: '',
    name: 'TOTAL',
    current: D(result.totals.current).toNumber(),
    b1_30: D(result.totals.b1_30).toNumber(),
    b31_60: D(result.totals.b31_60).toNumber(),
    b61_90: D(result.totals.b61_90).toNumber(),
    b90plus: D(result.totals.b90plus).toNumber(),
    total: D(result.totals.total).toNumber(),
  });
  totalsRow.font = { bold: true };
  moneyCols.forEach(k => applyMoneyCell(totalsRow.getCell(k)));

  const raw2 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw2) ? raw2 : Buffer.from(raw2 as ArrayBuffer);
}

export async function buildApAgingXLSX(result: ApAgingResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('AP Aging');
  ws.columns = [
    { header: 'Vendor Code', key: 'code', width: 16 },
    { header: 'Vendor Name', key: 'name', width: 36 },
    { header: 'Current', key: 'current', width: 16 },
    { header: '1-30 Days', key: 'b1_30', width: 16 },
    { header: '31-60 Days', key: 'b31_60', width: 16 },
    { header: '61-90 Days', key: 'b61_90', width: 16 },
    { header: '90+ Days', key: 'b90plus', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['current', 'b1_30', 'b31_60', 'b61_90', 'b90plus', 'total'] as const).forEach(k =>
    (headerRow.getCell(k).alignment = { horizontal: 'right' }),
  );

  const moneyCols = ['current', 'b1_30', 'b31_60', 'b61_90', 'b90plus', 'total'] as const;

  for (const row of result.rows) {
    const r = ws.addRow({
      code: row.vendor_code,
      name: row.vendor_name,
      current: D(row.current).toNumber(),
      b1_30: D(row.b1_30).toNumber(),
      b31_60: D(row.b31_60).toNumber(),
      b61_90: D(row.b61_90).toNumber(),
      b90plus: D(row.b90plus).toNumber(),
      total: D(row.total).toNumber(),
    });
    moneyCols.forEach(k => applyMoneyCell(r.getCell(k)));
  }

  const totalsRow = ws.addRow({
    code: '',
    name: 'TOTAL',
    current: D(result.totals.current).toNumber(),
    b1_30: D(result.totals.b1_30).toNumber(),
    b31_60: D(result.totals.b31_60).toNumber(),
    b61_90: D(result.totals.b61_90).toNumber(),
    b90plus: D(result.totals.b90plus).toNumber(),
    total: D(result.totals.total).toNumber(),
  });
  totalsRow.font = { bold: true };
  moneyCols.forEach(k => applyMoneyCell(totalsRow.getCell(k)));

  const raw3 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw3) ? raw3 : Buffer.from(raw3 as ArrayBuffer);
}

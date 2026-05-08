import ExcelJS from 'exceljs';
import { D } from '@wind-acc/shared';
import type { TrialBalanceResult } from '../reports/trial-balance';
import type { ArAgingResult } from '../reports/ar-aging';
import type { ApAgingResult } from '../reports/ap-aging';
import type { VatSummaryResult } from '../reports/vat-summary';
import type { CashPositionResult } from '../reports/cash-position';
import type { BranchPnLResult, BranchPnLSection, BranchAmounts } from '../reports/branch-pnl';
import type { PLResult } from '../reports/profit-loss';
import type { BSResult, BSRow } from '../reports/balance-sheet';
import type { CFResult } from '../reports/cash-flow';
import type { GLDetail } from '../reports/general-ledger';
import type { ReportSection, ReportRow } from '../reports/common';

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

export async function buildVatSummaryXLSX(result: VatSummaryResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('VAT Summary');
  ws.columns = [
    { header: 'Period', key: 'period', width: 12 },
    { header: 'Output VAT', key: 'output_vat', width: 16 },
    { header: 'Taxable Sales', key: 'taxable_sales', width: 16 },
    { header: 'Output Invoices', key: 'output_count', width: 14 },
    { header: 'Input VAT (Claimable)', key: 'input_vat', width: 18 },
    { header: 'Total Purchases', key: 'total_purchases', width: 16 },
    { header: 'Input Invoices', key: 'input_count', width: 14 },
    { header: 'Non-Claimable VAT', key: 'non_claimable_vat', width: 16 },
    { header: 'VAT Payable', key: 'vat_payable', width: 14 },
    { header: 'Position', key: 'vat_position', width: 12 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Filing No', key: 'filing_no', width: 16 },
    { header: 'Filed At', key: 'filed_at', width: 14 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['output_vat', 'taxable_sales', 'input_vat', 'total_purchases', 'non_claimable_vat', 'vat_payable'] as const).forEach(k =>
    (headerRow.getCell(k).alignment = { horizontal: 'right' }),
  );

  const moneyCols = ['output_vat', 'taxable_sales', 'input_vat', 'total_purchases', 'non_claimable_vat', 'vat_payable'] as const;

  for (const row of result.rows) {
    const r = ws.addRow({
      period: row.period_code,
      output_vat: D(row.output_vat).toNumber(),
      taxable_sales: D(row.taxable_sales).toNumber(),
      output_count: row.output_count,
      input_vat: D(row.input_vat).toNumber(),
      total_purchases: D(row.total_purchases).toNumber(),
      input_count: row.input_count,
      non_claimable_vat: D(row.non_claimable_vat).toNumber(),
      vat_payable: D(row.vat_payable).toNumber(),
      vat_position: row.vat_position,
      status: row.status,
      filing_no: row.filing_no ?? '',
      filed_at: row.filed_at ? row.filed_at.slice(0, 10) : '',
    });
    moneyCols.forEach(k => applyMoneyCell(r.getCell(k)));
  }

  const raw4 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw4) ? raw4 : Buffer.from(raw4 as ArrayBuffer);
}

export async function buildCashPositionXLSX(result: CashPositionResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('Cash Position');
  ws.columns = [
    { header: 'Account Code', key: 'code', width: 14 },
    { header: 'Account Name', key: 'name', width: 28 },
    { header: 'Bank Name', key: 'bank_name', width: 18 },
    { header: 'Account Number', key: 'account_number', width: 18 },
    { header: 'GL Code', key: 'gl_code', width: 10 },
    { header: 'Opening Balance', key: 'opening', width: 16 },
    { header: 'Total In', key: 'total_in', width: 16 },
    { header: 'Total Out', key: 'total_out', width: 16 },
    { header: 'Closing Balance', key: 'closing', width: 16 },
    { header: 'Last Reconciled', key: 'last_rec', width: 16 },
    { header: 'Unmatched', key: 'unmatched', width: 12 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['opening', 'total_in', 'total_out', 'closing', 'unmatched'] as const).forEach(k =>
    (headerRow.getCell(k).alignment = { horizontal: 'right' }),
  );

  const moneyCols = ['opening', 'total_in', 'total_out', 'closing'] as const;

  for (const row of result.rows) {
    const r = ws.addRow({
      code: row.bank_account_code,
      name: row.bank_account_name,
      bank_name: row.bank_name,
      account_number: row.account_number ?? '',
      gl_code: row.gl_account_code,
      opening: D(row.opening_balance).toNumber(),
      total_in: D(row.total_in).toNumber(),
      total_out: D(row.total_out).toNumber(),
      closing: D(row.closing_balance).toNumber(),
      last_rec: row.last_reconciled_date ?? '',
      unmatched: row.unmatched_count,
    });
    moneyCols.forEach(k => applyMoneyCell(r.getCell(k)));
  }

  const totalsRow = ws.addRow({
    code: '',
    name: 'TOTAL',
    bank_name: '',
    account_number: '',
    gl_code: '',
    opening: D(result.totals.opening_balance).toNumber(),
    total_in: D(result.totals.total_in).toNumber(),
    total_out: D(result.totals.total_out).toNumber(),
    closing: D(result.totals.closing_balance).toNumber(),
    last_rec: '',
    unmatched: '',
  });
  totalsRow.font = { bold: true };
  moneyCols.forEach(k => applyMoneyCell(totalsRow.getCell(k)));

  ws.addRow({});

  const ws2 = wb.addWorksheet('Summary');
  ws2.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Amount', key: 'amount', width: 18 },
  ];
  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };

  const summaryRows = [
    { item: `Cash & Bank (as of ${result.as_of.toISOString().slice(0, 10)})`, amount: D(result.totals.closing_balance).toNumber() },
    { item: 'Receivables (AR)', amount: D(result.receivables).toNumber() },
    { item: 'Payables (AP)', amount: -D(result.payables).toNumber() },
    { item: 'Projected Net Cash', amount: D(result.projected_net_cash).toNumber() },
  ];
  for (const s of summaryRows) {
    const sr = ws2.addRow(s);
    applyMoneyCell(sr.getCell('amount'));
  }

  const raw5 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw5) ? raw5 : Buffer.from(raw5 as ArrayBuffer);
}

const BRANCH_MONEY_COLS = ['tl', 'ek', 'rama9', 'total'] as const;

function addBranchSection(ws: ExcelJS.Worksheet, section: BranchPnLSection): void {
  const headerRow = ws.addRow({
    code: '',
    name: `${section.title_en} / ${section.title_th}`,
    tl: null, ek: null, rama9: null, total: null,
  });
  headerRow.font = { bold: true, italic: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  for (const row of section.rows) {
    const r = ws.addRow({
      code: row.account_code,
      name: row.name_en,
      tl: D(row.tl).toNumber(),
      ek: D(row.ek).toNumber(),
      rama9: D(row.rama9).toNumber(),
      total: D(row.total).toNumber(),
    });
    BRANCH_MONEY_COLS.forEach(k => applyMoneyCell(r.getCell(k)));
  }

  const subRow = ws.addRow({
    code: '',
    name: `Total ${section.title_en}`,
    tl: D(section.tl).toNumber(),
    ek: D(section.ek).toNumber(),
    rama9: D(section.rama9).toNumber(),
    total: D(section.total).toNumber(),
  });
  subRow.font = { bold: true };
  BRANCH_MONEY_COLS.forEach(k => applyMoneyCell(subRow.getCell(k)));
  ws.addRow({});
}

function addBranchDerived(ws: ExcelJS.Worksheet, label: string, amounts: BranchAmounts): void {
  const r = ws.addRow({
    code: '',
    name: label,
    tl: D(amounts.tl).toNumber(),
    ek: D(amounts.ek).toNumber(),
    rama9: D(amounts.rama9).toNumber(),
    total: D(amounts.total).toNumber(),
  });
  r.font = { bold: true };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  BRANCH_MONEY_COLS.forEach(k => applyMoneyCell(r.getCell(k)));
  ws.addRow({});
}

export async function buildBranchPnLXLSX(result: BranchPnLResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('Branch P&L');
  ws.columns = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Account', key: 'name', width: 36 },
    { header: 'TL', key: 'tl', width: 16 },
    { header: 'EK', key: 'ek', width: 16 },
    { header: 'RAMA9', key: 'rama9', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
  ];

  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  BRANCH_MONEY_COLS.forEach(k => (hdr.getCell(k).alignment = { horizontal: 'right' }));

  ws.addRow({});
  addBranchSection(ws, result.revenue);
  addBranchSection(ws, result.cogs);
  addBranchDerived(ws, 'GROSS PROFIT / กำไรขั้นต้น', result.gross_profit);
  addBranchSection(ws, result.opex);
  addBranchDerived(ws, 'OPERATING INCOME / กำไรจากการดำเนินงาน', result.operating_income);
  addBranchSection(ws, result.other);
  addBranchDerived(ws, 'NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)', result.net_income);

  const raw6 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw6) ? raw6 : Buffer.from(raw6 as ArrayBuffer);
}

// ─── Helpers shared by P&L and CF ────────────────────────────────────────────

function plHeaderStyle(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): void {
  ws.creator = 'Wind Accounting';
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
}

function addPLSection(
  ws: ExcelJS.Worksheet,
  section: ReportSection,
  comparative: boolean,
): void {
  const sectionRow = ws.addRow({
    code: '',
    name: `${section.title_en} / ${section.title_th}`,
    amount: null,
    prior: null,
    pct: null,
  });
  sectionRow.font = { bold: true, italic: true };
  sectionRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  for (const row of section.rows) {
    const r = ws.addRow({
      code: row.account_code,
      name: row.name_en,
      amount: D(row.amount).toNumber(),
      prior: comparative ? D(row.comparative_amount ?? '0').toNumber() : null,
      pct: comparative && row.pct_change ? D(row.pct_change).toNumber() / 100 : null,
    });
    applyMoneyCell(r.getCell('amount'));
    if (comparative) {
      applyMoneyCell(r.getCell('prior'));
      if (row.pct_change) r.getCell('pct').numFmt = '+0.0%;-0.0%;"—"';
    }
  }

  const subtotalRow = ws.addRow({
    code: '',
    name: `Total ${section.title_en}`,
    amount: D(section.total).toNumber(),
    prior: comparative ? D(section.comparative_total ?? '0').toNumber() : null,
    pct: comparative && section.pct_change ? D(section.pct_change).toNumber() / 100 : null,
  });
  subtotalRow.font = { bold: true };
  applyMoneyCell(subtotalRow.getCell('amount'));
  if (comparative) {
    applyMoneyCell(subtotalRow.getCell('prior'));
    if (section.pct_change) subtotalRow.getCell('pct').numFmt = '+0.0%;-0.0%;"—"';
  }
  ws.addRow({});
}

function addDerivedRow(
  ws: ExcelJS.Worksheet,
  label: string,
  amount: string,
  prior: string | undefined,
  comparative: boolean,
): void {
  const r = ws.addRow({
    code: '',
    name: label,
    amount: D(amount).toNumber(),
    prior: comparative ? D(prior ?? '0').toNumber() : null,
    pct: null,
  });
  r.font = { bold: true };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  applyMoneyCell(r.getCell('amount'));
  if (comparative) applyMoneyCell(r.getCell('prior'));
  ws.addRow({});
}

// ─── Profit & Loss XLSX ───────────────────────────────────────────────────────

export async function buildProfitLossXLSX(result: PLResult): Promise<Buffer> {
  const comparative = result.comparative !== undefined;
  const prior = result.comparative;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('Profit & Loss');
  const cols: Partial<ExcelJS.Column>[] = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Account', key: 'name', width: 42 },
    { header: 'Amount', key: 'amount', width: 18 },
  ];
  if (comparative) {
    cols.push({ header: 'Prior Period', key: 'prior', width: 18 });
    cols.push({ header: '% Change', key: 'pct', width: 12 });
  }
  ws.columns = cols;

  plHeaderStyle(wb, ws);
  (['amount', ...(comparative ? ['prior', 'pct'] : [])] as const).forEach(k =>
    (ws.getRow(1).getCell(k as string).alignment = { horizontal: 'right' }),
  );

  ws.addRow({});

  addPLSection(ws, result.revenue, comparative);
  addPLSection(ws, result.cogs, comparative);
  addDerivedRow(ws, 'GROSS PROFIT / กำไรขั้นต้น', result.gross_profit, prior?.gross_profit, comparative);
  addPLSection(ws, result.opex, comparative);
  addDerivedRow(ws, 'OPERATING INCOME / กำไรจากการดำเนินงาน', result.operating_income, prior?.operating_income, comparative);
  addPLSection(ws, result.other, comparative);

  const netRow = ws.addRow({
    code: '',
    name: 'NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)',
    amount: D(result.net_income).toNumber(),
    prior: comparative ? D(prior?.net_income ?? '0').toNumber() : null,
    pct: null,
  });
  netRow.font = { bold: true, size: 11 };
  netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  applyMoneyCell(netRow.getCell('amount'));
  if (comparative) applyMoneyCell(netRow.getCell('prior'));

  const raw7 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw7) ? raw7 : Buffer.from(raw7 as ArrayBuffer);
}

// ─── Balance Sheet XLSX (multi-sheet: Assets / Liabilities & Equity) ────────

function addBSSectionRows(ws: ExcelJS.Worksheet, rows: BSRow[]): void {
  for (const row of rows) {
    const r = ws.addRow({
      code: row.account_code,
      name: row.name_en,
      amount: D(row.amount).toNumber(),
    });
    applyMoneyCell(r.getCell('amount'));
  }
}

function addBSSubtotal(ws: ExcelJS.Worksheet, label: string, total: string): void {
  const r = ws.addRow({ code: '', name: label, amount: D(total).toNumber() });
  r.font = { bold: true };
  applyMoneyCell(r.getCell('amount'));
  ws.addRow({});
}

function addBSGrandTotal(ws: ExcelJS.Worksheet, label: string, total: string): void {
  const r = ws.addRow({ code: '', name: label, amount: D(total).toNumber() });
  r.font = { bold: true, size: 11 };
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  applyMoneyCell(r.getCell('amount'));
}

function bsSheetColumns(ws: ExcelJS.Worksheet): void {
  ws.columns = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Name', key: 'name', width: 42 },
    { header: 'Amount', key: 'amount', width: 20 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  hdr.getCell('amount').alignment = { horizontal: 'right' };
}

export async function buildBalanceSheetXLSX(result: BSResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  // Sheet 1: Assets
  const wsAssets = wb.addWorksheet('Assets');
  bsSheetColumns(wsAssets);
  wsAssets.addRow({});

  const curAssetsHdr = wsAssets.addRow({ code: '', name: 'Current Assets / สินทรัพย์หมุนเวียน', amount: null });
  curAssetsHdr.font = { bold: true, italic: true };
  curAssetsHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  addBSSectionRows(wsAssets, result.assets.current.rows);
  addBSSubtotal(wsAssets, 'Total Current Assets', result.assets.current.total);

  const ncAssetsHdr = wsAssets.addRow({ code: '', name: 'Non-current Assets / สินทรัพย์ไม่หมุนเวียน', amount: null });
  ncAssetsHdr.font = { bold: true, italic: true };
  ncAssetsHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  addBSSectionRows(wsAssets, result.assets.non_current.rows);
  addBSSubtotal(wsAssets, 'Total Non-current Assets', result.assets.non_current.total);

  addBSGrandTotal(wsAssets, 'TOTAL ASSETS / รวมสินทรัพย์', result.assets.total);

  // Sheet 2: Liabilities & Equity
  const wsLE = wb.addWorksheet('Liabilities & Equity');
  bsSheetColumns(wsLE);
  wsLE.addRow({});

  const curLiabHdr = wsLE.addRow({ code: '', name: 'Current Liabilities / หนี้สินหมุนเวียน', amount: null });
  curLiabHdr.font = { bold: true, italic: true };
  curLiabHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  addBSSectionRows(wsLE, result.liabilities.current.rows);
  addBSSubtotal(wsLE, 'Total Current Liabilities', result.liabilities.current.total);

  if (result.liabilities.non_current.rows.length > 0) {
    const ncLiabHdr = wsLE.addRow({ code: '', name: 'Non-current Liabilities / หนี้สินไม่หมุนเวียน', amount: null });
    ncLiabHdr.font = { bold: true, italic: true };
    ncLiabHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    addBSSectionRows(wsLE, result.liabilities.non_current.rows);
    addBSSubtotal(wsLE, 'Total Non-current Liabilities', result.liabilities.non_current.total);
  }

  const totalLiabRow = wsLE.addRow({ code: '', name: 'TOTAL LIABILITIES / รวมหนี้สิน', amount: D(result.liabilities.total).toNumber() });
  totalLiabRow.font = { bold: true };
  applyMoneyCell(totalLiabRow.getCell('amount'));
  wsLE.addRow({});

  const equityHdr = wsLE.addRow({ code: '', name: 'EQUITY / ส่วนของเจ้าของ', amount: null });
  equityHdr.font = { bold: true, italic: true };
  equityHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  addBSSectionRows(wsLE, result.equity.items.rows);
  addBSSubtotal(wsLE, 'TOTAL EQUITY / รวมส่วนของเจ้าของ', result.equity.total);

  addBSGrandTotal(wsLE, 'TOTAL LIABILITIES + EQUITY', result.total_l_and_e);

  wsLE.addRow({});
  const balanceRow = wsLE.addRow({ code: '', name: result.balanced ? '✓ BALANCED' : '⚠ NOT BALANCED — imbalance: ' + (result.imbalance ?? '0.00'), amount: null });
  balanceRow.font = { bold: true, color: { argb: result.balanced ? 'FF065F46' : 'FFB91C1C' } };

  const raw8 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw8) ? raw8 : Buffer.from(raw8 as ArrayBuffer);
}

// ─── Cash Flow XLSX ───────────────────────────────────────────────────────────

function addCFSection(ws: ExcelJS.Worksheet, section: ReportSection): void {
  if (section.rows.length === 0) return;

  const hdr = ws.addRow({ name: `  ${section.title_en} / ${section.title_th}`, amount: null });
  hdr.font = { italic: true };

  for (const row of section.rows) {
    const r = ws.addRow({ name: `    ${row.name_en}`, amount: D(row.amount).toNumber() });
    applyMoneyCell(r.getCell('amount'));
  }

  const sub = ws.addRow({ name: `  Total ${section.title_en}`, amount: D(section.total).toNumber() });
  sub.font = { bold: true };
  applyMoneyCell(sub.getCell('amount'));
  ws.addRow({});
}

function addCFMainSection(
  ws: ExcelJS.Worksheet,
  label: string,
  rows: ReportRow[],
  total: string,
): void {
  const hdr = ws.addRow({ name: label, amount: null });
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };

  for (const row of rows) {
    const r = ws.addRow({ name: `  ${row.name_en}`, amount: D(row.amount).toNumber() });
    applyMoneyCell(r.getCell('amount'));
  }
  if (rows.length === 0) {
    ws.addRow({ name: '  No activity', amount: null });
  }

  const tot = ws.addRow({ name: `NET CASH FROM ${label.split('/')[0]!.trim()}`, amount: D(total).toNumber() });
  tot.font = { bold: true };
  tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  applyMoneyCell(tot.getCell('amount'));
  ws.addRow({});
}

export async function buildCashFlowXLSX(result: CFResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('Cash Flow');
  ws.columns = [
    { header: 'Description', key: 'name', width: 58 },
    { header: 'Amount (THB)', key: 'amount', width: 18 },
  ];
  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  hdr.getCell('amount').alignment = { horizontal: 'right' };

  ws.addRow({});

  // Operating
  const opHdr = ws.addRow({ name: 'OPERATING ACTIVITIES / กระแสเงินสดจากกิจกรรมดำเนินงาน', amount: null });
  opHdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  opHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };

  const niRow = ws.addRow({ name: 'Net Income / กำไรสุทธิ', amount: D(result.operating.net_income).toNumber() });
  applyMoneyCell(niRow.getCell('amount'));

  addCFSection(ws, result.operating.depreciation);
  addCFSection(ws, result.operating.working_capital);
  addCFSection(ws, result.operating.other);

  const opTot = ws.addRow({ name: 'NET CASH FROM OPERATING / เงินสดสุทธิจากกิจกรรมดำเนินงาน', amount: D(result.operating.total).toNumber() });
  opTot.font = { bold: true };
  opTot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
  applyMoneyCell(opTot.getCell('amount'));
  ws.addRow({});

  addCFMainSection(ws, 'INVESTING ACTIVITIES / กระแสเงินสดจากกิจกรรมลงทุน', result.investing.rows, result.investing.total);
  addCFMainSection(ws, 'FINANCING ACTIVITIES / กระแสเงินสดจากกิจกรรมจัดหาเงิน', result.financing.rows, result.financing.total);

  const netRow = ws.addRow({ name: 'NET CHANGE IN CASH / เงินสดสุทธิเพิ่ม (ลด)', amount: D(result.net_change).toNumber() });
  netRow.font = { bold: true, size: 11 };
  netRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  applyMoneyCell(netRow.getCell('amount'));

  ws.addRow({});

  // Reconciliation
  const recTitle = ws.addRow({ name: 'Cash Reconciliation / การกระทบยอดเงินสด', amount: null });
  recTitle.font = { bold: true, color: { argb: 'FF374151' } };

  const beginRow = ws.addRow({ name: 'Cash at Beginning of Period', amount: D(result.cash_begin).toNumber() });
  applyMoneyCell(beginRow.getCell('amount'));
  const endRow = ws.addRow({ name: 'Cash at End of Period', amount: D(result.cash_end).toNumber() });
  applyMoneyCell(endRow.getCell('amount'));
  const deltaRow = ws.addRow({ name: 'Net Change (End − Begin)', amount: D(result.cash_delta).toNumber() });
  deltaRow.font = { bold: true };
  applyMoneyCell(deltaRow.getCell('amount'));

  ws.addRow({});
  const statusRow = ws.addRow({ name: result.reconciled ? '✓ RECONCILED' : '⚠ NOT RECONCILED — diff: ' + (result.reconciliation_diff ?? '0.00'), amount: null });
  statusRow.font = { bold: true, color: { argb: result.reconciled ? 'FF065F46' : 'FFB91C1C' } };

  const raw9 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw9) ? raw9 : Buffer.from(raw9 as ArrayBuffer);
}

// ─── General Ledger XLSX ──────────────────────────────────────────────────────

export async function buildGeneralLedgerXLSX(result: GLDetail): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Wind Accounting';

  const ws = wb.addWorksheet('General Ledger');
  ws.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'JE No', key: 'je_no', width: 16 },
    { header: 'Description', key: 'desc', width: 42 },
    { header: 'Debit', key: 'debit', width: 18 },
    { header: 'Credit', key: 'credit', width: 18 },
    { header: 'Running Balance', key: 'balance', width: 18 },
  ];

  const hdr = ws.getRow(1);
  hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
  (['debit', 'credit', 'balance'] as const).forEach(k =>
    (hdr.getCell(k).alignment = { horizontal: 'right' }),
  );

  // Meta rows above header (insert before data)
  ws.spliceRows(1, 0,
    [`Account: ${result.account_code} — ${result.name_en}`],
    [`Type: ${result.account_type}   Branch: ${result.branch}   Opening Balance: ${result.opening_balance}`],
    [],
  );

  // Opening balance row
  const openRow = ws.addRow({ date: '', je_no: '', desc: 'Opening Balance', debit: null, credit: null, balance: D(result.opening_balance).toNumber() });
  openRow.font = { bold: true, italic: true };
  openRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  applyMoneyCell(openRow.getCell('balance'));

  for (const row of result.rows) {
    const r = ws.addRow({
      date: row.entry_date.toISOString().slice(0, 10),
      je_no: row.je_no,
      desc: row.description,
      debit: D(row.debit).toNumber() || null,
      credit: D(row.credit).toNumber() || null,
      balance: D(row.running_balance).toNumber(),
    });
    if (r.getCell('debit').value) applyMoneyCell(r.getCell('debit'));
    if (r.getCell('credit').value) applyMoneyCell(r.getCell('credit'));
    applyMoneyCell(r.getCell('balance'));
  }

  const totals = ws.addRow({
    date: '',
    je_no: '',
    desc: 'PERIOD TOTALS',
    debit: D(result.totals.debit).toNumber(),
    credit: D(result.totals.credit).toNumber(),
    balance: null,
  });
  totals.font = { bold: true };
  applyMoneyCell(totals.getCell('debit'));
  applyMoneyCell(totals.getCell('credit'));

  const closing = ws.addRow({
    date: '',
    je_no: '',
    desc: 'CLOSING BALANCE',
    debit: null,
    credit: null,
    balance: D(result.closing_balance).toNumber(),
  });
  closing.font = { bold: true, size: 11 };
  closing.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
  applyMoneyCell(closing.getCell('balance'));

  const raw10 = await wb.xlsx.writeBuffer();
  return Buffer.isBuffer(raw10) ? raw10 : Buffer.from(raw10 as ArrayBuffer);
}

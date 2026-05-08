import type { TrialBalanceResult } from '../reports/trial-balance';
import type { ArAgingResult } from '../reports/ar-aging';
import type { ApAgingResult } from '../reports/ap-aging';
import type { VatSummaryResult } from '../reports/vat-summary';
import type { CashPositionResult } from '../reports/cash-position';
import type { BranchPnLResult, BranchPnLSection } from '../reports/branch-pnl';
import type { PLResult } from '../reports/profit-loss';
import type { BSResult } from '../reports/balance-sheet';
import type { CFResult } from '../reports/cash-flow';
import type { GLDetail } from '../reports/general-ledger';
import type { ReportSection } from '../reports/common';

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

export function buildVatSummaryCSV(result: VatSummaryResult): string {
  const lines: string[] = [
    'Period,Output VAT,Taxable Sales,Output Invoices,Input VAT (Claimable),Total Purchases,Input Invoices,Non-Claimable VAT,VAT Payable,Position,Status,Filing No,Filed At',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        csvEsc(row.period_code),
        row.output_vat,
        row.taxable_sales,
        String(row.output_count),
        row.input_vat,
        row.total_purchases,
        String(row.input_count),
        row.non_claimable_vat,
        row.vat_payable,
        row.vat_position,
        row.status,
        csvEsc(row.filing_no ?? ''),
        row.filed_at ? row.filed_at.slice(0, 10) : '',
      ].join(','),
    );
  }

  return UTF8_BOM + lines.join('\r\n');
}

export function buildCashPositionCSV(result: CashPositionResult): string {
  const lines: string[] = [
    'Account Code,Account Name,Bank Name,Account Number,GL Code,Opening Balance,Total In,Total Out,Closing Balance,Last Reconciled,Unmatched Count',
  ];

  for (const row of result.rows) {
    lines.push(
      [
        csvEsc(row.bank_account_code),
        csvEsc(row.bank_account_name),
        csvEsc(row.bank_name),
        csvEsc(row.account_number ?? ''),
        csvEsc(row.gl_account_code),
        row.opening_balance,
        row.total_in,
        row.total_out,
        row.closing_balance,
        row.last_reconciled_date ?? '',
        String(row.unmatched_count),
      ].join(','),
    );
  }

  lines.push(
    ['', 'TOTAL', '', '', '', result.totals.opening_balance, result.totals.total_in, result.totals.total_out, result.totals.closing_balance, '', ''].join(','),
  );

  lines.push('');
  lines.push(`As of,${result.as_of.toISOString().slice(0, 10)}`);
  lines.push(`Receivables (AR),${result.receivables}`);
  lines.push(`Payables (AP),(${result.payables})`);
  lines.push(`Projected Net Cash,${result.projected_net_cash}`);

  return UTF8_BOM + lines.join('\r\n');
}

function addSectionToCSV(lines: string[], section: BranchPnLSection): void {
  lines.push(`${csvEsc(section.title_en)} / ${csvEsc(section.title_th)},,,,,`);
  for (const row of section.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.tl, row.ek, row.rama9, row.total].join(','));
  }
  lines.push([``, `Total ${csvEsc(section.title_en)}`, section.tl, section.ek, section.rama9, section.total].join(','));
  lines.push('');
}

export function buildBranchPnLCSV(result: BranchPnLResult): string {
  const lines: string[] = [
    `Branch P&L,${result.start_date.toISOString().slice(0, 10)} — ${result.end_date.toISOString().slice(0, 10)},,,,`,
    '',
    'Code,Account,TL,EK,RAMA9,Total',
  ];

  addSectionToCSV(lines, result.revenue);
  addSectionToCSV(lines, result.cogs);
  lines.push([``, `GROSS PROFIT`, result.gross_profit.tl, result.gross_profit.ek, result.gross_profit.rama9, result.gross_profit.total].join(','));
  lines.push('');
  addSectionToCSV(lines, result.opex);
  lines.push([``, `OPERATING INCOME`, result.operating_income.tl, result.operating_income.ek, result.operating_income.rama9, result.operating_income.total].join(','));
  lines.push('');
  addSectionToCSV(lines, result.other);
  lines.push([``, `NET INCOME (BEFORE TAX)`, result.net_income.tl, result.net_income.ek, result.net_income.rama9, result.net_income.total].join(','));

  return UTF8_BOM + lines.join('\r\n');
}

function addPLSectionToCSV(lines: string[], section: ReportSection, comparative: boolean): void {
  lines.push(`${csvEsc(section.title_en)} / ${csvEsc(section.title_th)}`);
  for (const row of section.rows) {
    if (comparative) {
      lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount, row.comparative_amount ?? '', row.pct_change ?? ''].join(','));
    } else {
      lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
    }
  }
  if (comparative) {
    lines.push([``, `Total ${csvEsc(section.title_en)}`, section.total, section.comparative_total ?? '', section.pct_change ?? ''].join(','));
  } else {
    lines.push([``, `Total ${csvEsc(section.title_en)}`, section.total].join(','));
  }
  lines.push('');
}

export function buildProfitLossCSV(result: PLResult): string {
  const comparative = result.comparative !== undefined;
  const start = result.start_date.toISOString().slice(0, 10);
  const end = result.end_date.toISOString().slice(0, 10);
  const prior = result.comparative;

  const lines: string[] = [
    `Profit & Loss Statement`,
    `Period,${start} - ${end}`,
    `Branch,${result.branch}`,
  ];
  if (comparative && prior) {
    lines.push(`Prior Period,${prior.start_date.toISOString().slice(0, 10)} - ${prior.end_date.toISOString().slice(0, 10)}`);
  }
  lines.push('');

  if (comparative) {
    lines.push('Code,Account,Current Period,Prior Period,% Change');
  } else {
    lines.push('Code,Account,Amount');
  }
  lines.push('');

  addPLSectionToCSV(lines, result.revenue, comparative);
  addPLSectionToCSV(lines, result.cogs, comparative);
  lines.push(comparative
    ? [``, `GROSS PROFIT`, result.gross_profit, prior?.gross_profit ?? '', ''].join(',')
    : [``, `GROSS PROFIT`, result.gross_profit].join(','));
  lines.push('');
  addPLSectionToCSV(lines, result.opex, comparative);
  lines.push(comparative
    ? [``, `OPERATING INCOME`, result.operating_income, prior?.operating_income ?? '', ''].join(',')
    : [``, `OPERATING INCOME`, result.operating_income].join(','));
  lines.push('');
  addPLSectionToCSV(lines, result.other, comparative);
  lines.push(comparative
    ? [``, `NET INCOME (BEFORE TAX)`, result.net_income, prior?.net_income ?? '', ''].join(',')
    : [``, `NET INCOME (BEFORE TAX)`, result.net_income].join(','));

  return UTF8_BOM + lines.join('\r\n');
}

export function buildBalanceSheetCSV(result: BSResult): string {
  const asOf = result.as_of.toISOString().slice(0, 10);

  const lines: string[] = [
    `Balance Sheet`,
    `As of,${asOf}`,
    `Branch,${result.branch}`,
    '',
    'ASSETS',
    'Code,Name,Amount',
    'Current Assets',
  ];

  for (const row of result.assets.current.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([``, `Total Current Assets`, result.assets.current.total].join(','));
  lines.push('');
  lines.push('Non-current Assets');
  for (const row of result.assets.non_current.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([``, `Total Non-current Assets`, result.assets.non_current.total].join(','));
  lines.push([``, `TOTAL ASSETS`, result.assets.total].join(','));
  lines.push('');

  lines.push('LIABILITIES');
  lines.push('Current Liabilities');
  for (const row of result.liabilities.current.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([``, `Total Current Liabilities`, result.liabilities.current.total].join(','));
  lines.push('');
  lines.push('Non-current Liabilities');
  for (const row of result.liabilities.non_current.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([``, `Total Non-current Liabilities`, result.liabilities.non_current.total].join(','));
  lines.push([``, `TOTAL LIABILITIES`, result.liabilities.total].join(','));
  lines.push('');

  lines.push('EQUITY');
  for (const row of result.equity.items.rows) {
    lines.push([csvEsc(row.account_code), csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([``, `TOTAL EQUITY`, result.equity.total].join(','));
  lines.push('');
  lines.push([``, `TOTAL LIABILITIES + EQUITY`, result.total_l_and_e].join(','));
  lines.push('');
  lines.push(`Balanced,${result.balanced ? 'Yes' : 'No — imbalance: ' + (result.imbalance ?? '0.00')}`);

  return UTF8_BOM + lines.join('\r\n');
}

function addCFSectionToCSV(lines: string[], section: ReportSection): void {
  if (section.rows.length === 0) return;
  lines.push(csvEsc(section.title_en));
  for (const row of section.rows) {
    lines.push([csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([`Total ${csvEsc(section.title_en)}`, section.total].join(','));
  lines.push('');
}

export function buildCashFlowCSV(result: CFResult): string {
  const start = result.start_date.toISOString().slice(0, 10);
  const end = result.end_date.toISOString().slice(0, 10);

  const lines: string[] = [
    `Cash Flow Statement (Indirect Method)`,
    `Period,${start} - ${end}`,
    `Branch,${result.branch}`,
    '',
    'Description,Amount',
    '',
    'OPERATING ACTIVITIES',
    [`Net Income`, result.operating.net_income].join(','),
  ];

  addCFSectionToCSV(lines, result.operating.depreciation);
  addCFSectionToCSV(lines, result.operating.working_capital);
  addCFSectionToCSV(lines, result.operating.other);
  lines.push([`NET CASH FROM OPERATING`, result.operating.total].join(','));
  lines.push('');

  lines.push('INVESTING ACTIVITIES');
  for (const row of result.investing.rows) {
    lines.push([csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([`NET CASH FROM INVESTING`, result.investing.total].join(','));
  lines.push('');

  lines.push('FINANCING ACTIVITIES');
  for (const row of result.financing.rows) {
    lines.push([csvEsc(row.name_en), row.amount].join(','));
  }
  lines.push([`NET CASH FROM FINANCING`, result.financing.total].join(','));
  lines.push('');
  lines.push([`NET CHANGE IN CASH`, result.net_change].join(','));
  lines.push('');
  lines.push('Cash Reconciliation');
  lines.push([`Cash at Beginning of Period`, result.cash_begin].join(','));
  lines.push([`Cash at End of Period`, result.cash_end].join(','));
  lines.push([`Net Change (End - Begin)`, result.cash_delta].join(','));
  lines.push(`Reconciled,${result.reconciled ? 'Yes' : 'No — diff: ' + (result.reconciliation_diff ?? '0.00')}`);

  return UTF8_BOM + lines.join('\r\n');
}

export function buildGeneralLedgerCSV(result: GLDetail): string {
  const fromStr = result.period_from ? result.period_from.toISOString().slice(0, 10) : 'All';
  const toStr = result.period_to ? result.period_to.toISOString().slice(0, 10) : 'All';

  const lines: string[] = [
    `General Ledger Detail`,
    `Account,${csvEsc(result.account_code)} - ${csvEsc(result.name_en)}`,
    `Type,${result.account_type}`,
    `Period,${fromStr} to ${toStr}`,
    `Branch,${result.branch}`,
    `Opening Balance,${result.opening_balance}`,
    '',
    'Date,JE No,Description,Debit,Credit,Running Balance',
  ];

  for (const row of result.rows) {
    lines.push([
      row.entry_date.toISOString().slice(0, 10),
      csvEsc(row.je_no),
      csvEsc(row.description),
      row.debit,
      row.credit,
      row.running_balance,
    ].join(','));
  }

  lines.push('');
  lines.push([`PERIOD TOTALS`, ``, result.totals.debit, result.totals.credit, ``].join(','));
  lines.push([`CLOSING BALANCE`, ``, ``, ``, result.closing_balance].join(','));

  return UTF8_BOM + lines.join('\r\n');
}

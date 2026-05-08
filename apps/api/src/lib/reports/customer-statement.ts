import Decimal from 'decimal.js';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';

export type StatementDocType = 'INVOICE' | 'RECEIPT';

export interface StatementLine {
  date: string;
  doc_type: StatementDocType;
  document_no: string;
  document_id: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
  status: string;
}

export interface CustomerStatementResult {
  customer_id: string;
  date_from: string | null;
  date_to: string | null;
  lines: StatementLine[];
  closing_balance: string;
}

export interface CustomerStatementOptions {
  customer_id: string;
  date_from?: Date;
  date_to?: Date;
}

export async function getCustomerStatement(
  options: CustomerStatementOptions,
): Promise<CustomerStatementResult> {
  const { customer_id, date_from, date_to } = options;

  const invoiceDateFilter: Record<string, Date> = {};
  if (date_from) invoiceDateFilter.gte = date_from;
  if (date_to) invoiceDateFilter.lte = date_to;

  const [invoices, receipts] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        customer_id,
        status: { notIn: ['DRAFT'] },
        ...(Object.keys(invoiceDateFilter).length > 0
          ? { issue_date: invoiceDateFilter }
          : {}),
      },
      select: {
        id: true,
        invoice_no: true,
        issue_date: true,
        total: true,
        status: true,
      },
      orderBy: { issue_date: 'asc' },
    }),
    prisma.receipt.findMany({
      where: {
        customer_id,
        status: { notIn: ['DRAFT'] },
        ...(Object.keys(invoiceDateFilter).length > 0
          ? { receipt_date: invoiceDateFilter }
          : {}),
      },
      select: {
        id: true,
        receipt_no: true,
        receipt_date: true,
        total_amount: true,
        status: true,
      },
      orderBy: { receipt_date: 'asc' },
    }),
  ]);

  type RawEntry = {
    date: Date;
    doc_type: StatementDocType;
    document_no: string;
    document_id: string;
    description: string;
    debit: Decimal;
    credit: Decimal;
    status: string;
  };

  const entries: RawEntry[] = [];

  for (const inv of invoices) {
    const total = D(inv.total.toString());
    if (inv.status === 'VOID') {
      entries.push({
        date: inv.issue_date,
        doc_type: 'INVOICE',
        document_no: inv.invoice_no,
        document_id: inv.id,
        description: 'Invoice (Voided)',
        debit: new Decimal(0),
        credit: new Decimal(0),
        status: inv.status,
      });
    } else {
      entries.push({
        date: inv.issue_date,
        doc_type: 'INVOICE',
        document_no: inv.invoice_no,
        document_id: inv.id,
        description: 'Invoice',
        debit: total,
        credit: new Decimal(0),
        status: inv.status,
      });
    }
  }

  for (const rec of receipts) {
    const amount = D(rec.total_amount.toString());
    if (rec.status === 'VOID') {
      entries.push({
        date: rec.receipt_date,
        doc_type: 'RECEIPT',
        document_no: rec.receipt_no,
        document_id: rec.id,
        description: 'Receipt (Voided)',
        debit: new Decimal(0),
        credit: new Decimal(0),
        status: rec.status,
      });
    } else {
      entries.push({
        date: rec.receipt_date,
        doc_type: 'RECEIPT',
        document_no: rec.receipt_no,
        document_id: rec.id,
        description: 'Receipt',
        debit: new Decimal(0),
        credit: amount,
        status: rec.status,
      });
    }
  }

  // Sort chronologically; within same date, invoices before receipts
  entries.sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime();
    if (diff !== 0) return diff;
    if (a.doc_type === 'INVOICE' && b.doc_type === 'RECEIPT') return -1;
    if (a.doc_type === 'RECEIPT' && b.doc_type === 'INVOICE') return 1;
    return 0;
  });

  const lines: StatementLine[] = [];
  let runningBalance = new Decimal(0);

  for (const entry of entries) {
    runningBalance = runningBalance.plus(entry.debit).minus(entry.credit);
    lines.push({
      date: entry.date.toISOString().slice(0, 10),
      doc_type: entry.doc_type,
      document_no: entry.document_no,
      document_id: entry.document_id,
      description: entry.description,
      debit: entry.debit.toDecimalPlaces(2).toString(),
      credit: entry.credit.toDecimalPlaces(2).toString(),
      running_balance: runningBalance.toDecimalPlaces(2).toString(),
      status: entry.status,
    });
  }

  return {
    customer_id,
    date_from: date_from ? date_from.toISOString().slice(0, 10) : null,
    date_to: date_to ? date_to.toISOString().slice(0, 10) : null,
    lines,
    closing_balance: runningBalance.toDecimalPlaces(2).toString(),
  };
}

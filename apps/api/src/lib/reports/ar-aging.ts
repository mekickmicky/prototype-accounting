import type { Prisma } from '@prisma/client';
import { D, sumD, type BranchCodeType } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type BranchFilter = BranchCodeType | 'ALL';
export type AgingBucket = 'CURRENT' | '1-30' | '31-60' | '61-90' | '90+';

export interface AgingInvoice {
  id: string;
  invoice_no: string;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  balance: string;
  days_overdue: number;
  bucket: AgingBucket;
}

export interface AgingCustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
  invoices: AgingInvoice[];
}

export interface AgingTotals {
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
}

export interface ArAgingResult {
  as_of: Date;
  branch: BranchFilter;
  rows: AgingCustomerRow[];
  totals: AgingTotals;
}

export interface ArAgingOptions {
  as_of: Date;
  branch?: BranchFilter;
}

function bucketOf(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((from.getTime() - to.getTime()) / (1000 * 60 * 60 * 24));
}

export async function arAging(
  options: ArAgingOptions,
  client: Db = prisma,
): Promise<ArAgingResult> {
  const { as_of, branch = 'ALL' } = options;

  const where: Prisma.SalesInvoiceWhereInput = {
    status: { in: ['POSTED', 'PARTIAL_PAID'] },
  };
  if (branch !== 'ALL') {
    where.branch_code = branch;
  }

  const invoices = await client.salesInvoice.findMany({
    where,
    include: {
      customer: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ customer_id: 'asc' }, { due_date: 'asc' }],
  });

  // Group by customer
  const byCustomer = new Map<
    string,
    { customer: { id: string; code: string; name: string }; invoices: typeof invoices }
  >();

  for (const inv of invoices) {
    const balance = D(inv.total.toString()).minus(D(inv.paid_amount.toString()));
    // Only include invoices with an open balance (guard against floating point edge cases)
    if (balance.lte(0)) continue;

    const existing = byCustomer.get(inv.customer_id) ?? {
      customer: inv.customer,
      invoices: [],
    };
    existing.invoices.push(inv);
    byCustomer.set(inv.customer_id, existing);
  }

  const rows: AgingCustomerRow[] = [];

  for (const { customer, invoices: custInvs } of byCustomer.values()) {
    let current = D(0);
    let b1_30 = D(0);
    let b31_60 = D(0);
    let b61_90 = D(0);
    let b90plus = D(0);

    const agingInvoices: AgingInvoice[] = [];

    for (const inv of custInvs) {
      const total = D(inv.total.toString());
      const paid = D(inv.paid_amount.toString());
      const balance = total.minus(paid);
      const daysOverdue = daysBetween(as_of, inv.due_date);
      const bucket = bucketOf(daysOverdue);

      switch (bucket) {
        case 'CURRENT': current = current.plus(balance); break;
        case '1-30':    b1_30  = b1_30.plus(balance);   break;
        case '31-60':   b31_60 = b31_60.plus(balance);  break;
        case '61-90':   b61_90 = b61_90.plus(balance);  break;
        case '90+':     b90plus = b90plus.plus(balance); break;
      }

      agingInvoices.push({
        id: inv.id,
        invoice_no: inv.invoice_no ?? '',
        issue_date: inv.issue_date.toISOString().slice(0, 10),
        due_date: inv.due_date.toISOString().slice(0, 10),
        total: total.toFixed(2),
        paid_amount: paid.toFixed(2),
        balance: balance.toFixed(2),
        days_overdue: daysOverdue,
        bucket,
      });
    }

    const rowTotal = sumD([current, b1_30, b31_60, b61_90, b90plus]);

    rows.push({
      customer_id: customer.id,
      customer_code: customer.code,
      customer_name: customer.name,
      current: current.toFixed(2),
      b1_30: b1_30.toFixed(2),
      b31_60: b31_60.toFixed(2),
      b61_90: b61_90.toFixed(2),
      b90plus: b90plus.toFixed(2),
      total: rowTotal.toFixed(2),
      invoices: agingInvoices,
    });
  }

  // Sort rows by customer code
  rows.sort((a, b) => a.customer_code.localeCompare(b.customer_code));

  const totals: AgingTotals = {
    current: sumD(rows.map(r => D(r.current))).toFixed(2),
    b1_30:   sumD(rows.map(r => D(r.b1_30))).toFixed(2),
    b31_60:  sumD(rows.map(r => D(r.b31_60))).toFixed(2),
    b61_90:  sumD(rows.map(r => D(r.b61_90))).toFixed(2),
    b90plus: sumD(rows.map(r => D(r.b90plus))).toFixed(2),
    total:   sumD(rows.map(r => D(r.total))).toFixed(2),
  };

  return { as_of, branch, rows, totals };
}

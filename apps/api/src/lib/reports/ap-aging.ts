import type { Prisma } from '@prisma/client';
import { D, sumD, type BranchCodeType } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type BranchFilter = BranchCodeType | 'ALL';
export type AgingBucket = 'CURRENT' | '1-30' | '31-60' | '61-90' | '90+';

export interface AgingBill {
  id: string;
  bill_no: string;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  balance: string;
  days_overdue: number;
  bucket: AgingBucket;
}

export interface AgingVendorRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
  bills: AgingBill[];
}

export interface AgingTotals {
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
}

export interface ApAgingResult {
  as_of: Date;
  branch: BranchFilter;
  rows: AgingVendorRow[];
  totals: AgingTotals;
}

export interface ApAgingOptions {
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

export async function apAging(
  options: ApAgingOptions,
  client: Db = prisma,
): Promise<ApAgingResult> {
  const { as_of, branch = 'ALL' } = options;

  const where: Prisma.BillWhereInput = {
    status: { in: ['POSTED', 'PARTIAL_PAID'] },
  };
  if (branch !== 'ALL') {
    where.branch_code = branch;
  }

  const bills = await client.bill.findMany({
    where,
    include: {
      vendor: { select: { id: true, code: true, name: true } },
    },
    orderBy: [{ vendor_id: 'asc' }, { due_date: 'asc' }],
  });

  // Group by vendor
  const byVendor = new Map<
    string,
    { vendor: { id: string; code: string; name: string }; bills: typeof bills }
  >();

  for (const bill of bills) {
    const balance = D(bill.total.toString()).minus(D(bill.paid_amount.toString()));
    if (balance.lte(0)) continue;

    const existing = byVendor.get(bill.vendor_id) ?? {
      vendor: bill.vendor,
      bills: [],
    };
    existing.bills.push(bill);
    byVendor.set(bill.vendor_id, existing);
  }

  const rows: AgingVendorRow[] = [];

  for (const { vendor, bills: vendorBills } of byVendor.values()) {
    let current = D(0);
    let b1_30 = D(0);
    let b31_60 = D(0);
    let b61_90 = D(0);
    let b90plus = D(0);

    const agingBills: AgingBill[] = [];

    for (const bill of vendorBills) {
      const total = D(bill.total.toString());
      const paid = D(bill.paid_amount.toString());
      const balance = total.minus(paid);
      const daysOverdue = daysBetween(as_of, bill.due_date);
      const bucket = bucketOf(daysOverdue);

      switch (bucket) {
        case 'CURRENT': current = current.plus(balance); break;
        case '1-30':    b1_30  = b1_30.plus(balance);   break;
        case '31-60':   b31_60 = b31_60.plus(balance);  break;
        case '61-90':   b61_90 = b61_90.plus(balance);  break;
        case '90+':     b90plus = b90plus.plus(balance); break;
      }

      agingBills.push({
        id: bill.id,
        bill_no: bill.bill_no,
        issue_date: bill.issue_date.toISOString().slice(0, 10),
        due_date: bill.due_date.toISOString().slice(0, 10),
        total: total.toFixed(2),
        paid_amount: paid.toFixed(2),
        balance: balance.toFixed(2),
        days_overdue: daysOverdue,
        bucket,
      });
    }

    const rowTotal = sumD([current, b1_30, b31_60, b61_90, b90plus]);

    rows.push({
      vendor_id: vendor.id,
      vendor_code: vendor.code,
      vendor_name: vendor.name,
      current: current.toFixed(2),
      b1_30: b1_30.toFixed(2),
      b31_60: b31_60.toFixed(2),
      b61_90: b61_90.toFixed(2),
      b90plus: b90plus.toFixed(2),
      total: rowTotal.toFixed(2),
      bills: agingBills,
    });
  }

  rows.sort((a, b) => a.vendor_code.localeCompare(b.vendor_code));

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

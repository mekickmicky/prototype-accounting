import type { Prisma, VendorType } from '@prisma/client';
import { D, sumD } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type PndType = 'PND3' | 'PND53';

export function pndTypeForVendorType(vendor_type: VendorType): PndType {
  return vendor_type === 'INDIVIDUAL' ? 'PND3' : 'PND53';
}

export interface PndRow {
  record_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_name_th: string | null;
  vendor_tax_id: string | null;
  wht_type: string;
  wht_rate: string;
  gross_amount: string;
  wht_amount: string;
  cert_no: string;
  payment_date: Date;
  payment_id: string;
}

export interface PndVendorGroup {
  vendor_id: string;
  vendor_name: string;
  vendor_name_th: string | null;
  vendor_tax_id: string | null;
  total_gross: string;
  total_wht: string;
  lines: PndRow[];
}

export interface PndAggregateResult {
  period_code: string;
  pnd_type: PndType;
  vendor_type: VendorType;
  total_gross: string;
  total_wht: string;
  recipient_count: number;
  rows: PndRow[];
  groups: PndVendorGroup[];
}

export async function aggregatePND(
  period_code: string,
  vendor_type: VendorType,
  db: Db = prisma,
): Promise<PndAggregateResult> {
  const pnd_type = pndTypeForVendorType(vendor_type);

  const vendors = await db.vendor.findMany({
    where: { vendor_type },
    select: { id: true, name: true, name_th: true, tax_id: true },
  });
  const vendorById = new Map(vendors.map(v => [v.id, v]));
  const vendorIds = vendors.map(v => v.id);

  const records = vendorIds.length
    ? await db.withholdingRecord.findMany({
        where: {
          period_code,
          status: { not: 'VOID' },
          filing_id: null,
          vendor_id: { in: vendorIds },
        },
        orderBy: [{ vendor_id: 'asc' }, { payment_date: 'asc' }, { cert_no: 'asc' }],
      })
    : [];

  const rows: PndRow[] = records.map(r => {
    const v = vendorById.get(r.vendor_id);
    return {
      record_id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: v?.name ?? '',
      vendor_name_th: v?.name_th ?? null,
      vendor_tax_id: r.vendor_tax_id ?? v?.tax_id ?? null,
      wht_type: r.wht_type,
      wht_rate: r.wht_rate.toString(),
      gross_amount: r.gross_amount.toString(),
      wht_amount: r.wht_amount.toString(),
      cert_no: r.cert_no,
      payment_date: r.payment_date,
      payment_id: r.payment_id,
    };
  });

  const groupMap = new Map<string, PndVendorGroup>();
  for (const row of rows) {
    let g = groupMap.get(row.vendor_id);
    if (!g) {
      g = {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        vendor_name_th: row.vendor_name_th,
        vendor_tax_id: row.vendor_tax_id,
        total_gross: '0.00',
        total_wht: '0.00',
        lines: [],
      };
      groupMap.set(row.vendor_id, g);
    }
    g.lines.push(row);
  }

  const groups: PndVendorGroup[] = [];
  for (const g of groupMap.values()) {
    g.total_gross = sumD(g.lines.map(l => D(l.gross_amount))).toFixed(2);
    g.total_wht = sumD(g.lines.map(l => D(l.wht_amount))).toFixed(2);
    groups.push(g);
  }

  const total_gross = sumD(rows.map(r => D(r.gross_amount))).toFixed(2);
  const total_wht = sumD(rows.map(r => D(r.wht_amount))).toFixed(2);

  return {
    period_code,
    pnd_type,
    vendor_type,
    total_gross,
    total_wht,
    recipient_count: groups.length,
    rows,
    groups,
  };
}

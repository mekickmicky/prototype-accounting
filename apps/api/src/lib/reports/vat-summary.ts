import { D, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';

function currentPeriodCode(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function subtractMonths(periodCode: string, months: number): string {
  const [yStr, mStr] = periodCode.split('-');
  const y = parseInt(yStr!, 10);
  const m = parseInt(mStr!, 10);
  const totalMonths = y * 12 + (m - 1) - months;
  const newY = Math.floor(totalMonths / 12);
  const newM = (totalMonths % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

function periodsInRange(from: string, to: string): string[] {
  const periods: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  let y = fy, m = fm!;
  while (y < ty! || (y === ty && m <= tm!)) {
    periods.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periods;
}

export type VatPosition = 'PAYABLE' | 'REFUNDABLE' | 'ZERO';
export type VatFilingStatus = 'UNFILED' | 'DRAFT' | 'FINALIZED' | 'SUBMITTED';

export interface VatSummaryRow {
  period_code: string;
  output_vat: string;
  taxable_sales: string;
  output_count: number;
  input_vat: string;
  total_purchases: string;
  input_count: number;
  non_claimable_vat: string;
  non_claimable_count: number;
  vat_payable: string;
  vat_position: VatPosition;
  status: VatFilingStatus;
  filing_id: string | null;
  filing_no: string | null;
  filed_at: string | null;
}

export interface VatSummaryResult {
  period_from: string;
  period_to: string;
  rows: VatSummaryRow[];
}

/**
 * Aggregate VAT summary across periods (spec 08 §8, T-7.17).
 *
 * For each period, sums all VatRegister rows (output + input) to produce
 * output_vat, input_vat, and vat_payable. Reversal pairs net to zero
 * automatically. The filing status comes from any PP30 TaxFiling for that
 * period. For FINALIZED/SUBMITTED periods the VatRegister aggregate equals the
 * filing snapshot because locking (filing_id) only prevents double-counting
 * across periods, not within.
 *
 * Numbers match Phase 5 PP30 aggregator: for UNFILED/DRAFT periods the rows
 * are identical to what aggregatePP30 sees; for FINALIZED/SUBMITTED periods
 * the snapshot values equal the VatRegister aggregate at lock time.
 */
export async function vatSummary(options: {
  period_from?: string;
  period_to?: string;
}): Promise<VatSummaryResult> {
  const period_to = options.period_to ?? currentPeriodCode();
  const period_from = options.period_from ?? subtractMonths(period_to, 11);

  const [filings, vatRows] = await Promise.all([
    prisma.taxFiling.findMany({
      where: {
        filing_type: 'PP30',
        period_code: { gte: period_from, lte: period_to },
      },
      select: {
        id: true,
        filing_no: true,
        period_code: true,
        status: true,
        output_vat: true,
        input_vat: true,
        vat_payable: true,
        filed_at: true,
      },
      orderBy: { period_code: 'asc' },
    }),
    prisma.vatRegister.findMany({
      where: { period_code: { gte: period_from, lte: period_to } },
      select: {
        period_code: true,
        vat_type: true,
        claimable: true,
        net_amount: true,
        vat_amount: true,
      },
    }),
  ]);

  const filingByPeriod = new Map<string, (typeof filings)[0]>();
  for (const f of filings) {
    filingByPeriod.set(f.period_code, f);
  }

  type Agg = {
    outputVat: Decimal;
    taxableSales: Decimal;
    outputCount: number;
    inputVat: Decimal;
    totalPurchases: Decimal;
    inputCount: number;
    nonClaimableVat: Decimal;
    nonClaimableCount: number;
  };

  const aggByPeriod = new Map<string, Agg>();
  for (const row of vatRows) {
    const agg = aggByPeriod.get(row.period_code) ?? {
      outputVat: D(0), taxableSales: D(0), outputCount: 0,
      inputVat: D(0), totalPurchases: D(0), inputCount: 0,
      nonClaimableVat: D(0), nonClaimableCount: 0,
    };
    const net = D(row.net_amount.toString());
    const vat = D(row.vat_amount.toString());
    if (row.vat_type === 'OUTPUT') {
      agg.outputVat = agg.outputVat.plus(vat);
      agg.taxableSales = agg.taxableSales.plus(net);
      agg.outputCount++;
    } else if (row.claimable) {
      agg.inputVat = agg.inputVat.plus(vat);
      agg.totalPurchases = agg.totalPurchases.plus(net);
      agg.inputCount++;
    } else {
      agg.nonClaimableVat = agg.nonClaimableVat.plus(vat);
      agg.nonClaimableCount++;
    }
    aggByPeriod.set(row.period_code, agg);
  }

  function vatPosition(payable: Decimal): VatPosition {
    if (payable.gt(0)) return 'PAYABLE';
    if (payable.lt(0)) return 'REFUNDABLE';
    return 'ZERO';
  }

  const periods = periodsInRange(period_from, period_to);
  const rows: VatSummaryRow[] = periods.map(period_code => {
    const filing = filingByPeriod.get(period_code);
    const agg = aggByPeriod.get(period_code);

    const outputVat = agg?.outputVat ?? D(0);
    const inputVat = agg?.inputVat ?? D(0);
    const vatPayable = outputVat.minus(inputVat);

    let status: VatFilingStatus = 'UNFILED';
    if (filing) {
      status = filing.status as VatFilingStatus;
    }

    return {
      period_code,
      output_vat: outputVat.toFixed(2),
      taxable_sales: (agg?.taxableSales ?? D(0)).toFixed(2),
      output_count: agg?.outputCount ?? 0,
      input_vat: inputVat.toFixed(2),
      total_purchases: (agg?.totalPurchases ?? D(0)).toFixed(2),
      input_count: agg?.inputCount ?? 0,
      non_claimable_vat: (agg?.nonClaimableVat ?? D(0)).toFixed(2),
      non_claimable_count: agg?.nonClaimableCount ?? 0,
      vat_payable: vatPayable.toFixed(2),
      vat_position: vatPosition(vatPayable),
      status,
      filing_id: filing?.id ?? null,
      filing_no: filing?.filing_no ?? null,
      filed_at: filing?.filed_at?.toISOString() ?? null,
    };
  });

  return { period_from, period_to, rows };
}

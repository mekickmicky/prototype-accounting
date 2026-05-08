import { D, sumD, Decimal } from "./money";
import {
  lineNet,
  lineVat,
  type DecimalLike,
  type VatRate,
} from "./invoice-math";
import { WHT_THRESHOLD } from "./wht-rates";

export interface LineWithholdingInput {
  net_excl_vat: DecimalLike;
  wht_rate: DecimalLike;
  threshold_satisfied: boolean;
}

/**
 * Withholding tax on a bill line's pre-VAT net amount.
 *
 * Returns 0 when the bill-level threshold is not satisfied (Thai RD rule:
 * payments below 1,000 THB per transaction to a single recipient are exempt
 * — see specs/03 §5.2). The caller computes the bill-level threshold and
 * passes the boolean here so every line of a sub-threshold bill collapses
 * to zero WHT consistently.
 */
export function lineWithholding({
  net_excl_vat,
  wht_rate,
  threshold_satisfied,
}: LineWithholdingInput): Decimal {
  if (!threshold_satisfied) return D(0);
  const rate = D(wht_rate);
  if (rate.lte(0)) return D(0);
  return D(net_excl_vat).times(rate.div(100)).toDecimalPlaces(2);
}

export interface BillLineInput {
  qty: DecimalLike;
  unit_price: DecimalLike;
  discount?: DecimalLike | null;
  vat_rate: VatRate;
  wht_rate?: DecimalLike | null;
}

export interface BillTotalsOptions {
  vat_inclusive: boolean;
}

export interface BillTotals {
  subtotal: Decimal;
  vat_total: Decimal;
  withholding_total: Decimal;
  total: Decimal;
  net_payable: Decimal;
}

/**
 * Roll up bill-level totals from raw line inputs.
 *
 * - `subtotal` = Σ line-net (post-discount, pre-VAT)
 * - `vat_total` = Σ line VAT
 * - `total` = subtotal + vat_total (gross bill value, before WHT deduction)
 * - `withholding_total` = Σ line WHT on the pre-VAT net, or 0 across the
 *   whole bill if `total < WHT_THRESHOLD` (1,000 THB).
 * - `net_payable` = total - withholding_total — what we actually wire to
 *   the vendor.
 */
export function billTotals(
  lines: BillLineInput[],
  opts: BillTotalsOptions
): BillTotals {
  const perLine = lines.map((l) => {
    const lineAmount = lineNet({
      qty: l.qty,
      unit_price: l.unit_price,
      discount: l.discount,
    });
    const split = lineVat({
      net: lineAmount,
      vat_rate: l.vat_rate,
      vat_inclusive: opts.vat_inclusive,
    });
    return { ...split, wht_rate: l.wht_rate };
  });

  const subtotal = sumD(perLine.map((r) => r.net));
  const vat_total = sumD(perLine.map((r) => r.vat));
  const total = subtotal.plus(vat_total);

  const threshold_satisfied = total.gte(WHT_THRESHOLD);

  const withholding_total = sumD(
    perLine.map((r) =>
      r.wht_rate != null
        ? lineWithholding({
            net_excl_vat: r.net,
            wht_rate: r.wht_rate,
            threshold_satisfied,
          })
        : D(0)
    )
  );

  const net_payable = total.minus(withholding_total);

  return { subtotal, vat_total, withholding_total, total, net_payable };
}

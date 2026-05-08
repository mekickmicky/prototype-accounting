import { D, sumD, Decimal } from "./money";

export type VatRate = "7" | "0" | "EXEMPT" | number | string;

export type DecimalLike = Decimal | number | string;

export interface LineNetInput {
  qty: DecimalLike;
  unit_price: DecimalLike;
  discount?: DecimalLike | null;
}

export interface LineVatInput {
  net: DecimalLike;
  vat_rate: VatRate;
  vat_inclusive: boolean;
}

export interface LineVatResult {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
}

export interface WithholdingInput {
  net_excl_vat: DecimalLike;
  wht_rate: DecimalLike;
}

export interface InvoiceLineInput {
  qty: DecimalLike;
  unit_price: DecimalLike;
  discount?: DecimalLike | null;
  vat_rate: VatRate;
  wht_rate?: DecimalLike | null;
}

export interface InvoiceTotalsOptions {
  vat_inclusive: boolean;
}

export interface InvoiceTotals {
  subtotal: Decimal;
  discount_total: Decimal;
  vat_total: Decimal;
  withholding_total: Decimal;
  total: Decimal;
}

function parseVatRate(r: VatRate): Decimal {
  if (typeof r === "string" && r.toUpperCase() === "EXEMPT") return D(0);
  return D(r as string | number);
}

/**
 * Line amount after discount: qty × unit_price − discount, rounded to 2dp.
 * In VAT-exclusive mode this is the net (pre-VAT); in VAT-inclusive mode
 * this is the gross (VAT-included) line amount.
 */
export function lineNet({ qty, unit_price, discount }: LineNetInput): Decimal {
  const q = D(qty);
  const p = D(unit_price);
  const d = discount == null ? D(0) : D(discount);
  return q.times(p).minus(d).toDecimalPlaces(2);
}

/**
 * Split a line amount into { net, vat, gross }, all rounded to 2dp.
 *
 * - `vat_inclusive=false`: input `net` is treated as the pre-VAT net.
 *     vat = round(net × rate), gross = net + vat.
 * - `vat_inclusive=true`: input `net` is treated as the VAT-inclusive gross.
 *     net = round(gross ÷ (1 + rate)), vat = gross − net.
 *
 * In both modes, `net + vat === gross` holds exactly because `vat` is derived
 * from the two already-rounded values rather than being independently rounded.
 */
export function lineVat({
  net,
  vat_rate,
  vat_inclusive,
}: LineVatInput): LineVatResult {
  const rate = parseVatRate(vat_rate);
  const factor = rate.div(100);

  if (vat_inclusive) {
    const gross = D(net).toDecimalPlaces(2);
    const divisor = D(1).plus(factor);
    const calcNet = gross.div(divisor).toDecimalPlaces(2);
    const vat = gross.minus(calcNet);
    return { net: calcNet, vat, gross };
  }

  const calcNet = D(net).toDecimalPlaces(2);
  const vat = calcNet.times(factor).toDecimalPlaces(2);
  const gross = calcNet.plus(vat);
  return { net: calcNet, vat, gross };
}

/**
 * Withholding tax on the pre-VAT net amount (Thai Revenue Department rule).
 * See specs/02 §13.4 and specs/03 §5.
 */
export function withholdingFromLine({
  net_excl_vat,
  wht_rate,
}: WithholdingInput): Decimal {
  const net = D(net_excl_vat);
  const rate = D(wht_rate);
  return net.times(rate.div(100)).toDecimalPlaces(2);
}

/**
 * Roll up invoice-level totals from raw line inputs.
 *
 * - `subtotal` = Σ line-net (post-discount, pre-VAT)
 * - `discount_total` = Σ line discount
 * - `vat_total` = Σ line VAT
 * - `withholding_total` = Σ line withholding (computed on each line's net)
 * - `total` = subtotal + vat_total (gross invoice value, before WHT deduction)
 */
export function invoiceTotals(
  lines: InvoiceLineInput[],
  opts: InvoiceTotalsOptions
): InvoiceTotals {
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
    const wht =
      l.wht_rate != null && D(l.wht_rate).gt(0)
        ? withholdingFromLine({
            net_excl_vat: split.net,
            wht_rate: l.wht_rate,
          })
        : D(0);
    const discount = l.discount == null ? D(0) : D(l.discount);
    return { ...split, wht, discount };
  });

  const subtotal = sumD(perLine.map((r) => r.net));
  const discount_total = sumD(perLine.map((r) => r.discount));
  const vat_total = sumD(perLine.map((r) => r.vat));
  const withholding_total = sumD(perLine.map((r) => r.wht));
  const total = subtotal.plus(vat_total);

  return {
    subtotal,
    discount_total,
    vat_total,
    withholding_total,
    total,
  };
}

import { describe, expect, it } from "bun:test";
import { D } from "./money";
import {
  lineNet,
  lineVat,
  invoiceTotals,
  withholdingFromLine,
  type InvoiceLineInput,
} from "./invoice-math";

describe("lineNet", () => {
  it("multiplies qty × unit_price", () => {
    expect(lineNet({ qty: 2, unit_price: "100.00" }).toFixed(2)).toBe("200.00");
  });

  it("subtracts discount", () => {
    expect(
      lineNet({ qty: 1, unit_price: "1000.00", discount: "100" }).toFixed(2)
    ).toBe("900.00");
  });

  it("treats null/undefined discount as zero", () => {
    expect(
      lineNet({ qty: 1, unit_price: "500.00", discount: null }).toFixed(2)
    ).toBe("500.00");
    expect(lineNet({ qty: 1, unit_price: "500.00" }).toFixed(2)).toBe("500.00");
  });

  it("rounds the result to 2dp (HALF_UP)", () => {
    expect(lineNet({ qty: "1.5", unit_price: "33.33" }).toFixed(2)).toBe(
      "50.00"
    );
    expect(lineNet({ qty: 3, unit_price: "33.335" }).toFixed(2)).toBe("100.01");
  });
});

describe("lineVat — exclusive", () => {
  it("computes VAT on net at 7%", () => {
    const r = lineVat({ net: "1000.00", vat_rate: "7", vat_inclusive: false });
    expect(r.net.toFixed(2)).toBe("1000.00");
    expect(r.vat.toFixed(2)).toBe("70.00");
    expect(r.gross.toFixed(2)).toBe("1070.00");
  });

  it("returns zero VAT for rate 0", () => {
    const r = lineVat({ net: "1000.00", vat_rate: "0", vat_inclusive: false });
    expect(r.vat.toFixed(2)).toBe("0.00");
    expect(r.gross.toFixed(2)).toBe("1000.00");
  });

  it("returns zero VAT for EXEMPT", () => {
    const r = lineVat({
      net: "1000.00",
      vat_rate: "EXEMPT",
      vat_inclusive: false,
    });
    expect(r.vat.toFixed(2)).toBe("0.00");
    expect(r.gross.toFixed(2)).toBe("1000.00");
  });

  it("rounds VAT independently to 2dp", () => {
    // 333.33 × 0.07 = 23.3331 → 23.33
    const r = lineVat({ net: "333.33", vat_rate: "7", vat_inclusive: false });
    expect(r.vat.toFixed(2)).toBe("23.33");
    expect(r.gross.toFixed(2)).toBe("356.66");
  });
});

describe("lineVat — inclusive", () => {
  it("back-calculates net from gross at 7%", () => {
    // 1070 / 1.07 = 1000
    const r = lineVat({ net: "1070.00", vat_rate: "7", vat_inclusive: true });
    expect(r.gross.toFixed(2)).toBe("1070.00");
    expect(r.net.toFixed(2)).toBe("1000.00");
    expect(r.vat.toFixed(2)).toBe("70.00");
  });

  it("rounds inclusive split to 2dp each", () => {
    // 100 / 1.07 = 93.4579... → 93.46; vat = 100 - 93.46 = 6.54
    const r = lineVat({ net: "100.00", vat_rate: "7", vat_inclusive: true });
    expect(r.gross.toFixed(2)).toBe("100.00");
    expect(r.net.toFixed(2)).toBe("93.46");
    expect(r.vat.toFixed(2)).toBe("6.54");
  });

  it("EXEMPT inclusive yields zero VAT", () => {
    const r = lineVat({
      net: "500.00",
      vat_rate: "EXEMPT",
      vat_inclusive: true,
    });
    expect(r.net.toFixed(2)).toBe("500.00");
    expect(r.vat.toFixed(2)).toBe("0.00");
    expect(r.gross.toFixed(2)).toBe("500.00");
  });
});

describe("lineVat — invariant net + vat === gross", () => {
  // Property test: cover a wide grid of inputs.
  const qtys = ["1", "1.5", "3", "7"];
  const prices = ["33.33", "100.00", "299.99", "1234.56", "9999.99"];
  const discounts = [null, "0", "10", "100"];
  const rates: Array<"7" | "0" | "EXEMPT"> = ["7", "0", "EXEMPT"];

  for (const inclusive of [false, true]) {
    for (const q of qtys) {
      for (const p of prices) {
        for (const d of discounts) {
          for (const r of rates) {
            it(`q=${q} p=${p} d=${d} rate=${r} incl=${inclusive}`, () => {
              const amount = lineNet({
                qty: q,
                unit_price: p,
                discount: d,
              });
              const split = lineVat({
                net: amount,
                vat_rate: r,
                vat_inclusive: inclusive,
              });
              expect(
                split.net.plus(split.vat).eq(split.gross)
              ).toBe(true);
            });
          }
        }
      }
    }
  }
});

describe("withholdingFromLine", () => {
  it("computes WHT on pre-VAT net amount", () => {
    // 3% on 1000 = 30
    expect(
      withholdingFromLine({ net_excl_vat: "1000.00", wht_rate: "3" }).toFixed(2)
    ).toBe("30.00");
  });

  it("rounds to 2dp", () => {
    // 5% on 333.33 = 16.6665 → 16.67
    expect(
      withholdingFromLine({ net_excl_vat: "333.33", wht_rate: "5" }).toFixed(2)
    ).toBe("16.67");
  });

  it("zero rate yields zero", () => {
    expect(
      withholdingFromLine({ net_excl_vat: "5000", wht_rate: "0" }).toFixed(2)
    ).toBe("0.00");
  });
});

describe("invoiceTotals", () => {
  it("single line, exclusive 7%", () => {
    const lines: InvoiceLineInput[] = [
      { qty: 1, unit_price: "1000.00", vat_rate: "7" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: false });
    expect(t.subtotal.toFixed(2)).toBe("1000.00");
    expect(t.discount_total.toFixed(2)).toBe("0.00");
    expect(t.vat_total.toFixed(2)).toBe("70.00");
    expect(t.withholding_total.toFixed(2)).toBe("0.00");
    expect(t.total.toFixed(2)).toBe("1070.00");
  });

  it("single line, inclusive 7%", () => {
    const lines: InvoiceLineInput[] = [
      { qty: 1, unit_price: "1070.00", vat_rate: "7" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: true });
    expect(t.subtotal.toFixed(2)).toBe("1000.00");
    expect(t.vat_total.toFixed(2)).toBe("70.00");
    expect(t.total.toFixed(2)).toBe("1070.00");
  });

  it("aggregates discount_total from line discounts", () => {
    const lines: InvoiceLineInput[] = [
      { qty: 1, unit_price: "1000.00", discount: "100", vat_rate: "7" },
      { qty: 2, unit_price: "500.00", discount: "50", vat_rate: "7" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: false });
    expect(t.discount_total.toFixed(2)).toBe("150.00");
    // Net per line: 900, 950 → subtotal 1850
    expect(t.subtotal.toFixed(2)).toBe("1850.00");
    // VAT: 63.00 + 66.50 = 129.50
    expect(t.vat_total.toFixed(2)).toBe("129.50");
    expect(t.total.toFixed(2)).toBe("1979.50");
  });

  it("computes withholding_total per line on pre-VAT net", () => {
    const lines: InvoiceLineInput[] = [
      { qty: 1, unit_price: "1000.00", vat_rate: "7", wht_rate: "3" },
      { qty: 1, unit_price: "2000.00", vat_rate: "7", wht_rate: "3" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: false });
    expect(t.withholding_total.toFixed(2)).toBe("90.00"); // 30 + 60
    expect(t.total.toFixed(2)).toBe("3210.00"); // 3000 + 210 vat
  });

  it("totals reconcile across many lines (exclusive)", () => {
    const lines: InvoiceLineInput[] = [
      { qty: "1.5", unit_price: "299.99", vat_rate: "7" },
      { qty: 3, unit_price: "33.33", discount: "5", vat_rate: "7" },
      { qty: 1, unit_price: "1234.56", discount: "100", vat_rate: "0" },
      { qty: 2, unit_price: "500.00", vat_rate: "EXEMPT" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: false });
    expect(t.subtotal.plus(t.vat_total).eq(t.total)).toBe(true);
  });

  it("totals reconcile across many lines (inclusive)", () => {
    const lines: InvoiceLineInput[] = [
      { qty: "1.5", unit_price: "299.99", vat_rate: "7" },
      { qty: 3, unit_price: "33.33", discount: "5", vat_rate: "7" },
      { qty: 1, unit_price: "1234.56", vat_rate: "0" },
      { qty: 2, unit_price: "500.00", vat_rate: "EXEMPT" },
    ];
    const t = invoiceTotals(lines, { vat_inclusive: true });
    expect(t.subtotal.plus(t.vat_total).eq(t.total)).toBe(true);
  });

  it("empty lines → all zero", () => {
    const t = invoiceTotals([], { vat_inclusive: false });
    expect(t.subtotal.eq(D(0))).toBe(true);
    expect(t.discount_total.eq(D(0))).toBe(true);
    expect(t.vat_total.eq(D(0))).toBe(true);
    expect(t.withholding_total.eq(D(0))).toBe(true);
    expect(t.total.eq(D(0))).toBe(true);
  });
});

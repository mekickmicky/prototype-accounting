import { describe, expect, it } from "bun:test";
import { D } from "./money";
import {
  billTotals,
  lineWithholding,
  type BillLineInput,
} from "./bill-math";

describe("lineWithholding", () => {
  it("computes WHT on pre-VAT net when threshold is satisfied", () => {
    expect(
      lineWithholding({
        net_excl_vat: "1000.00",
        wht_rate: "3",
        threshold_satisfied: true,
      }).toFixed(2)
    ).toBe("30.00");
  });

  it("returns zero when threshold is not satisfied", () => {
    expect(
      lineWithholding({
        net_excl_vat: "500.00",
        wht_rate: "3",
        threshold_satisfied: false,
      }).toFixed(2)
    ).toBe("0.00");
  });

  it("returns zero when rate is zero", () => {
    expect(
      lineWithholding({
        net_excl_vat: "5000.00",
        wht_rate: "0",
        threshold_satisfied: true,
      }).toFixed(2)
    ).toBe("0.00");
  });

  it("rounds to 2dp", () => {
    // 5% on 333.33 = 16.6665 → 16.67
    expect(
      lineWithholding({
        net_excl_vat: "333.33",
        wht_rate: "5",
        threshold_satisfied: true,
      }).toFixed(2)
    ).toBe("16.67");
  });
});

describe("billTotals — basic shape", () => {
  it("single line, exclusive 7%, with WHT", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "1000.00", vat_rate: "7", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.subtotal.toFixed(2)).toBe("1000.00");
    expect(t.vat_total.toFixed(2)).toBe("70.00");
    expect(t.withholding_total.toFixed(2)).toBe("30.00");
    expect(t.total.toFixed(2)).toBe("1070.00");
    expect(t.net_payable.toFixed(2)).toBe("1040.00");
  });

  it("single line, inclusive 7%, with WHT on pre-VAT net", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "1070.00", vat_rate: "7", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: true });
    expect(t.subtotal.toFixed(2)).toBe("1000.00");
    expect(t.vat_total.toFixed(2)).toBe("70.00");
    expect(t.withholding_total.toFixed(2)).toBe("30.00");
    expect(t.total.toFixed(2)).toBe("1070.00");
    expect(t.net_payable.toFixed(2)).toBe("1040.00");
  });

  it("multi-line WHT sums per line on pre-VAT net", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "1000.00", vat_rate: "7", wht_rate: "3" },
      { qty: 1, unit_price: "2000.00", vat_rate: "7", wht_rate: "5" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.subtotal.toFixed(2)).toBe("3000.00");
    expect(t.vat_total.toFixed(2)).toBe("210.00");
    // 3% × 1000 + 5% × 2000 = 30 + 100
    expect(t.withholding_total.toFixed(2)).toBe("130.00");
    expect(t.total.toFixed(2)).toBe("3210.00");
    expect(t.net_payable.toFixed(2)).toBe("3080.00");
  });

  it("null/missing wht_rate yields zero WHT for that line", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "1500.00", vat_rate: "7" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.withholding_total.toFixed(2)).toBe("0.00");
    expect(t.net_payable.eq(t.total)).toBe(true);
  });

  it("empty lines → all zero", () => {
    const t = billTotals([], { vat_inclusive: false });
    expect(t.subtotal.eq(D(0))).toBe(true);
    expect(t.vat_total.eq(D(0))).toBe(true);
    expect(t.withholding_total.eq(D(0))).toBe(true);
    expect(t.total.eq(D(0))).toBe(true);
    expect(t.net_payable.eq(D(0))).toBe(true);
  });
});

describe("billTotals — threshold (WHT_THRESHOLD = 1,000)", () => {
  it("bill of 500 THB → withholding_total = 0 even with rate 3%", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "500.00", vat_rate: "0", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.total.toFixed(2)).toBe("500.00");
    expect(t.withholding_total.toFixed(2)).toBe("0.00");
    expect(t.net_payable.toFixed(2)).toBe("500.00");
  });

  it("bill just under 1,000 (gross) → no WHT", () => {
    // 933.33 net + 7% VAT = 999.66 total → below threshold
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "933.33", vat_rate: "7", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.total.lt(D("1000"))).toBe(true);
    expect(t.withholding_total.toFixed(2)).toBe("0.00");
  });

  it("bill exactly 1,000 (gross) → WHT applies", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "1000.00", vat_rate: "0", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.total.toFixed(2)).toBe("1000.00");
    expect(t.withholding_total.toFixed(2)).toBe("30.00");
    expect(t.net_payable.toFixed(2)).toBe("970.00");
  });

  it("multi-line bill where individual lines are < 1,000 but bill total is ≥ 1,000 → WHT applies to all lines", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "600.00", vat_rate: "0", wht_rate: "3" },
      { qty: 1, unit_price: "500.00", vat_rate: "0", wht_rate: "3" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.total.toFixed(2)).toBe("1100.00");
    // 3% × (600 + 500) = 33
    expect(t.withholding_total.toFixed(2)).toBe("33.00");
  });

  it("multi-line bill where total < 1,000 → all lines collapse to zero WHT", () => {
    const lines: BillLineInput[] = [
      { qty: 1, unit_price: "300.00", vat_rate: "0", wht_rate: "3" },
      { qty: 1, unit_price: "400.00", vat_rate: "0", wht_rate: "5" },
    ];
    const t = billTotals(lines, { vat_inclusive: false });
    expect(t.total.toFixed(2)).toBe("700.00");
    expect(t.withholding_total.toFixed(2)).toBe("0.00");
  });
});

describe("billTotals — invariant: subtotal + vat_total = total; total - withholding_total = net_payable", () => {
  const grids: Array<{ inclusive: boolean; lines: BillLineInput[] }> = [
    {
      inclusive: false,
      lines: [
        { qty: 1, unit_price: "1000.00", vat_rate: "7", wht_rate: "3" },
      ],
    },
    {
      inclusive: false,
      lines: [
        { qty: "1.5", unit_price: "299.99", vat_rate: "7", wht_rate: "3" },
        { qty: 3, unit_price: "33.33", discount: "5", vat_rate: "7" },
        { qty: 1, unit_price: "1234.56", vat_rate: "0", wht_rate: "5" },
        { qty: 2, unit_price: "500.00", vat_rate: "EXEMPT", wht_rate: "1" },
      ],
    },
    {
      inclusive: true,
      lines: [
        { qty: 1, unit_price: "1070.00", vat_rate: "7", wht_rate: "3" },
        { qty: 2, unit_price: "535.00", vat_rate: "7", wht_rate: "5" },
      ],
    },
    {
      inclusive: false,
      lines: [
        { qty: 1, unit_price: "300.00", vat_rate: "0", wht_rate: "3" },
        { qty: 1, unit_price: "400.00", vat_rate: "0", wht_rate: "5" },
      ],
    },
    {
      inclusive: false,
      lines: [],
    },
  ];

  for (const [i, { inclusive, lines }] of grids.entries()) {
    it(`grid #${i} inclusive=${inclusive}`, () => {
      const t = billTotals(lines, { vat_inclusive: inclusive });
      expect(t.subtotal.plus(t.vat_total).eq(t.total)).toBe(true);
      expect(t.total.minus(t.withholding_total).eq(t.net_payable)).toBe(true);
      expect(
        t.subtotal.plus(t.vat_total).minus(t.withholding_total).eq(t.net_payable)
      ).toBe(true);
    });
  }
});

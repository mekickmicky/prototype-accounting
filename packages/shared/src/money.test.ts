import { describe, expect, it } from "bun:test";
import { D, sumD, formatTHB, parseTHB } from "./money";

describe("D", () => {
  it("creates a Decimal from string", () => {
    const d = D("100.50");
    expect(d.toFixed(2)).toBe("100.50");
  });

  it("creates a Decimal from number", () => {
    const d = D(100.5);
    expect(d.toFixed(2)).toBe("100.50");
  });

  it("creates a Decimal from Decimal", () => {
    const d = D(D("100"));
    expect(d.toFixed(2)).toBe("100.00");
  });

  it("handles rounding per HALF_UP at precision 20", () => {
    // This is the acceptance test from the Done when spec
    const result = D("1.005").times(D("1.005"));
    expect(result.toFixed(2)).toBe("1.01");
  });
});

describe("sumD", () => {
  it("sums decimals", () => {
    const result = sumD([D("1.50"), D("2.50"), D("3.00")]);
    expect(result.toFixed(2)).toBe("7.00");
  });

  it("returns zero for empty array", () => {
    const result = sumD([]);
    expect(result.eq(D(0))).toBe(true);
  });

  it("handles single element", () => {
    const result = sumD([D("42.99")]);
    expect(result.toFixed(2)).toBe("42.99");
  });
});

describe("formatTHB", () => {
  it("formats positive with commas", () => {
    expect(formatTHB(D("1234.56"))).toBe("1,234.56");
  });

  it("formats large number", () => {
    expect(formatTHB(D("1234567.89"))).toBe("1,234,567.89");
  });

  it("formats zero as em-dash", () => {
    expect(formatTHB(D("0"))).toBe("—");
  });

  it("formats negative with parens", () => {
    expect(formatTHB(D("-1234.56"))).toBe("(1,234.56)");
  });

  it("always shows 2 decimal places", () => {
    expect(formatTHB(D("100"))).toBe("100.00");
  });
});

describe("parseTHB", () => {
  it("parses plain number", () => {
    expect(parseTHB("1234.56").toFixed(2)).toBe("1234.56");
  });

  it("parses with commas", () => {
    expect(parseTHB("1,234,567.89").toFixed(2)).toBe("1234567.89");
  });

  it("parses negative with parens", () => {
    expect(parseTHB("(1,234.56)").toFixed(2)).toBe("-1234.56");
  });

  it("parses em-dash as zero", () => {
    expect(parseTHB("—").eq(D(0))).toBe(true);
  });

  it("parses empty string as zero", () => {
    expect(parseTHB("").eq(D(0))).toBe(true);
  });

  it("round-trips formatTHB → parseTHB", () => {
    const original = D("9876.54");
    expect(parseTHB(formatTHB(original)).toFixed(2)).toBe("9876.54");
  });

  it("round-trips negative", () => {
    const original = D("-1234.56");
    expect(parseTHB(formatTHB(original)).toFixed(2)).toBe("-1234.56");
  });
});

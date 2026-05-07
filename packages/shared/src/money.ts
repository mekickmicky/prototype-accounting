import Decimal from "decimal.js";

// Configure once at import time — all modules that import from here get this config.
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Create a Decimal from a string, number, or existing Decimal.
 * Use this everywhere instead of `new Decimal(...)` to guarantee
 * the shared configuration is in effect.
 */
export function D(v: string | number | Decimal): Decimal {
  return new Decimal(v);
}

/**
 * Sum an array of Decimals. Returns D(0) for an empty array.
 */
export function sumD(arr: Decimal[]): Decimal {
  if (arr.length === 0) return D(0);
  return arr.reduce((acc, d) => acc.plus(d), D(0));
}

/**
 * Format a Decimal as a THB display string:
 * - Positive: "1,234.56"
 * - Zero: "—" (em-dash)
 * - Negative: "(1,234.56)"
 */
export function formatTHB(d: Decimal): string {
  if (d.isZero()) return "—";

  const abs = d.abs();
  const parts = abs.toFixed(2).split(".");
  const intPart = parts[0]!;
  const fracPart = parts[1]!;

  // Insert commas every 3 digits from the right
  const chars: string[] = [];
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) {
      chars.push(",");
    }
    chars.push(intPart[i]!);
  }
  const formatted = `${chars.join("")}.${fracPart}`;

  return d.isNegative() ? `(${formatted})` : formatted;
}

/**
 * Parse a THB-formatted string back to a Decimal.
 * Handles: "1,234.56", "(1,234.56)", "—", "0", "0.00"
 */
export function parseTHB(s: string): Decimal {
  const trimmed = s.trim();

  // Em-dash or empty = zero
  if (trimmed === "—" || trimmed === "" || trimmed === "-") {
    return D(0);
  }

  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = negative
    ? trimmed.slice(1, -1).replace(/,/g, "")
    : trimmed.replace(/,/g, "");

  const d = new Decimal(cleaned);
  return negative ? d.negated() : d;
}

export { Decimal };

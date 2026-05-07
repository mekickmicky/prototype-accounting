"use client";

import { D, formatTHB, Decimal } from "@wind-acc/shared";
import { cn } from "@/lib/utils";

interface MoneyDisplayProps {
  value: Decimal | string | null | undefined;
  className?: string;
  showCurrency?: boolean;
  showZero?: boolean;
}

export function MoneyDisplay({
  value,
  className,
  showCurrency = false,
  showZero = false,
}: MoneyDisplayProps) {
  if (value === null || value === undefined) {
    return (
      <span className={cn("tabular-nums text-[--text-dim]", className)}>
        —
      </span>
    );
  }

  const d = D(value instanceof Decimal ? value.toString() : value);

  if (d.isZero() && !showZero) {
    return (
      <span className={cn("tabular-nums text-[--text-dim]", className)}>
        —
      </span>
    );
  }

  const formatted = formatTHB(d);
  const isNegative = d.isNegative();
  const prefix = showCurrency ? "฿" : "";

  return (
    <span
      className={cn(
        "tabular-nums",
        isNegative ? "text-[--balance-neg]" : "",
        className
      )}
    >
      {showCurrency ? `${prefix}${formatted}` : formatted}
    </span>
  );
}

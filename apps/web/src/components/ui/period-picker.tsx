"use client";

import { cn } from "@/lib/utils";

export type PeriodStatus = "OPEN" | "CLOSED" | "LOCKED";

export interface PeriodOption {
  code: string;
  status: PeriodStatus;
}

interface PeriodPickerProps {
  value?: string | null;
  onChange: (code: string | null) => void;
  periods: PeriodOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

const STATUS_SUFFIX: Record<PeriodStatus, string> = {
  OPEN: " ✓",
  CLOSED: " ✕",
  LOCKED: " ⊘",
};

function formatPeriodLabel(code: string): string {
  const parts = code.split("-").map(Number);
  const year = parts[0] ?? 2000;
  const month = parts[1] ?? 1;
  const d = new Date(year, month - 1, 1);
  const thYear = year + 543;
  const monthTH = d.toLocaleDateString("th-TH", { month: "long" });
  return `${monthTH} ${thYear}`;
}

export function PeriodPicker({
  value,
  onChange,
  periods,
  disabled = false,
  className,
  placeholder = "เลือกงวด...",
}: PeriodPickerProps) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      disabled={disabled}
      className={cn(
        "h-8 rounded border border-[--border-strong] bg-[--bg-elevated]",
        "px-2.5 text-[13px] text-[--text-primary]",
        "focus:outline-none focus:border-[--accent]",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        "transition-[border-color] duration-[150ms] cursor-pointer",
        className
      )}
    >
      <option value="">{placeholder}</option>
      {periods.map((p) => (
        <option key={p.code} value={p.code}>
          {p.code} · {formatPeriodLabel(p.code)}
          {STATUS_SUFFIX[p.status]}
        </option>
      ))}
    </select>
  );
}

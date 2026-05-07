"use client";

import { cn } from "@/lib/utils";

interface DatePickerTHProps {
  value?: string | null;
  onChange: (isoDate: string | null) => void;
  disabled?: boolean;
  className?: string;
  min?: string;
  max?: string;
}

function formatBuddhistEra(iso: string): string {
  const parts = iso.split("-").map(Number);
  const year = parts[0] ?? 2000;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function DatePickerTH({
  value,
  onChange,
  disabled = false,
  className,
  min,
  max,
}: DatePickerTHProps) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        min={min}
        max={max}
        className={cn(
          "h-8 rounded border border-[--border-strong] bg-[--bg-elevated]",
          "px-2.5 text-[13px] text-[--text-primary]",
          "focus:outline-none focus:border-[--accent]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-[border-color] duration-[150ms]",
          "[color-scheme:dark]"
        )}
      />
      {value && (
        <span className="text-[11px] text-[--text-dim]">
          {formatBuddhistEra(value)}
        </span>
      )}
    </div>
  );
}

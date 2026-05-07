"use client";

import { cn } from "@/lib/utils";

export type BranchCode = "TL" | "EK" | "RAMA9";
export const BRANCH_CODES: BranchCode[] = ["TL", "EK", "RAMA9"];

const BRANCH_LABELS: Record<BranchCode, string> = {
  TL: "ทองหล่อ (TL)",
  EK: "เอกมัย (EK)",
  RAMA9: "พระราม 9 (RAMA9)",
};

interface BranchPickerProps {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  disabled?: boolean;
  className?: string;
}

export function BranchPicker({
  value,
  onChange,
  allowAll = false,
  disabled = false,
  className,
}: BranchPickerProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
      {allowAll && <option value="ALL">ทุกสาขา</option>}
      {BRANCH_CODES.map((code) => (
        <option key={code} value={code}>
          {BRANCH_LABELS[code]}
        </option>
      ))}
    </select>
  );
}

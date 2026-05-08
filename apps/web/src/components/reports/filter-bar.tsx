"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Play, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchPicker } from "@/components/ui/branch-picker";

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentPeriodBangkok(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function subtractMonths(code: string, n: number): string {
  const [y, m] = code.split("-").map(Number);
  const total = (y ?? 2000) * 12 + ((m ?? 1) - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function todayBangkok(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportFilterParams {
  periodFrom: string;
  periodTo: string;
  asOf: string;
  branch: string;
  showZero: boolean;
  comparative: boolean;
}

interface ReportFilterBarProps {
  /** "range" shows period_from / period_to; "snapshot" shows a single as_of date */
  mode?: "range" | "snapshot";
  showZeroToggle?: boolean;
  showComparativeToggle?: boolean;
  onRun: (params: ReportFilterParams) => void;
  onExport?: (format: "csv" | "xlsx" | "pdf") => void;
  exporting?: string | null;
  showExports?: boolean;
  loading?: boolean;
  className?: string;
}

// ── ExportButtons ─────────────────────────────────────────────────────────────

interface ExportButtonsProps {
  onExport: (format: "csv" | "xlsx" | "pdf") => void;
  exporting: string | null;
}

export function ExportButtons({ onExport, exporting }: ExportButtonsProps) {
  return (
    <div className="flex items-center gap-2">
      {(["csv", "xlsx", "pdf"] as const).map((f) => (
        <button
          key={f}
          onClick={() => onExport(f)}
          disabled={exporting !== null}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5",
            "border border-gray-700 hover:border-gray-500",
            "text-gray-300 hover:text-white text-xs font-medium rounded-md",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {exporting === f ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── ReportFilterBar ───────────────────────────────────────────────────────────

export function ReportFilterBar({
  mode = "range",
  showZeroToggle = false,
  showComparativeToggle = false,
  onRun,
  onExport,
  exporting = null,
  showExports = false,
  loading = false,
  className,
}: ReportFilterBarProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPeriod = currentPeriodBangkok();

  const [periodFrom, setPeriodFrom] = useState(
    searchParams.get("period_from") ?? subtractMonths(currentPeriod, 11)
  );
  const [periodTo, setPeriodTo] = useState(
    searchParams.get("period_to") ?? currentPeriod
  );
  const [asOf, setAsOf] = useState(
    searchParams.get("as_of") ?? todayBangkok()
  );
  const [branch, setBranch] = useState(
    searchParams.get("branch") ?? "ALL"
  );
  const [showZero, setShowZero] = useState(
    searchParams.get("show_zero") === "1"
  );
  const [comparative, setComparative] = useState(
    searchParams.get("comparative") === "1"
  );

  const run = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "range") {
      params.set("period_from", periodFrom);
      params.set("period_to", periodTo);
      params.delete("as_of");
    } else {
      params.set("as_of", asOf);
      params.delete("period_from");
      params.delete("period_to");
    }
    params.set("branch", branch);
    params.set("show_zero", showZero ? "1" : "0");
    params.set("comparative", comparative ? "1" : "0");
    router.replace(`${pathname}?${params.toString()}`);
    onRun({ periodFrom, periodTo, asOf, branch, showZero, comparative });
  }, [
    mode,
    periodFrom,
    periodTo,
    asOf,
    branch,
    showZero,
    comparative,
    onRun,
    router,
    pathname,
    searchParams,
  ]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 bg-gray-900 border border-gray-800 rounded-lg p-4",
        className
      )}
    >
      {/* Period pickers */}
      {mode === "range" ? (
        <>
          <Field label="Period From">
            <input
              type="month"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Period To">
            <input
              type="month"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className={inputCls}
            />
          </Field>
        </>
      ) : (
        <Field label="As Of">
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className={inputCls}
          />
        </Field>
      )}

      {/* Branch picker */}
      <Field label="Branch">
        <BranchPicker value={branch} onChange={setBranch} allowAll />
      </Field>

      {/* Toggles */}
      {showZeroToggle && (
        <Toggle
          label="Show zero-balance"
          checked={showZero}
          onChange={setShowZero}
        />
      )}
      {showComparativeToggle && (
        <Toggle
          label="Comparative"
          checked={comparative}
          onChange={setComparative}
        />
      )}

      {/* Run button */}
      <button
        onClick={run}
        disabled={loading}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2",
          "bg-rose-600 hover:bg-rose-500 disabled:opacity-50",
          "text-white text-sm font-medium rounded-md transition-colors"
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        Run Report
      </button>

      {/* Export buttons — shown when there's data to export */}
      {showExports && onExport && (
        <div className="ml-auto">
          <ExportButtons onExport={onExport} exporting={exporting} />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputCls = cn(
  "h-8 rounded border border-gray-700 bg-gray-800",
  "px-2.5 text-sm text-white",
  "focus:outline-none focus:border-rose-500",
  "transition-[border-color] duration-[150ms]"
);

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer self-end pb-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-rose-500 w-3.5 h-3.5 cursor-pointer"
      />
      <span className="text-xs text-gray-300 select-none">{label}</span>
    </label>
  );
}

"use client";

import React, { useState, useCallback } from "react";
import { Download, Loader2, Play, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BranchAmounts {
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

interface BranchPnLRow {
  account_code: string;
  name_th: string;
  name_en: string;
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

interface BranchPnLSection {
  title_th: string;
  title_en: string;
  rows: BranchPnLRow[];
  tl: string;
  ek: string;
  rama9: string;
  total: string;
}

interface BranchPnLResult {
  start_date: string;
  end_date: string;
  revenue: BranchPnLSection;
  cogs: BranchPnLSection;
  gross_profit: BranchAmounts;
  opex: BranchPnLSection;
  operating_income: BranchAmounts;
  other: BranchPnLSection;
  net_income: BranchAmounts;
  balanced: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentPeriodBangkok(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function subtractMonths(code: string, n: number): string {
  const [y, m] = code.split("-").map(Number);
  const total = y! * 12 + (m! - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function fmt(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  const abs = Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(${abs})` : abs;
}

function amountColor(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "text-gray-500";
  return num < 0 ? "text-red-400" : "text-white";
}

async function triggerExport(periodFrom: string, periodTo: string, format: "csv" | "xlsx" | "pdf") {
  const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo, format });
  const url = `${API_BASE}/api/v1/reports/branch-pnl?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `branch-pnl-${periodFrom}_${periodTo}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Section component ─────────────────────────────────────────────────────────

function SectionBlock({ section }: { section: BranchPnLSection }) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-gray-800/80">
        <td colSpan={2} className="py-2 px-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {section.title_en} / {section.title_th}
        </td>
        <td className="py-2 px-3" />
        <td className="py-2 px-3" />
        <td className="py-2 px-3" />
        <td className="py-2 px-3" />
      </tr>

      {/* Data rows */}
      {section.rows.map((row) => (
        <tr
          key={row.account_code}
          className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors text-sm"
        >
          <td className="py-2 px-3 font-mono text-gray-400 text-xs">{row.account_code}</td>
          <td className="py-2 px-3 text-gray-300 pl-6">{row.name_en}</td>
          <td className={`py-2 px-3 text-right tabular-nums text-xs ${amountColor(row.tl)}`}>{fmt(row.tl)}</td>
          <td className={`py-2 px-3 text-right tabular-nums text-xs ${amountColor(row.ek)}`}>{fmt(row.ek)}</td>
          <td className={`py-2 px-3 text-right tabular-nums text-xs ${amountColor(row.rama9)}`}>{fmt(row.rama9)}</td>
          <td className={`py-2 px-3 text-right tabular-nums text-xs font-medium ${amountColor(row.total)}`}>{fmt(row.total)}</td>
        </tr>
      ))}

      {/* Subtotal */}
      <tr className="border-t border-gray-600 bg-gray-800/40 text-sm font-semibold">
        <td className="py-2 px-3" />
        <td className="py-2 px-3 text-gray-200 pl-6">Total {section.title_en}</td>
        <td className={`py-2 px-3 text-right tabular-nums ${amountColor(section.tl)}`}>{fmt(section.tl)}</td>
        <td className={`py-2 px-3 text-right tabular-nums ${amountColor(section.ek)}`}>{fmt(section.ek)}</td>
        <td className={`py-2 px-3 text-right tabular-nums ${amountColor(section.rama9)}`}>{fmt(section.rama9)}</td>
        <td className={`py-2 px-3 text-right tabular-nums font-bold ${amountColor(section.total)}`}>{fmt(section.total)}</td>
      </tr>
    </>
  );
}

function DerivedRow({
  label,
  amounts,
  highlight,
}: {
  label: string;
  amounts: BranchAmounts;
  highlight?: boolean;
}) {
  const base = highlight
    ? "border-y-2 border-gray-400 bg-gray-800/70 font-bold text-base"
    : "border-y border-gray-600 bg-gray-800/50 font-semibold text-sm";

  return (
    <tr className={base}>
      <td className="py-3 px-3" />
      <td className="py-3 px-3 text-white">{label}</td>
      <td className={`py-3 px-3 text-right tabular-nums ${amountColor(amounts.tl)}`}>{fmt(amounts.tl)}</td>
      <td className={`py-3 px-3 text-right tabular-nums ${amountColor(amounts.ek)}`}>{fmt(amounts.ek)}</td>
      <td className={`py-3 px-3 text-right tabular-nums ${amountColor(amounts.rama9)}`}>{fmt(amounts.rama9)}</td>
      <td className={`py-3 px-3 text-right tabular-nums font-bold ${amountColor(amounts.total)}`}>{fmt(amounts.total)}</td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BranchPnLPage() {
  const currentPeriod = currentPeriodBangkok();
  const [periodFrom, setPeriodFrom] = useState(subtractMonths(currentPeriod, 0));
  const [periodTo, setPeriodTo] = useState(currentPeriod);
  const [result, setResult] = useState<BranchPnLResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo, format: "json" });
      const url = `${API_BASE}/api/v1/reports/branch-pnl?${params}`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Failed to load");
      setResult((body as { data: BranchPnLResult }).data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [periodFrom, periodTo]);

  const doExport = useCallback(async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await triggerExport(periodFrom, periodTo, format);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [periodFrom, periodTo]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Branch P&L / กำไรขาดทุนแยกตามสาขา" />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Period From</label>
          <input
            type="month"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="h-8 rounded border border-gray-700 bg-gray-800 px-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Period To</label>
          <input
            type="month"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="h-8 rounded border border-gray-700 bg-gray-800 px-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
          />
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Report
        </button>

        {result && (
          <div className="ml-auto flex items-center gap-2">
            {(["csv", "xlsx", "pdf"] as const).map((f) => (
              <button
                key={f}
                onClick={() => doExport(f)}
                disabled={exporting !== null}
                className="inline-flex items-center gap-1 px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-xs rounded-md transition-colors disabled:opacity-50"
              >
                {exporting === f ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Imbalance warning */}
      {result && !result.balanced && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          Branch totals (TL + EK + RAMA9) do not equal the Total column — some transactions may not have a branch code assigned.
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400">
            {periodFrom} — {periodTo}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="bg-gray-800 text-gray-300 text-xs">
                  <th className="py-2.5 px-3 text-left font-semibold w-24">Code</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Account</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-32">TL</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-32">EK</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-32">RAMA9</th>
                  <th className="py-2.5 px-3 text-right font-semibold w-36 border-l border-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <SectionBlock section={result.revenue} />
                <SectionBlock section={result.cogs} />
                <DerivedRow label="GROSS PROFIT / กำไรขั้นต้น" amounts={result.gross_profit} />
                <SectionBlock section={result.opex} />
                <DerivedRow label="OPERATING INCOME / กำไรจากการดำเนินงาน" amounts={result.operating_income} />
                <SectionBlock section={result.other} />
                <DerivedRow
                  label="NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)"
                  amounts={result.net_income}
                  highlight
                />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

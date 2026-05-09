"use client";

import React, { useState, useCallback } from "react";
import { Download, Loader2, Play, AlertTriangle } from "lucide-react";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { apiClient } from "@/lib/api-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BranchAmounts {
  total: string;
  [key: string]: string;
}

interface BranchPnLRow {
  account_code: string;
  name_th: string;
  name_en: string;
  total: string;
  [key: string]: string;
}

interface BranchPnLSection {
  title_th: string;
  title_en: string;
  rows: BranchPnLRow[];
  total: string;
  [key: string]: string | BranchPnLRow[];
}

interface BranchPnLResult {
  start_date: string;
  end_date: string;
  branches?: string[];
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
  const parts = code.split("-");
  const y = parseInt(parts[0] ?? "", 10);
  const m = parseInt(parts[1] ?? "", 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    throw new Error(`Invalid period code: ${code}`);
  }
  const total = y * 12 + (m - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function fmt(value: string): string {
  const d = new Decimal(value ?? 0);
  if (d.isZero()) return "—";
  const abs = d.abs().toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return d.isNegative() ? `(${abs})` : abs;
}

function amountColor(value: string): string {
  const d = new Decimal(value ?? 0);
  if (d.isZero()) return "text-gray-500";
  return d.isNegative() ? "text-red-400" : "text-white";
}

async function triggerExport(periodFrom: string, periodTo: string, format: "csv" | "xlsx" | "pdf") {
  const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo, format });
  const blob = await apiClient.getBlob(`/api/v1/reports/branch-pnl?${params}`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `branch-pnl-${periodFrom}_${periodTo}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Section component ─────────────────────────────────────────────────────────

function SectionBlock({ section, branches }: { section: BranchPnLSection; branches: string[] }) {
  return (
    <>
      {/* Section header */}
      <tr className="bg-gray-800/80">
        <td colSpan={2} className="py-2 px-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">
          {section.title_en} / {section.title_th}
        </td>
        {branches.map((b) => <td key={b} className="py-2 px-3" />)}
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
          {branches.map((b) => {
            const val = (row[b.toLowerCase()] as string) ?? "0";
            return (
              <td key={b} className={`py-2 px-3 text-right tabular-nums text-xs ${amountColor(val)}`}>
                {fmt(val)}
              </td>
            );
          })}
          <td className={`py-2 px-3 text-right tabular-nums text-xs font-medium ${amountColor(row.total)}`}>
            {fmt(row.total)}
          </td>
        </tr>
      ))}

      {/* Subtotal */}
      <tr className="border-t border-gray-600 bg-gray-800/40 text-sm font-semibold">
        <td className="py-2 px-3" />
        <td className="py-2 px-3 text-gray-200 pl-6">Total {section.title_en}</td>
        {branches.map((b) => {
          const val = (section[b.toLowerCase()] as string) ?? "0";
          return (
            <td key={b} className={`py-2 px-3 text-right tabular-nums ${amountColor(val)}`}>
              {fmt(val)}
            </td>
          );
        })}
        <td className={`py-2 px-3 text-right tabular-nums font-bold ${amountColor(section.total)}`}>
          {fmt(section.total)}
        </td>
      </tr>
    </>
  );
}

function DerivedRow({
  label,
  amounts,
  highlight,
  branches,
}: {
  label: string;
  amounts: BranchAmounts;
  highlight?: boolean;
  branches: string[];
}) {
  const base = highlight
    ? "border-y-2 border-gray-400 bg-gray-800/70 font-bold text-base"
    : "border-y border-gray-600 bg-gray-800/50 font-semibold text-sm";

  return (
    <tr className={base}>
      <td className="py-3 px-3" />
      <td className="py-3 px-3 text-white">{label}</td>
      {branches.map((b) => {
        const val = (amounts[b.toLowerCase()] as string) ?? "0";
        return (
          <td key={b} className={`py-3 px-3 text-right tabular-nums ${amountColor(val)}`}>
            {fmt(val)}
          </td>
        );
      })}
      <td className={`py-3 px-3 text-right tabular-nums font-bold ${amountColor(amounts.total)}`}>
        {fmt(amounts.total)}
      </td>
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
      const data = await apiClient.get<BranchPnLResult>(`/api/v1/reports/branch-pnl?${params}`);
      setResult(data);
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

  const branches = result
    ? [...(result.branches ?? ["EK", "RAMA9", "TL"])].sort()
    : [];

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
                  {branches.map((b) => (
                    <th key={b} className="py-2.5 px-3 text-right font-semibold w-32">{b}</th>
                  ))}
                  <th className="py-2.5 px-3 text-right font-semibold w-36 border-l border-gray-600">Total</th>
                </tr>
              </thead>
              <tbody>
                <SectionBlock section={result.revenue} branches={branches} />
                <SectionBlock section={result.cogs} branches={branches} />
                <DerivedRow label="GROSS PROFIT / กำไรขั้นต้น" amounts={result.gross_profit} branches={branches} />
                <SectionBlock section={result.opex} branches={branches} />
                <DerivedRow label="OPERATING INCOME / กำไรจากการดำเนินงาน" amounts={result.operating_income} branches={branches} />
                <SectionBlock section={result.other} branches={branches} />
                <DerivedRow
                  label="NET INCOME (BEFORE TAX) / กำไรสุทธิ (ก่อนภาษี)"
                  amounts={result.net_income}
                  highlight
                  branches={branches}
                />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

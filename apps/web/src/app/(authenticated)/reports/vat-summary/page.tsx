"use client";

import React, { useState, useCallback } from "react";
import { Download, ExternalLink, Loader2, Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

type VatPosition = "PAYABLE" | "REFUNDABLE" | "ZERO";
type VatFilingStatus = "UNFILED" | "DRAFT" | "FINALIZED" | "SUBMITTED";

interface VatSummaryRow {
  period_code: string;
  output_vat: string;
  taxable_sales: string;
  output_count: number;
  input_vat: string;
  total_purchases: string;
  input_count: number;
  non_claimable_vat: string;
  vat_payable: string;
  vat_position: VatPosition;
  status: VatFilingStatus;
  filing_id: string | null;
  filing_no: string | null;
  filed_at: string | null;
}

interface VatSummaryResult {
  period_from: string;
  period_to: string;
  rows: VatSummaryRow[];
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
  if (num < 0) return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<VatFilingStatus, string> = {
  SUBMITTED: "bg-green-900/40 text-green-400 border border-green-800",
  FINALIZED: "bg-blue-900/40 text-blue-400 border border-blue-800",
  DRAFT: "bg-amber-900/40 text-amber-400 border border-amber-800",
  UNFILED: "bg-gray-800 text-gray-400 border border-gray-700",
};

const POSITION_COLOR: Record<VatPosition, string> = {
  PAYABLE: "text-red-400 font-semibold",
  REFUNDABLE: "text-blue-400 font-semibold",
  ZERO: "text-gray-500",
};

// ── Export helper ─────────────────────────────────────────────────────────────

async function triggerExport(periodFrom: string, periodTo: string, format: "csv" | "xlsx" | "pdf") {
  const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo, format });
  const url = `${API_BASE}/api/v1/reports/vat-summary?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `vat-summary-${periodFrom}_${periodTo}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Period row ────────────────────────────────────────────────────────────────

function PeriodRow({ row }: { row: VatSummaryRow }) {
  const pp30Href = `/tax/pp30/new?period=${row.period_code}`;
  const filedHref = row.filing_id ? `/tax/pp30/${row.filing_id}` : null;

  return (
    <tr className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors text-sm">
      <td className="py-2.5 px-3 font-mono text-gray-200">{row.period_code}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-white">{fmt(row.output_vat)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-gray-300">{fmt(row.taxable_sales)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-gray-400">{row.output_count || "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-white">{fmt(row.input_vat)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-gray-300">{fmt(row.total_purchases)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-gray-400">{fmt(row.non_claimable_vat)}</td>
      <td className={`py-2.5 px-3 text-right tabular-nums ${POSITION_COLOR[row.vat_position]}`}>
        {fmt(row.vat_payable)}
      </td>
      <td className="py-2.5 px-3 text-center">
        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[row.status]}`}>
          {row.status}
        </span>
      </td>
      <td className="py-2.5 px-3 text-gray-300 text-xs">
        {filedHref ? (
          <a href={filedHref} className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline underline-offset-2">
            {row.filing_no}
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : row.status === "UNFILED" || row.status === "DRAFT" ? (
          <a href={pp30Href} className="inline-flex items-center gap-1 text-rose-400 hover:text-rose-300 text-xs">
            Generate ภพ.30
            <ExternalLink className="w-3 h-3" />
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VatSummaryPage() {
  const currentPeriod = currentPeriodBangkok();
  const [periodFrom, setPeriodFrom] = useState(subtractMonths(currentPeriod, 11));
  const [periodTo, setPeriodTo] = useState(currentPeriod);
  const [result, setResult] = useState<VatSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period_from: periodFrom, period_to: periodTo, format: "json" });
      const url = `${API_BASE}/api/v1/reports/vat-summary?${params}`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Failed to load");
      setResult((body as { data: VatSummaryResult }).data);
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
      <PageHeader title="VAT Summary / สรุปภาษีมูลค่าเพิ่ม" />

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
                {exporting === f ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
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

      {/* Results */}
      {result && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-2">
            <span className="text-xs text-gray-400">
              {result.period_from} — {result.period_to} · {result.rows.length} period{result.rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-300 text-xs">
                  <th className="py-2 px-3 text-left font-semibold">Period</th>
                  <th className="py-2 px-3 text-right font-semibold">Output VAT</th>
                  <th className="py-2 px-3 text-right font-semibold">Taxable Sales</th>
                  <th className="py-2 px-3 text-right font-semibold">Inv #</th>
                  <th className="py-2 px-3 text-right font-semibold">Input VAT</th>
                  <th className="py-2 px-3 text-right font-semibold">Purchases</th>
                  <th className="py-2 px-3 text-right font-semibold">Non-Claimable</th>
                  <th className="py-2 px-3 text-right font-semibold">VAT Payable</th>
                  <th className="py-2 px-3 text-center font-semibold">Status</th>
                  <th className="py-2 px-3 text-left font-semibold">Filing</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-500">
                      No VAT data for selected period range.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row) => <PeriodRow key={row.period_code} row={row} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Position summary strip */}
          {result.rows.length > 0 && (() => {
            const payable = result.rows.filter((r) => r.vat_position === "PAYABLE").length;
            const refundable = result.rows.filter((r) => r.vat_position === "REFUNDABLE").length;
            const unfiled = result.rows.filter((r) => r.status === "UNFILED").length;
            return (
              <div className="bg-gray-900/80 border-t border-gray-800 px-4 py-2 flex flex-wrap gap-6 text-xs text-gray-400">
                <span>Payable periods: <span className="text-red-400 font-medium">{payable}</span></span>
                <span>Refundable periods: <span className="text-blue-400 font-medium">{refundable}</span></span>
                <span>Unfiled: <span className="text-amber-400 font-medium">{unfiled}</span></span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

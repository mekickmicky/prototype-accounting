"use client";

import React, { useState, useCallback } from "react";
import { Download, Loader2, Play, AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

type BranchFilter = "TL" | "EK" | "RAMA9" | "ALL";

interface CashPositionRow {
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
  bank_name: string;
  account_number: string | null;
  gl_account_code: string;
  opening_balance: string;
  total_in: string;
  total_out: string;
  closing_balance: string;
  last_reconciled_date: string | null;
  unmatched_count: number;
}

interface CashPositionTotals {
  opening_balance: string;
  total_in: string;
  total_out: string;
  closing_balance: string;
}

interface CashPositionResult {
  as_of: string;
  period_from: string;
  branch: BranchFilter | "ALL";
  rows: CashPositionRow[];
  totals: CashPositionTotals;
  receivables: string;
  payables: string;
  projected_net_cash: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayBangkok(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmt(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  if (num < 0) return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(value: string): { text: string; cls: string } {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return { text: "—", cls: "text-gray-500" };
  if (num < 0) return { text: `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`, cls: "text-red-400" };
  return { text: num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), cls: "text-green-400" };
}

async function triggerExport(asOf: string, branch: string, format: "csv" | "xlsx" | "pdf") {
  const params = new URLSearchParams({ as_of: asOf, branch, format });
  const url = `${API_BASE}/api/v1/reports/cash-position?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cash-position-${asOf}-${branch}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Account row ───────────────────────────────────────────────────────────────

function AccountRow({ row, idx }: { row: CashPositionRow; idx: number }) {
  const closing = fmtSigned(row.closing_balance);
  return (
    <tr className={`border-b border-gray-800 hover:bg-gray-800/40 transition-colors text-sm ${idx % 2 === 1 ? "bg-gray-900/30" : ""}`}>
      <td className="py-2.5 px-3 font-mono text-gray-400 text-xs">{row.bank_account_code}</td>
      <td className="py-2.5 px-3 text-white font-medium">{row.bank_account_name}</td>
      <td className="py-2.5 px-3 text-gray-400">{row.bank_name}</td>
      <td className="py-2.5 px-3 text-gray-400 font-mono text-xs">{row.account_number ?? "—"}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-gray-300">{fmt(row.opening_balance)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-green-400">{fmt(row.total_in)}</td>
      <td className="py-2.5 px-3 text-right tabular-nums text-red-400">{fmt(row.total_out)}</td>
      <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${closing.cls}`}>{closing.text}</td>
      <td className="py-2.5 px-3 text-center text-xs text-gray-400">{row.last_reconciled_date ?? "—"}</td>
      <td className="py-2.5 px-3 text-center">
        {row.unmatched_count > 0 ? (
          <span className="inline-flex items-center gap-1 text-amber-400 text-xs">
            <AlertTriangle className="w-3 h-3" />
            {row.unmatched_count}
          </span>
        ) : (
          <span className="text-green-600">
            <CheckCircle2 className="w-3.5 h-3.5 inline" />
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CashPositionPage() {
  const [asOf, setAsOf] = useState(todayBangkok());
  const [branch, setBranch] = useState<string>("ALL");
  const [result, setResult] = useState<CashPositionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ as_of: asOf, branch, format: "json" });
      const url = `${API_BASE}/api/v1/reports/cash-position?${params}`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Failed to load");
      setResult((body as { data: CashPositionResult }).data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [asOf, branch]);

  const doExport = useCallback(async (format: "csv" | "xlsx" | "pdf") => {
    setExporting(format);
    try {
      await triggerExport(asOf, branch, format);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [asOf, branch]);

  const projected = result ? fmtSigned(result.projected_net_cash) : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Cash Position / ฐานะเงินสด" />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">As of Date</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="h-8 rounded border border-gray-700 bg-gray-800 px-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Branch</label>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="h-8 rounded border border-gray-700 bg-gray-800 px-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
          >
            <option value="ALL">All Branches</option>
            <option value="TL">Thonglor (TL)</option>
            <option value="EK">Ekkamai (EK)</option>
            <option value="RAMA9">Rama 9</option>
          </select>
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
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Opening Balance", value: result.totals.opening_balance, cls: "text-gray-300" },
              { label: "Total In", value: result.totals.total_in, cls: "text-green-400" },
              { label: "Total Out", value: result.totals.total_out, cls: "text-red-400" },
              { label: "Closing Balance", value: result.totals.closing_balance, cls: fmtSigned(result.totals.closing_balance).cls },
            ].map((card) => (
              <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <div className="text-xs text-gray-500 mb-1">{card.label}</div>
                <div className={`text-lg font-bold tabular-nums ${card.cls}`}>{fmt(card.value)}</div>
              </div>
            ))}
          </div>

          {/* Main table */}
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                As of {result.as_of.slice(0, 10)} · {result.rows.length} account{result.rows.length !== 1 ? "s" : ""}
                {result.branch !== "ALL" && ` · Branch: ${result.branch}`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-xs">
                    <th className="py-2 px-3 text-left font-semibold">Code</th>
                    <th className="py-2 px-3 text-left font-semibold">Account Name</th>
                    <th className="py-2 px-3 text-left font-semibold">Bank</th>
                    <th className="py-2 px-3 text-left font-semibold">Account No.</th>
                    <th className="py-2 px-3 text-right font-semibold">Opening</th>
                    <th className="py-2 px-3 text-right font-semibold">Total In</th>
                    <th className="py-2 px-3 text-right font-semibold">Total Out</th>
                    <th className="py-2 px-3 text-right font-semibold">Closing</th>
                    <th className="py-2 px-3 text-center font-semibold">Last Recon</th>
                    <th className="py-2 px-3 text-center font-semibold">Unmatched</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-gray-500">
                        No bank accounts found.
                      </td>
                    </tr>
                  ) : (
                    result.rows.map((row, idx) => (
                      <AccountRow key={row.bank_account_id} row={row} idx={idx} />
                    ))
                  )}
                </tbody>
                {result.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-800/60 border-t border-gray-700 font-semibold text-white text-sm">
                      <td className="py-2.5 px-3" colSpan={4}>TOTAL</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{fmt(result.totals.opening_balance)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-green-400">{fmt(result.totals.total_in)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-red-400">{fmt(result.totals.total_out)}</td>
                      <td className={`py-2.5 px-3 text-right tabular-nums ${fmtSigned(result.totals.closing_balance).cls}`}>
                        {fmtSigned(result.totals.closing_balance).text}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Projected cash panel */}
          <div className="rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Projected Net Cash / เงินสดสุทธิคาดการณ์
            </h3>
            <div className="space-y-2 max-w-sm">
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">Cash & Bank (closing)</span>
                <span className="tabular-nums text-white font-medium">{fmt(result.totals.closing_balance)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">+ Receivables (will become cash)</span>
                <span className="tabular-nums text-green-400">{fmt(result.receivables)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-300">− Payables (will reduce cash)</span>
                <span className="tabular-nums text-red-400">({fmt(result.payables)})</span>
              </div>
              <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between text-sm font-semibold">
                <span className="text-white">Projected Net Cash</span>
                <span className={`tabular-nums text-base ${projected?.cls ?? ""}`}>{projected?.text}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

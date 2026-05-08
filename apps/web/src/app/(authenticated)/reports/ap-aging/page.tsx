"use client";

import React, { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Play } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { BranchPicker } from "@/components/ui/branch-picker";
import { DatePickerTH } from "@/components/ui/date-picker-th";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgingBill {
  id: string;
  bill_no: string;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  balance: string;
  days_overdue: number;
  bucket: string;
}

interface AgingVendorRow {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
  bills: AgingBill[];
}

interface AgingTotals {
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  total: string;
}

interface ApAgingResult {
  as_of: string;
  branch: string;
  rows: AgingVendorRow[];
  totals: AgingTotals;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayBangkok(): string {
  const now = new Date();
  const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = bkk.getFullYear();
  const m = String(bkk.getMonth() + 1).padStart(2, "0");
  const d = String(bkk.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fmt(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isZero(v: string): boolean {
  return parseFloat(v) === 0;
}

// ── Export helper ─────────────────────────────────────────────────────────────

async function triggerExport(asOf: string, branch: string, format: "csv" | "xlsx" | "pdf") {
  const url = `${API_BASE}/api/v1/reports/ap-aging?as_of=${asOf}&branch=${branch}&format=${format}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ap-aging-${asOf}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Bill drill-down row ───────────────────────────────────────────────────────

function BillRow({ bill }: { bill: AgingBill }) {
  const overdue = bill.days_overdue > 0;
  return (
    <tr className="text-xs text-gray-400 hover:text-gray-200">
      <td className="pl-12 py-1">{bill.bill_no || "—"}</td>
      <td className="py-1">{bill.issue_date}</td>
      <td className={`py-1 ${overdue ? "text-rose-400" : ""}`}>{bill.due_date}</td>
      <td className={`py-1 text-right ${overdue ? "text-rose-400" : ""}`}>
        {overdue ? `${bill.days_overdue}d` : "—"}
      </td>
      <td className="py-1 text-right">{fmt(bill.total)}</td>
      <td className="py-1 text-right">{fmt(bill.paid_amount)}</td>
      <td className="py-1 text-right font-medium text-white">{fmt(bill.balance)}</td>
    </tr>
  );
}

// ── Vendor row ────────────────────────────────────────────────────────────────

function VendorRow({ row }: { row: AgingVendorRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <td className="py-2 px-3 text-sm">
          <span className="inline-flex items-center gap-1">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-500 flex-shrink-0" />
            )}
            <span className="text-gray-400 mr-1">{row.vendor_code}</span>
            <span className="text-white">{row.vendor_name}</span>
            <span className="text-gray-600 text-xs ml-1">({row.bills.length})</span>
          </span>
        </td>
        <td className={`py-2 px-3 text-sm text-right ${isZero(row.current) ? "text-gray-600" : "text-white"}`}>
          {fmt(row.current)}
        </td>
        <td className={`py-2 px-3 text-sm text-right ${isZero(row.b1_30) ? "text-gray-600" : "text-amber-300"}`}>
          {fmt(row.b1_30)}
        </td>
        <td className={`py-2 px-3 text-sm text-right ${isZero(row.b31_60) ? "text-gray-600" : "text-orange-400"}`}>
          {fmt(row.b31_60)}
        </td>
        <td className={`py-2 px-3 text-sm text-right ${isZero(row.b61_90) ? "text-gray-600" : "text-red-400"}`}>
          {fmt(row.b61_90)}
        </td>
        <td className={`py-2 px-3 text-sm text-right ${isZero(row.b90plus) ? "text-gray-600" : "text-red-600 font-semibold"}`}>
          {fmt(row.b90plus)}
        </td>
        <td className="py-2 px-3 text-sm text-right font-semibold text-white">
          {fmt(row.total)}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} className="bg-gray-900/50 p-0">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="pl-12 py-1 text-left font-normal">Bill No</th>
                  <th className="py-1 text-left font-normal">Issue Date</th>
                  <th className="py-1 text-left font-normal">Due Date</th>
                  <th className="py-1 text-right font-normal">Days Overdue</th>
                  <th className="py-1 text-right font-normal">Total</th>
                  <th className="py-1 text-right font-normal">Paid</th>
                  <th className="py-1 text-right font-normal">Balance</th>
                </tr>
              </thead>
              <tbody>
                {row.bills.map(bill => (
                  <BillRow key={bill.id} bill={bill} />
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ApAgingPage() {
  const [asOf, setAsOf] = useState(getTodayBangkok());
  const [branch, setBranch] = useState("ALL");
  const [result, setResult] = useState<ApAgingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE}/api/v1/reports/ap-aging?as_of=${asOf}&branch=${branch}&format=json`;
      const res = await fetch(url, { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Failed to load");
      setResult(body.data);
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

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="AP Aging / รายงานอายุเจ้าหนี้" />

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs text-gray-400">As of Date</label>
          <DatePickerTH value={asOf} onChange={setAsOf} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-gray-400">Branch</label>
          <BranchPicker value={branch} onChange={setBranch} includeAll />
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
            {(["csv", "xlsx", "pdf"] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => doExport(fmt)}
                disabled={exporting !== null}
                className="inline-flex items-center gap-1 px-3 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-xs rounded-md transition-colors disabled:opacity-50"
              >
                {exporting === fmt ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Download className="w-3 h-3" />
                )}
                {fmt.toUpperCase()}
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
          <div className="bg-gray-900 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              As of {result.as_of.slice(0, 10)}
              {result.branch !== "ALL" ? ` · Branch: ${result.branch}` : ""}
              · {result.rows.length} vendor{result.rows.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-300 text-xs">
                  <th className="py-2 px-3 text-left font-semibold">Vendor</th>
                  <th className="py-2 px-3 text-right font-semibold">Current</th>
                  <th className="py-2 px-3 text-right font-semibold">1-30 Days</th>
                  <th className="py-2 px-3 text-right font-semibold">31-60 Days</th>
                  <th className="py-2 px-3 text-right font-semibold">61-90 Days</th>
                  <th className="py-2 px-3 text-right font-semibold">90+ Days</th>
                  <th className="py-2 px-3 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500">
                      No open AP as of this date.
                    </td>
                  </tr>
                ) : (
                  result.rows.map(row => <VendorRow key={row.vendor_id} row={row} />)
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-600 bg-gray-800/70 font-semibold text-white">
                  <td className="py-2 px-3 text-sm">TOTAL</td>
                  <td className="py-2 px-3 text-sm text-right">{fmt(result.totals.current)}</td>
                  <td className="py-2 px-3 text-sm text-right text-amber-300">{fmt(result.totals.b1_30)}</td>
                  <td className="py-2 px-3 text-sm text-right text-orange-400">{fmt(result.totals.b31_60)}</td>
                  <td className="py-2 px-3 text-sm text-right text-red-400">{fmt(result.totals.b61_90)}</td>
                  <td className="py-2 px-3 text-sm text-right text-red-600">{fmt(result.totals.b90plus)}</td>
                  <td className="py-2 px-3 text-sm text-right">{fmt(result.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

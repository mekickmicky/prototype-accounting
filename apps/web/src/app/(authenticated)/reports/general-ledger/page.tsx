"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Play, Loader2, Download } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AccountPicker, type AccountOption } from "@/components/ui/account-picker";
import { BranchPicker } from "@/components/ui/branch-picker";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GLRow {
  entry_date: string;
  je_no: string;
  je_id: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
  source_type: string;
  source_id: string | null;
  source_doc_link: string;
}

interface GLResult {
  account_code: string;
  name_th: string;
  name_en: string;
  account_type: string;
  period_from: string | null;
  period_to: string | null;
  branch: string;
  opening_balance: string;
  rows: GLRow[];
  totals: { debit: string; credit: string };
  closing_balance: string;
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
  const total = (y ?? 2000) * 12 + ((m ?? 1) - 1) - n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function formatMoney(value: string | undefined | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  if (num === 0) return "—";
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMoneyBalance(value: string | undefined | null): string {
  if (!value) return "0.00";
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Asia/Bangkok",
  });
}

function formatPeriodLabel(period: string | null): string {
  if (!period) return "";
  const [y, m] = period.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[(parseInt(m ?? "1") - 1)] ?? "";
  return `${month} ${y}`;
}

async function triggerExport(
  account: string,
  periodFrom: string,
  periodTo: string,
  branch: string,
  format: "csv" | "xlsx" | "pdf"
) {
  const params = new URLSearchParams({ account, period_from: periodFrom, period_to: periodTo, branch, format });
  const url = `${API_BASE}/api/v1/reports/general-ledger?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `general-ledger-${account}-${periodFrom}_${periodTo}-${branch}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Filter bar ────────────────────────────────────────────────────────────────

const inputCls = cn(
  "h-8 rounded border border-gray-700 bg-gray-800",
  "px-2.5 text-sm text-white",
  "focus:outline-none focus:border-rose-500",
  "transition-[border-color] duration-[150ms]"
);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </div>
  );
}

// ── Export buttons ────────────────────────────────────────────────────────────

function ExportButtons({
  onExport,
  exporting,
}: {
  onExport: (format: "csv" | "xlsx" | "pdf") => void;
  exporting: string | null;
}) {
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GeneralLedgerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPeriod = currentPeriodBangkok();

  // Filter state
  const [account, setAccount] = useState<string | null>(searchParams.get("account") ?? null);
  const [periodFrom, setPeriodFrom] = useState(
    searchParams.get("period_from") ?? subtractMonths(currentPeriod, 0)
  );
  const [periodTo, setPeriodTo] = useState(
    searchParams.get("period_to") ?? currentPeriod
  );
  const [branch, setBranch] = useState(searchParams.get("branch") ?? "ALL");

  // Data state
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [result, setResult] = useState<GLResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<{
    account: string;
    periodFrom: string;
    periodTo: string;
    branch: string;
  } | null>(null);

  const didAutoRun = useRef(false);

  // Load accounts for picker
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/accounts?limit=500`, { credentials: "include" })
      .then((r) => r.json())
      .then((body: unknown) => {
        const data = (body as { data?: AccountOption[] })?.data;
        if (Array.isArray(data)) setAccounts(data);
      })
      .catch(() => {});
  }, []);

  const run = useCallback(
    async (
      acct: string | null,
      pFrom: string,
      pTo: string,
      br: string
    ) => {
      if (!acct) {
        setError("Please select an account.");
        return;
      }
      setLoading(true);
      setError(null);
      setLastParams({ account: acct, periodFrom: pFrom, periodTo: pTo, branch: br });

      // Sync URL
      const p = new URLSearchParams({ account: acct, period_from: pFrom, period_to: pTo, branch: br });
      router.replace(`/reports/general-ledger?${p.toString()}`, { scroll: false });

      try {
        const qp = new URLSearchParams({
          account: acct,
          period_from: pFrom,
          period_to: pTo,
          branch: br,
          format: "json",
        });
        const res = await fetch(`${API_BASE}/api/v1/reports/general-ledger?${qp}`, {
          credentials: "include",
        });
        const body = await res.json();
        if (!res.ok) {
          throw new Error(
            (body as { error?: { message?: string } })?.error?.message ?? "Failed to load"
          );
        }
        setResult((body as { data: GLResult }).data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Auto-run when URL already has an account param
  useEffect(() => {
    if (didAutoRun.current) return;
    const acct = searchParams.get("account");
    if (acct) {
      didAutoRun.current = true;
      const pFrom = searchParams.get("period_from") ?? subtractMonths(currentPeriod, 0);
      const pTo = searchParams.get("period_to") ?? currentPeriod;
      const br = searchParams.get("branch") ?? "ALL";
      run(acct, pFrom, pTo, br);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      if (!lastParams) return;
      setExporting(format);
      try {
        await triggerExport(
          lastParams.account,
          lastParams.periodFrom,
          lastParams.periodTo,
          lastParams.branch,
          format
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(null);
      }
    },
    [lastParams]
  );

  const periodLabel = result
    ? `${formatPeriodLabel(result.period_from)} – ${formatPeriodLabel(result.period_to)}`
    : null;

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="General Ledger / รายละเอียดบัญชีแยกประเภท" />

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 bg-gray-900 border border-gray-800 rounded-lg p-4">
        <Field label="Account / บัญชี">
          <div className="w-72">
            <AccountPicker
              value={account}
              onChange={setAccount}
              accounts={accounts}
              placeholder="Select account..."
            />
          </div>
        </Field>

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

        <Field label="Branch">
          <BranchPicker value={branch} onChange={setBranch} allowAll />
        </Field>

        <button
          onClick={() => run(account, periodFrom, periodTo, branch)}
          disabled={loading}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2",
            "bg-rose-600 hover:bg-rose-500 disabled:opacity-50",
            "text-white text-sm font-medium rounded-md transition-colors"
          )}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Report
        </button>

        {result && (
          <div className="ml-auto">
            <ExportButtons onExport={doExport} exporting={exporting} />
          </div>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────────────────── */}
      {result && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          {/* Report header strip */}
          <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm text-gray-400">{result.account_code}</span>
                <span className="text-sm font-semibold text-white">{result.name_th}</span>
                {result.name_en && result.name_en !== result.name_th && (
                  <span className="text-xs text-gray-500">· {result.name_en}</span>
                )}
                <span className="text-xs text-gray-600 uppercase tracking-wide">
                  {result.account_type}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                {periodLabel && <span>Period: {periodLabel}</span>}
                <span>Branch: {result.branch}</span>
                <span>
                  Opening:{" "}
                  <span className="font-mono text-gray-300">
                    {formatMoneyBalance(result.opening_balance)}
                  </span>
                </span>
              </div>
            </div>
            <ExportButtons onExport={doExport} exporting={exporting} />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs">
                  <th className="py-2 px-4 text-left font-medium w-24">Date</th>
                  <th className="py-2 px-4 text-left font-medium w-36">Doc No</th>
                  <th className="py-2 px-4 text-left font-medium">Description</th>
                  <th className="py-2 px-4 text-right font-medium w-36 tabular-nums">Debit</th>
                  <th className="py-2 px-4 text-right font-medium w-36 tabular-nums">Credit</th>
                  <th className="py-2 px-4 text-right font-medium w-40 tabular-nums">Balance</th>
                </tr>
              </thead>

              <tbody>
                {/* Opening balance row */}
                <tr className="border-b border-gray-800 bg-gray-900/60">
                  <td className="py-2 px-4 text-xs text-gray-500" colSpan={2} />
                  <td className="py-2 px-4 text-xs text-gray-500 italic">Opening Balance</td>
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4" />
                  <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-gray-300">
                    {formatMoneyBalance(result.opening_balance)}
                  </td>
                </tr>

                {/* Transaction rows */}
                {result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-gray-500">
                      No transactions in this period.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, idx) => (
                    <tr
                      key={`${row.je_id}-${idx}`}
                      className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="py-2 px-4 text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(row.entry_date)}
                      </td>
                      <td className="py-2 px-4 whitespace-nowrap">
                        <Link
                          href={`/gl/journal-entries/${row.je_id}`}
                          className="font-mono text-xs text-rose-400 hover:text-rose-300 hover:underline"
                        >
                          {row.je_no}
                        </Link>
                      </td>
                      <td className="py-2 px-4 text-sm text-gray-200">
                        {row.source_doc_link && row.source_doc_link !== `/gl/journal-entries/${row.je_id}` ? (
                          <Link
                            href={row.source_doc_link}
                            className="hover:text-white hover:underline"
                          >
                            {row.description}
                          </Link>
                        ) : (
                          row.description
                        )}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-emerald-400">
                        {parseFloat(row.debit) > 0 ? formatMoney(row.debit) : ""}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-red-400">
                        {parseFloat(row.credit) > 0 ? formatMoney(row.credit) : ""}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-white">
                        {formatMoneyBalance(row.running_balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Footer: totals + closing */}
              <tfoot>
                <tr className="border-t-2 border-gray-700 bg-gray-900">
                  <td className="py-2 px-4" colSpan={2} />
                  <td className="py-2 px-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Period Total
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-mono text-sm font-semibold text-emerald-400">
                    {formatMoney(result.totals.debit)}
                  </td>
                  <td className="py-2 px-4 text-right tabular-nums font-mono text-sm font-semibold text-red-400">
                    {formatMoney(result.totals.credit)}
                  </td>
                  <td className="py-2 px-4" />
                </tr>
                <tr className="border-t border-gray-700 bg-gray-900/80">
                  <td className="py-2.5 px-4" colSpan={2} />
                  <td className="py-2.5 px-4 text-xs font-bold text-gray-300 uppercase tracking-wide">
                    Closing Balance
                  </td>
                  <td className="py-2.5 px-4" colSpan={2} />
                  <td className="py-2.5 px-4 text-right tabular-nums font-mono text-sm font-bold text-white">
                    {formatMoneyBalance(result.closing_balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {!result && !loading && !error && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 py-16 text-center text-gray-500 text-sm">
          Select an account and click{" "}
          <span className="text-white font-medium">Run Report</span> to view the General Ledger.
        </div>
      )}
    </div>
  );
}

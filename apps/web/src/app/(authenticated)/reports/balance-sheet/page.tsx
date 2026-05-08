"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ReportFilterBar, ExportButtons } from "@/components/reports/filter-bar";
import type { ReportFilterParams } from "@/components/reports/filter-bar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BSRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

interface BSSection {
  rows: BSRow[];
  total: string;
  comparative_total?: string;
  pct_change?: string;
}

interface BSResult {
  as_of: string;
  branch: string;
  assets: { current: BSSection; non_current: BSSection; total: string };
  liabilities: { current: BSSection; non_current: BSSection; total: string };
  equity: { items: BSSection; total: string };
  total_l_and_e: string;
  net_income_ytd: string;
  balanced: boolean;
  imbalance?: string;
  comparative_as_of?: string;
  prior?: BSResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayBangkok(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatMoney(value: string | undefined | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
  }
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

function pctColor(pct: string | undefined): string {
  if (!pct) return "text-gray-500";
  const n = parseFloat(pct);
  if (isNaN(n) || n === 0) return "text-gray-500";
  return n > 0 ? "text-emerald-400" : "text-red-400";
}

function PctBadge({ pct }: { pct?: string }) {
  if (!pct) return <span className="tabular-nums text-gray-500 font-mono text-xs">—</span>;
  const n = parseFloat(pct);
  if (isNaN(n)) return <span className="tabular-nums text-gray-500 font-mono text-xs">—</span>;
  const sign = n > 0 ? "+" : "";
  return (
    <span className={`tabular-nums font-mono text-xs ${pctColor(pct)}`}>
      {sign}{n.toFixed(1)}%
    </span>
  );
}

async function triggerExport(asOf: string, branch: string, format: "csv" | "xlsx" | "pdf", comparative: boolean) {
  const params = new URLSearchParams({ as_of: asOf, branch, format, comparative: comparative ? "true" : "false" });
  const url = `${API_BASE}/api/v1/reports/balance-sheet?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } })?.error?.message ?? `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `balance-sheet-${asOf}-${branch}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Section table ─────────────────────────────────────────────────────────────

interface SectionTableProps {
  section: BSSection;
  priorSection?: BSSection;
  hasComparative: boolean;
  onAccountClick: (code: string) => void;
}

function SectionRows({ section, priorSection, hasComparative, onAccountClick }: SectionTableProps) {
  return (
    <>
      {section.rows.map((row) => {
        const priorRow = priorSection?.rows.find((r) => r.account_code === row.account_code);
        return (
          <tr
            key={row.account_code}
            onClick={() => onAccountClick(row.account_code)}
            className="border-b border-gray-800 hover:bg-gray-800/40 transition-colors cursor-pointer"
          >
            <td className="py-2 px-4 font-mono text-gray-500 text-xs w-20">{row.account_code}</td>
            <td className="py-2 px-4 text-sm text-gray-200">
              {row.name_th}
              {row.name_en && row.name_en !== row.name_th && (
                <span className="text-gray-500 text-xs ml-1.5">· {row.name_en}</span>
              )}
            </td>
            <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-white w-40">
              {formatMoney(row.amount)}
            </td>
            {hasComparative && (
              <>
                <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-gray-400 w-40">
                  {formatMoney(priorRow?.amount ?? row.comparative_amount)}
                </td>
                <td className="py-2 px-4 text-right w-20">
                  <PctBadge pct={row.pct_change} />
                </td>
              </>
            )}
          </tr>
        );
      })}
    </>
  );
}

interface SubtotalRowProps {
  label: string;
  total: string;
  comparativeTotal?: string;
  pct_change?: string;
  hasComparative: boolean;
  highlighted?: boolean;
}

function SubtotalRow({ label, total, comparativeTotal, pct_change, hasComparative, highlighted }: SubtotalRowProps) {
  return (
    <tr
      className={
        highlighted
          ? "border-t-2 border-rose-700 border-b border-gray-800 bg-gray-900"
          : "border-t border-gray-700 border-b border-gray-800 bg-gray-900/60"
      }
    >
      <td className="py-2 px-4 w-20" />
      <td
        className={`py-2 px-4 text-sm font-semibold ${highlighted ? "text-rose-300" : "text-gray-300"}`}
      >
        {label}
      </td>
      <td
        className={`py-2 px-4 text-right tabular-nums font-mono text-sm w-40 font-semibold ${highlighted ? "text-rose-300" : "text-white"}`}
      >
        {formatMoney(total)}
      </td>
      {hasComparative && (
        <>
          <td className="py-2 px-4 text-right tabular-nums font-mono text-sm text-gray-400 w-40 font-semibold">
            {formatMoney(comparativeTotal)}
          </td>
          <td className="py-2 px-4 text-right w-20">
            <PctBadge pct={pct_change} />
          </td>
        </>
      )}
    </tr>
  );
}

interface SectionHeaderProps {
  label: string;
  sub?: string;
  hasComparative: boolean;
}

function SectionHeader({ label, sub, hasComparative }: SectionHeaderProps) {
  return (
    <tr className="bg-gray-800/60 border-t-2 border-gray-700">
      <td
        colSpan={hasComparative ? 5 : 3}
        className="py-2 px-4 text-xs font-bold uppercase tracking-widest text-rose-400"
      >
        {label}
        {sub && <span className="text-gray-500 font-normal ml-2">· {sub}</span>}
      </td>
    </tr>
  );
}

interface SubSectionHeaderProps {
  label: string;
  hasComparative: boolean;
}

function SubSectionHeader({ label, hasComparative }: SubSectionHeaderProps) {
  return (
    <tr className="bg-gray-800/30">
      <td
        colSpan={hasComparative ? 5 : 3}
        className="py-1.5 px-4 text-xs font-semibold uppercase tracking-wide text-gray-400"
      >
        {label}
      </td>
    </tr>
  );
}

// ── Balance check banner ──────────────────────────────────────────────────────

function BalanceBanner({ result, hasComparative }: { result: BSResult; hasComparative: boolean }) {
  const assetsTotal = result.assets.total;
  const liaeTotal = result.total_l_and_e;

  if (!result.balanced) {
    return (
      <tr className="border-t-2 border-red-600 bg-red-950/40">
        <td colSpan={hasComparative ? 5 : 3} className="py-3 px-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">
              BALANCE SHEET NOT BALANCED — DATA INTEGRITY ISSUE
            </span>
            <span className="text-xs font-mono ml-2 text-red-300">
              Assets {formatMoney(assetsTotal)} ≠ L+E {formatMoney(liaeTotal)}
              {result.imbalance && ` (diff: ${formatMoney(result.imbalance)})`}
            </span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t-2 border-gray-600 bg-gray-900">
      <td className="py-3 px-4 w-20" />
      <td className="py-3 px-4 text-sm font-bold text-gray-200">
        <span className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          TOTAL ASSETS = TOTAL LIABILITIES + EQUITY
        </span>
      </td>
      <td className="py-3 px-4 text-right tabular-nums font-mono text-sm font-bold text-white w-40">
        {formatMoney(assetsTotal)}
      </td>
      {hasComparative && (
        <>
          <td className="py-3 px-4 text-right tabular-nums font-mono text-sm font-bold text-gray-400 w-40">
            {result.prior ? formatMoney(result.prior.total_l_and_e) : "—"}
          </td>
          <td className="py-3 px-4 w-20" />
        </>
      )}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BalanceSheetPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<BSResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<{ asOf: string; branch: string; comparative: boolean } | null>(null);

  const hasComparative = Boolean(result?.prior);

  const run = useCallback(async (params: ReportFilterParams) => {
    setLoading(true);
    setError(null);
    setLastParams({ asOf: params.asOf, branch: params.branch, comparative: params.comparative });
    try {
      const qp = new URLSearchParams({
        as_of: params.asOf,
        branch: params.branch,
        comparative: params.comparative ? "true" : "false",
        format: "json",
      });
      const res = await fetch(`${API_BASE}/api/v1/reports/balance-sheet?${qp}`, { credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Failed to load");
      setResult((body as { data: BSResult }).data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run when URL already has params (e.g., after drill-back navigation).
  useEffect(() => {
    const asOf = searchParams.get("as_of");
    if (asOf) {
      const branch = searchParams.get("branch") ?? "ALL";
      const comparative = searchParams.get("comparative") === "1";
      run({ asOf, branch, comparative, periodFrom: "", periodTo: "", showZero: false });
    }
    // Run only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      if (!lastParams) return;
      setExporting(format);
      try {
        await triggerExport(lastParams.asOf, lastParams.branch, format, lastParams.comparative);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(null);
      }
    },
    [lastParams],
  );

  const drillToGL = useCallback(
    (code: string) => {
      if (!lastParams) return;
      const year = lastParams.asOf.substring(0, 4);
      const month = lastParams.asOf.substring(5, 7);
      const period = `${year}-${month}`;
      const params = new URLSearchParams({
        account: code,
        period_from: `${year}-01`,
        period_to: period,
        branch: lastParams.branch,
      });
      router.push(`/reports/general-ledger?${params}`);
    },
    [router, lastParams],
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  const defaultAsOf = todayBangkok();
  const currentLabel = result ? `As of ${formatDate(result.as_of)}` : "Current";
  const priorLabel = result?.prior
    ? `As of ${formatDate(result.comparative_as_of ?? result.prior.as_of)}`
    : "Prior Year";

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Balance Sheet / งบฐานะการเงิน" />

      <ReportFilterBar
        mode="snapshot"
        showComparativeToggle
        onRun={run}
        onExport={doExport}
        exporting={exporting}
        showExports={result !== null}
        loading={loading}
      />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          {/* Report header strip */}
          <div className="bg-gray-900 border-b border-gray-800 px-4 py-2.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white">
                {currentLabel}
                {result.prior && (
                  <span className="text-gray-400 font-normal"> · compared with {priorLabel}</span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                Branch: {result.branch}
                {!result.balanced && (
                  <span className="ml-2 text-red-400 font-medium">⚠ NOT BALANCED</span>
                )}
              </p>
            </div>
            {result && (
              <ExportButtons onExport={doExport} exporting={exporting} />
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              {/* Column headers */}
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs">
                  <th className="py-2 px-4 text-left font-medium w-20">Code</th>
                  <th className="py-2 px-4 text-left font-medium">Account</th>
                  <th className="py-2 px-4 text-right font-medium w-40">{currentLabel}</th>
                  {hasComparative && (
                    <>
                      <th className="py-2 px-4 text-right font-medium w-40">{priorLabel}</th>
                      <th className="py-2 px-4 text-right font-medium w-20">Change %</th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {/* ── ASSETS ─────────────────────────────────────────────── */}
                <SectionHeader label="Assets" sub="สินทรัพย์" hasComparative={hasComparative} />

                <SubSectionHeader label="Current Assets / สินทรัพย์หมุนเวียน" hasComparative={hasComparative} />
                <SectionRows
                  section={result.assets.current}
                  priorSection={result.prior?.assets.current}
                  hasComparative={hasComparative}
                  onAccountClick={drillToGL}
                />
                <SubtotalRow
                  label="Total Current Assets / รวมสินทรัพย์หมุนเวียน"
                  total={result.assets.current.total}
                  comparativeTotal={result.prior?.assets.current.total ?? result.assets.current.comparative_total}
                  pct_change={result.assets.current.pct_change}
                  hasComparative={hasComparative}
                />

                <SubSectionHeader label="Non-current Assets / สินทรัพย์ไม่หมุนเวียน" hasComparative={hasComparative} />
                <SectionRows
                  section={result.assets.non_current}
                  priorSection={result.prior?.assets.non_current}
                  hasComparative={hasComparative}
                  onAccountClick={drillToGL}
                />
                <SubtotalRow
                  label="Total Non-current Assets / รวมสินทรัพย์ไม่หมุนเวียน"
                  total={result.assets.non_current.total}
                  comparativeTotal={result.prior?.assets.non_current.total ?? result.assets.non_current.comparative_total}
                  pct_change={result.assets.non_current.pct_change}
                  hasComparative={hasComparative}
                />

                <SubtotalRow
                  label="TOTAL ASSETS / รวมสินทรัพย์ทั้งหมด"
                  total={result.assets.total}
                  comparativeTotal={result.prior?.assets.total}
                  hasComparative={hasComparative}
                  highlighted
                />

                {/* ── LIABILITIES ─────────────────────────────────────────── */}
                <SectionHeader label="Liabilities" sub="หนี้สิน" hasComparative={hasComparative} />

                <SubSectionHeader label="Current Liabilities / หนี้สินหมุนเวียน" hasComparative={hasComparative} />
                <SectionRows
                  section={result.liabilities.current}
                  priorSection={result.prior?.liabilities.current}
                  hasComparative={hasComparative}
                  onAccountClick={drillToGL}
                />
                <SubtotalRow
                  label="Total Current Liabilities / รวมหนี้สินหมุนเวียน"
                  total={result.liabilities.current.total}
                  comparativeTotal={result.prior?.liabilities.current.total ?? result.liabilities.current.comparative_total}
                  pct_change={result.liabilities.current.pct_change}
                  hasComparative={hasComparative}
                />

                {result.liabilities.non_current.rows.length > 0 && (
                  <>
                    <SubSectionHeader label="Non-current Liabilities / หนี้สินไม่หมุนเวียน" hasComparative={hasComparative} />
                    <SectionRows
                      section={result.liabilities.non_current}
                      priorSection={result.prior?.liabilities.non_current}
                      hasComparative={hasComparative}
                      onAccountClick={drillToGL}
                    />
                    <SubtotalRow
                      label="Total Non-current Liabilities / รวมหนี้สินไม่หมุนเวียน"
                      total={result.liabilities.non_current.total}
                      comparativeTotal={result.prior?.liabilities.non_current.total ?? result.liabilities.non_current.comparative_total}
                      pct_change={result.liabilities.non_current.pct_change}
                      hasComparative={hasComparative}
                    />
                  </>
                )}

                <SubtotalRow
                  label="TOTAL LIABILITIES / รวมหนี้สินทั้งหมด"
                  total={result.liabilities.total}
                  comparativeTotal={result.prior?.liabilities.total}
                  hasComparative={hasComparative}
                  highlighted
                />

                {/* ── EQUITY ──────────────────────────────────────────────── */}
                <SectionHeader label="Equity" sub="ส่วนของผู้ถือหุ้น" hasComparative={hasComparative} />

                <SectionRows
                  section={result.equity.items}
                  priorSection={result.prior?.equity.items}
                  hasComparative={hasComparative}
                  onAccountClick={drillToGL}
                />

                <SubtotalRow
                  label="TOTAL EQUITY / รวมส่วนของผู้ถือหุ้น"
                  total={result.equity.total}
                  comparativeTotal={result.prior?.equity.total}
                  hasComparative={hasComparative}
                  highlighted
                />

                {/* ── TOTAL LIAB + EQUITY ─────────────────────────────────── */}
                <tr className="bg-gray-900/80">
                  <td className="py-3 px-4 w-20" />
                  <td className="py-3 px-4 text-sm font-bold text-gray-200">
                    TOTAL LIABILITIES + EQUITY / รวมหนี้สินและส่วนของผู้ถือหุ้น
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-mono text-sm font-bold text-white w-40">
                    {formatMoney(result.total_l_and_e)}
                  </td>
                  {hasComparative && (
                    <>
                      <td className="py-3 px-4 text-right tabular-nums font-mono text-sm font-bold text-gray-400 w-40">
                        {result.prior ? formatMoney(result.prior.total_l_and_e) : "—"}
                      </td>
                      <td className="py-3 px-4 w-20" />
                    </>
                  )}
                </tr>

                {/* ── A = L + E invariant line ─────────────────────────────── */}
                <BalanceBanner result={result} hasComparative={hasComparative} />
              </tbody>
            </table>
          </div>

          {/* Net income note */}
          <div className="bg-gray-900 border-t border-gray-800 px-4 py-2 text-xs text-gray-500">
            Current year earnings (31030) computed on-the-fly = YTD net income as of {formatDate(result.as_of)}: {formatMoney(result.net_income_ytd)}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/40 py-16 text-center text-gray-500 text-sm">
          Select a date and click <span className="text-white font-medium">Run Report</span> to generate the Balance Sheet.
        </div>
      )}
    </div>
  );
}

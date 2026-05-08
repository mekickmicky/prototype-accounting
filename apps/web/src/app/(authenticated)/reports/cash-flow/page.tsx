"use client";

import React, { useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  ReportFilterBar,
  type ReportFilterParams,
} from "@/components/reports/filter-bar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CFRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
}

interface CFSection {
  title_th: string;
  title_en: string;
  rows: CFRow[];
  total: string;
}

interface CFOperating {
  net_income: string;
  depreciation: CFSection;
  working_capital: CFSection;
  other: CFSection;
  total: string;
}

interface CFResult {
  start_date: string;
  end_date: string;
  branch: string;
  operating: CFOperating;
  investing: CFSection;
  financing: CFSection;
  net_change: string;
  cash_begin: string;
  cash_end: string;
  cash_delta: string;
  reconciled: boolean;
  reconciliation_diff?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  const abs = Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `(${abs})` : abs;
}

function amountColor(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "text-gray-500";
  return num < 0 ? "text-red-400" : "text-white";
}

async function triggerExport(
  periodFrom: string,
  periodTo: string,
  branch: string,
  format: "csv" | "xlsx" | "pdf"
) {
  const params = new URLSearchParams({
    period_from: periodFrom,
    period_to: periodTo,
    branch,
    format,
  });
  const url = `${API_BASE}/api/v1/reports/cash-flow?${params}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: { message?: string } })?.error?.message ??
        `Export failed: ${res.status}`
    );
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cash-flow-${periodFrom}_${periodTo}-${branch}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionRows({
  section,
  indent = false,
}: {
  section: CFSection;
  indent?: boolean;
}) {
  if (section.rows.length === 0) return null;
  return (
    <>
      {section.rows.map((row) => (
        <tr
          key={row.account_code}
          className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors"
        >
          <td className="py-2 px-3 font-mono text-gray-400 text-xs">{row.account_code}</td>
          <td className={`py-2 px-3 text-gray-300 text-sm ${indent ? "pl-10" : "pl-6"}`}>
            {row.name_en}
            {row.name_th && row.name_th !== row.name_en && (
              <span className="ml-2 text-xs text-gray-500">{row.name_th}</span>
            )}
          </td>
          <td className={`py-2 px-3 text-right tabular-nums text-sm ${amountColor(row.amount)}`}>
            {fmt(row.amount)}
          </td>
        </tr>
      ))}
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr className="bg-gray-800/80">
      <td colSpan={3} className="py-2 px-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">
        {label}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <tr className={`border-t border-gray-600 bg-gray-800/40 ${bold ? "font-bold" : "font-semibold"}`}>
      <td className="py-2 px-3" />
      <td className={`py-2 px-3 ${bold ? "text-white text-sm" : "text-gray-200 text-sm"} pl-6`}>
        {label}
      </td>
      <td className={`py-2 px-3 text-right tabular-nums text-sm ${amountColor(value)} ${bold ? "font-bold" : ""}`}>
        {fmt(value)}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const bg = highlight ? "bg-gray-700/60 border-y-2 border-gray-500" : "bg-gray-800/60 border-y border-gray-600";
  return (
    <tr className={bg}>
      <td className="py-3 px-3" />
      <td className={`py-3 px-3 font-bold ${highlight ? "text-white text-base" : "text-gray-100 text-sm"} pl-6`}>
        {label}
      </td>
      <td className={`py-3 px-3 text-right tabular-nums font-bold ${highlight ? "text-lg" : "text-sm"} ${amountColor(value)}`}>
        {fmt(value)}
      </td>
    </tr>
  );
}

function SpacerRow() {
  return (
    <tr className="bg-transparent">
      <td colSpan={3} className="py-1" />
    </tr>
  );
}

// ── CashBox ───────────────────────────────────────────────────────────────────

function CashBox({ label, value }: { label: string; value: string }) {
  const num = parseFloat(value);
  const color = isNaN(num) || num === 0 ? "text-gray-400" : num < 0 ? "text-red-400" : "text-emerald-400";
  return (
    <div className="flex-1 min-w-[160px] rounded-lg border border-gray-700 bg-gray-900 px-5 py-4 text-center">
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{fmt(value)}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const [result, setResult] = useState<CFResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<ReportFilterParams | null>(null);

  const run = useCallback(async (params: ReportFilterParams) => {
    setLastParams(params);
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period_from: params.periodFrom,
        period_to: params.periodTo,
        branch: params.branch,
        format: "json",
      });
      const res = await fetch(`${API_BASE}/api/v1/reports/cash-flow?${qs}`, {
        credentials: "include",
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            "Failed to load"
        );
      setResult((body as { data: CFResult }).data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const doExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      if (!lastParams) return;
      setExporting(format);
      try {
        await triggerExport(
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

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Cash Flow Statement / งบกระแสเงินสด" />

      <ReportFilterBar
        mode="range"
        onRun={run}
        onExport={doExport}
        exporting={exporting}
        showExports={!!result}
        loading={loading}
      />

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Reconciliation status banner */}
          {result.reconciled ? (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/20 p-3 flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Reconciled — net change in cash equals cash ending minus cash beginning.
            </div>
          ) : (
            <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 flex items-center gap-2 text-amber-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Reconciliation difference of{" "}
              <span className="font-mono font-semibold">
                {fmt(result.reconciliation_diff ?? "0")}
              </span>
              {" "}— net change in cash does not equal cash ending minus cash beginning. Data may be corrupt.
            </div>
          )}

          {/* Cash begin / end / net-change summary boxes */}
          <div className="flex flex-wrap gap-4">
            <CashBox label="Cash — Beginning of Period" value={result.cash_begin} />
            <CashBox label="Cash — End of Period" value={result.cash_end} />
            <CashBox label="Net Change in Cash" value={result.net_change} />
          </div>

          {/* Statement table */}
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <div className="bg-gray-900 px-4 py-2 text-xs text-gray-400">
              {lastParams?.periodFrom} — {lastParams?.periodTo}{" "}
              {lastParams?.branch !== "ALL" && (
                <span className="ml-2 uppercase font-mono">{lastParams?.branch}</span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead>
                  <tr className="bg-gray-800 text-gray-300 text-xs">
                    <th className="py-2.5 px-3 text-left font-semibold w-24">Code</th>
                    <th className="py-2.5 px-3 text-left font-semibold">Account</th>
                    <th className="py-2.5 px-3 text-right font-semibold w-40">Amount (THB)</th>
                  </tr>
                </thead>
                <tbody>
                  {/* ── Operating Activities ── */}
                  <SectionHeader label="Operating Activities / กิจกรรมดำเนินงาน" />

                  <tr className="border-b border-gray-800/40">
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-sm text-gray-300 pl-6">
                      Net Income / กำไรสุทธิ
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums text-sm ${amountColor(result.operating.net_income)}`}>
                      {fmt(result.operating.net_income)}
                    </td>
                  </tr>

                  {result.operating.depreciation.rows.length > 0 && (
                    <>
                      <tr className="bg-gray-800/40">
                        <td colSpan={3} className="py-1.5 px-3 text-xs text-gray-500 pl-6 italic">
                          Adjustments — Depreciation &amp; Non-cash Items
                        </td>
                      </tr>
                      <SectionRows section={result.operating.depreciation} indent />
                    </>
                  )}

                  {result.operating.working_capital.rows.length > 0 && (
                    <>
                      <tr className="bg-gray-800/40">
                        <td colSpan={3} className="py-1.5 px-3 text-xs text-gray-500 pl-6 italic">
                          Changes in Working Capital / การเปลี่ยนแปลงในเงินทุนหมุนเวียน
                        </td>
                      </tr>
                      <SectionRows section={result.operating.working_capital} indent />
                    </>
                  )}

                  {result.operating.other.rows.length > 0 && (
                    <>
                      <tr className="bg-gray-800/40">
                        <td colSpan={3} className="py-1.5 px-3 text-xs text-gray-500 pl-6 italic">
                          Other Adjustments / ปรับปรุงอื่น
                        </td>
                      </tr>
                      <SectionRows section={result.operating.other} indent />
                    </>
                  )}

                  <SubtotalRow
                    label="Net Cash from Operating Activities / เงินสดสุทธิจากกิจกรรมดำเนินงาน"
                    value={result.operating.total}
                    bold
                  />

                  <SpacerRow />

                  {/* ── Investing Activities ── */}
                  <SectionHeader label="Investing Activities / กิจกรรมลงทุน" />
                  <SectionRows section={result.investing} />
                  <SubtotalRow
                    label="Net Cash from Investing Activities / เงินสดสุทธิจากกิจกรรมลงทุน"
                    value={result.investing.total}
                    bold
                  />

                  <SpacerRow />

                  {/* ── Financing Activities ── */}
                  <SectionHeader label="Financing Activities / กิจกรรมจัดหาเงิน" />
                  <SectionRows section={result.financing} />
                  <SubtotalRow
                    label="Net Cash from Financing Activities / เงินสดสุทธิจากกิจกรรมจัดหาเงิน"
                    value={result.financing.total}
                    bold
                  />

                  <SpacerRow />

                  {/* ── Net change line ── */}
                  <TotalRow
                    label="Net Change in Cash / การเปลี่ยนแปลงสุทธิในเงินสด"
                    value={result.net_change}
                    highlight
                  />

                  <SpacerRow />

                  {/* ── Cash begin / end reconciliation ── */}
                  <tr className="bg-gray-800/20 border-t border-gray-700/60">
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-sm text-gray-400 pl-6">
                      Cash at Beginning of Period / เงินสดต้นงวด
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums text-sm ${amountColor(result.cash_begin)}`}>
                      {fmt(result.cash_begin)}
                    </td>
                  </tr>
                  <tr className="bg-gray-800/20 border-b border-gray-700/60">
                    <td className="py-2 px-3" />
                    <td className="py-2 px-3 text-sm text-gray-400 pl-6">
                      Cash at End of Period / เงินสดปลายงวด
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums text-sm ${amountColor(result.cash_end)}`}>
                      {fmt(result.cash_end)}
                    </td>
                  </tr>

                  {/* Reconciliation diff note (only shown when not reconciled) */}
                  {!result.reconciled && (
                    <tr className="bg-amber-950/20">
                      <td className="py-2 px-3" />
                      <td colSpan={2} className="py-2 px-3 text-xs text-amber-400 pl-6">
                        Reconciliation difference:{" "}
                        <span className="font-mono font-semibold">
                          {fmt(result.reconciliation_diff ?? "0")}
                        </span>
                        {" "}(net change minus cash delta — should be zero)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

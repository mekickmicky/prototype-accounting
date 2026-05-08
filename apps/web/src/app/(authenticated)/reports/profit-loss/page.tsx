"use client";

import React, { useState, useCallback, Suspense } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  ReportFilterBar,
  type ReportFilterParams,
} from "@/components/reports/filter-bar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PLRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

interface PLSection {
  title_th: string;
  title_en: string;
  rows: PLRow[];
  total: string;
  comparative_total?: string;
  pct_change?: string;
}

interface PLResult {
  start_date: string;
  end_date: string;
  branch: string;
  revenue: PLSection;
  cogs: PLSection;
  gross_profit: string;
  opex: PLSection;
  operating_income: string;
  other: PLSection;
  net_income: string;
  comparative?: PLResult;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(value: string | undefined | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return "—";
  if (num < 0) {
    return `(${Math.abs(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })})`;
  }
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function computePctChange(
  prev: string | undefined,
  cur: string
): string | undefined {
  if (!prev) return undefined;
  const p = parseFloat(prev);
  const c = parseFloat(cur);
  if (isNaN(p) || isNaN(c) || p === 0) return undefined;
  return (((c - p) / Math.abs(p)) * 100).toFixed(2);
}

type SectionType = "revenue" | "expense" | "neutral";

function pctColor(pct: string | undefined, type: SectionType): string {
  if (!pct) return "var(--text-dim)";
  const n = parseFloat(pct);
  if (isNaN(n) || n === 0) return "var(--text-dim)";
  if (type === "revenue") return n > 0 ? "var(--credit)" : "var(--error)";
  if (type === "expense") return n > 0 ? "var(--error)" : "var(--credit)";
  return "var(--text-primary)";
}

function PctSpan({ pct, type }: { pct: string | undefined; type: SectionType }) {
  if (!pct) return <span style={NUM_STYLE}>—</span>;
  const n = parseFloat(pct);
  if (isNaN(n)) return <span style={NUM_STYLE}>—</span>;
  const sign = n > 0 ? "+" : "";
  return (
    <span style={{ ...NUM_STYLE, fontSize: 12, color: pctColor(pct, type) }}>
      {sign}{n.toFixed(1)}%
    </span>
  );
}

async function triggerExport(
  periodFrom: string,
  periodTo: string,
  branch: string,
  comparative: boolean,
  format: "csv" | "xlsx" | "pdf"
) {
  const params = new URLSearchParams({
    period_from: periodFrom,
    period_to: periodTo,
    branch,
    comparative: String(comparative),
    format,
  });
  const res = await fetch(`${API_BASE}/api/v1/reports/profit-loss?${params}`, {
    credentials: "include",
  });
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
  a.download = `profit-loss-${periodFrom}_${periodTo}-${branch}.${format}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Style constants ───────────────────────────────────────────────────────────

const TH_BASE: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--bg-elevated)",
  borderBottom: "1px solid var(--border)",
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "var(--text-muted)",
  position: "sticky",
  top: 0,
  zIndex: 1,
  whiteSpace: "nowrap",
};

const TD_BASE: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const NUM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 13,
};

// ── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  section,
  hasComparative,
  sectionType,
  onAccountClick,
}: {
  section: PLSection;
  hasComparative: boolean;
  sectionType: SectionType;
  onAccountClick: (code: string) => void;
}) {
  const colSpan = hasComparative ? 5 : 3;
  return (
    <>
      {/* Section header */}
      <tr style={{ background: "var(--bg-elevated)" }}>
        <td
          colSpan={colSpan}
          style={{
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--accent)",
            borderBottom: "1px solid var(--border)",
            borderTop: "1px solid var(--border-strong)",
          }}
        >
          {section.title_en}
          <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: 6 }}>
            · {section.title_th}
          </span>
        </td>
      </tr>

      {/* Account rows */}
      {section.rows.map((row) => (
        <tr
          key={row.account_code}
          onClick={() => onAccountClick(row.account_code)}
          style={{ cursor: "pointer", transition: "background 0.1s" }}
          className="hover:bg-[--bg-hover]"
        >
          <td style={TD_BASE}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              {row.account_code}
            </span>
          </td>
          <td style={TD_BASE}>
            <span>{row.name_th}</span>
            {row.name_en && row.name_en !== row.name_th && (
              <span
                style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 4 }}
              >
                · {row.name_en}
              </span>
            )}
          </td>
          <td style={{ ...TD_BASE, textAlign: "right" }}>
            <span style={NUM_STYLE}>{formatMoney(row.amount)}</span>
          </td>
          {hasComparative && (
            <>
              <td style={{ ...TD_BASE, textAlign: "right" }}>
                <span style={{ ...NUM_STYLE, color: "var(--text-muted)" }}>
                  {formatMoney(row.comparative_amount)}
                </span>
              </td>
              <td style={{ ...TD_BASE, textAlign: "right" }}>
                <PctSpan pct={row.pct_change} type={sectionType} />
              </td>
            </>
          )}
        </tr>
      ))}

      {/* Subtotal */}
      <tr style={{ background: "var(--bg-elevated)" }}>
        <td style={TD_BASE} />
        <td
          style={{
            ...TD_BASE,
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          Total {section.title_en}
        </td>
        <td style={{ ...TD_BASE, textAlign: "right" }}>
          <span style={{ ...NUM_STYLE, fontWeight: 600 }}>
            {formatMoney(section.total)}
          </span>
        </td>
        {hasComparative && (
          <>
            <td style={{ ...TD_BASE, textAlign: "right" }}>
              <span
                style={{
                  ...NUM_STYLE,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                }}
              >
                {formatMoney(section.comparative_total)}
              </span>
            </td>
            <td style={{ ...TD_BASE, textAlign: "right" }}>
              <PctSpan pct={section.pct_change} type={sectionType} />
            </td>
          </>
        )}
      </tr>
    </>
  );
}

// ── Derived row (Gross Profit / Operating Income / Net Income) ────────────────

function DerivedRow({
  label_th,
  label_en,
  amount,
  comparative_amount,
  pct_change,
  highlight,
  hasComparative,
}: {
  label_th: string;
  label_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
  highlight?: boolean;
  hasComparative: boolean;
}) {
  return (
    <tr
      style={{
        background: highlight ? "var(--surface)" : "var(--bg-elevated)",
        borderTop: highlight
          ? "2px solid var(--accent)"
          : "1px solid var(--border-strong)",
        borderBottom: highlight ? "2px solid var(--accent)" : undefined,
      }}
    >
      <td
        colSpan={2}
        style={{
          padding: "8px 12px",
          fontWeight: highlight ? 700 : 600,
          fontSize: highlight ? 13 : 12,
          color: highlight ? "var(--accent)" : undefined,
        }}
      >
        {label_en}
        <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: 6 }}>
          · {label_th}
        </span>
      </td>
      <td style={{ padding: "8px 12px", textAlign: "right" }}>
        <span
          style={{
            ...NUM_STYLE,
            fontWeight: highlight ? 700 : 600,
          }}
        >
          {formatMoney(amount)}
        </span>
      </td>
      {hasComparative && (
        <>
          <td style={{ padding: "8px 12px", textAlign: "right" }}>
            <span
              style={{
                ...NUM_STYLE,
                fontWeight: highlight ? 700 : 600,
                color: "var(--text-muted)",
              }}
            >
              {formatMoney(comparative_amount)}
            </span>
          </td>
          <td style={{ padding: "8px 12px", textAlign: "right" }}>
            <PctSpan pct={pct_change} type="revenue" />
          </td>
        </>
      )}
    </tr>
  );
}

// ── P&L table ─────────────────────────────────────────────────────────────────

function PLTable({
  result,
  hasComparative,
  currentLabel,
  priorLabel,
  onAccountClick,
}: {
  result: PLResult;
  hasComparative: boolean;
  currentLabel: string;
  priorLabel: string;
  onAccountClick: (code: string) => void;
}) {
  const gpPct = computePctChange(
    result.comparative?.gross_profit,
    result.gross_profit
  );
  const oiPct = computePctChange(
    result.comparative?.operating_income,
    result.operating_income
  );
  const niPct = computePctChange(
    result.comparative?.net_income,
    result.net_income
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          <th style={{ ...TH_BASE, textAlign: "left", width: 72 }}>Code</th>
          <th style={{ ...TH_BASE, textAlign: "left" }}>Account</th>
          <th style={{ ...TH_BASE, textAlign: "right", width: 150 }}>
            {currentLabel}
          </th>
          {hasComparative && (
            <>
              <th style={{ ...TH_BASE, textAlign: "right", width: 150 }}>
                {priorLabel}
              </th>
              <th style={{ ...TH_BASE, textAlign: "right", width: 88 }}>
                Change %
              </th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        <SectionBlock
          section={result.revenue}
          hasComparative={hasComparative}
          sectionType="revenue"
          onAccountClick={onAccountClick}
        />
        <SectionBlock
          section={result.cogs}
          hasComparative={hasComparative}
          sectionType="expense"
          onAccountClick={onAccountClick}
        />
        <DerivedRow
          label_th="กำไรขั้นต้น"
          label_en="Gross Profit"
          amount={result.gross_profit}
          comparative_amount={result.comparative?.gross_profit}
          pct_change={gpPct}
          hasComparative={hasComparative}
        />
        <SectionBlock
          section={result.opex}
          hasComparative={hasComparative}
          sectionType="expense"
          onAccountClick={onAccountClick}
        />
        <DerivedRow
          label_th="กำไรจากการดำเนินงาน"
          label_en="Operating Income"
          amount={result.operating_income}
          comparative_amount={result.comparative?.operating_income}
          pct_change={oiPct}
          hasComparative={hasComparative}
        />
        <SectionBlock
          section={result.other}
          hasComparative={hasComparative}
          sectionType="neutral"
          onAccountClick={onAccountClick}
        />
        <DerivedRow
          label_th="กำไรสุทธิ (ก่อนภาษี)"
          label_en="Net Income (Before Tax)"
          amount={result.net_income}
          comparative_amount={result.comparative?.net_income}
          pct_change={niPct}
          hasComparative={hasComparative}
          highlight
        />
      </tbody>
    </table>
  );
}

// ── Page content ──────────────────────────────────────────────────────────────

function ProfitLossContent() {
  const router = useRouter();
  const [result, setResult] = useState<PLResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilterParams | null>(null);

  const run = useCallback(async (params: ReportFilterParams) => {
    setFilters(params);
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        period_from: params.periodFrom,
        period_to: params.periodTo,
        branch: params.branch,
        comparative: String(params.comparative),
        format: "json",
      });
      const res = await fetch(
        `${API_BASE}/api/v1/reports/profit-loss?${qs}`,
        { credentials: "include" }
      );
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          (body as { error?: { message?: string } })?.error?.message ??
            "Failed to load"
        );
      setResult((body as { data: PLResult }).data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const doExport = useCallback(
    async (format: "csv" | "xlsx" | "pdf") => {
      if (!filters) return;
      setExporting(format);
      try {
        await triggerExport(
          filters.periodFrom,
          filters.periodTo,
          filters.branch,
          filters.comparative,
          format
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setExporting(null);
      }
    },
    [filters]
  );

  const handleAccountClick = useCallback(
    (code: string) => {
      if (!filters) return;
      const qs = new URLSearchParams({
        account: code,
        period_from: filters.periodFrom,
        period_to: filters.periodTo,
        branch: filters.branch,
      });
      router.push(`/reports/general-ledger?${qs}`);
    },
    [filters, router]
  );

  const hasComparative = !!(result?.comparative);
  const currentLabel =
    filters
      ? filters.periodFrom === filters.periodTo
        ? filters.periodFrom
        : `${filters.periodFrom} — ${filters.periodTo}`
      : "Current Period";
  const priorLabel = "Prior Period";

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Profit & Loss / งบกำไรขาดทุน" />

      <ReportFilterBar
        mode="range"
        showComparativeToggle
        showZeroToggle
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

      {result && filters && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "var(--bg-elevated)",
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {filters.periodFrom} — {filters.periodTo}
              {filters.branch !== "ALL" && ` · Branch: ${filters.branch}`}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <PLTable
              result={result}
              hasComparative={hasComparative}
              currentLabel={currentLabel}
              priorLabel={priorLabel}
              onAccountClick={handleAccountClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfitLossPage() {
  return (
    <Suspense>
      <ProfitLossContent />
    </Suspense>
  );
}

"use client";

import React from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SectionType = "revenue" | "expense" | "neutral";

export interface ComparativeRow {
  account_code: string;
  name_th: string;
  name_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
}

export interface ComparativeSection {
  title_th: string;
  title_en: string;
  rows: ComparativeRow[];
  total: string;
  comparative_total?: string;
  pct_change?: string;
  /** Controls color-coding of the % change column. */
  sectionType?: SectionType;
}

export interface ComparativeSummaryRow {
  label_th: string;
  label_en: string;
  amount: string;
  comparative_amount?: string;
  pct_change?: string;
  /** When true, renders with a heavier accent border and font. */
  highlight?: boolean;
  /** Uses revenue color-coding convention (positive = good) by default. */
  sectionType?: SectionType;
}

export interface ComparativeTableProps {
  sections: ComparativeSection[];
  /** Subtotals / derived lines shown below all sections (e.g. Net Income). */
  summaryRows?: ComparativeSummaryRow[];
  /** Column header for the current-period figures. */
  currentLabel: string;
  /** Column header for the prior-period figures. */
  priorLabel: string;
  /** If provided, account rows become clickable and call this handler. */
  onAccountClick?: (code: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/**
 * Color-code percentage change by section semantics.
 *   revenue: positive change = good (green), negative = bad (red)
 *   expense: positive change = bad (red), negative = good (green)
 *   neutral: no color
 */
function pctColor(pct: string | undefined, type: SectionType): string {
  if (!pct) return "var(--text-dim)";
  const n = parseFloat(pct);
  if (isNaN(n) || n === 0) return "var(--text-dim)";
  if (type === "revenue") return n > 0 ? "var(--credit)" : "var(--error)";
  if (type === "expense") return n > 0 ? "var(--error)" : "var(--credit)";
  return "var(--text-primary)";
}

function PctCell({ pct, type }: { pct?: string; type: SectionType }) {
  if (!pct) return <span style={NUM_STYLE}>—</span>;
  const n = parseFloat(pct);
  if (isNaN(n)) return <span style={NUM_STYLE}>—</span>;
  const sign = n > 0 ? "+" : "";
  return (
    <span style={{ ...NUM_STYLE, color: pctColor(pct, type) }}>
      {sign}
      {n.toFixed(1)}%
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ComparativeTable({
  sections,
  summaryRows,
  currentLabel,
  priorLabel,
  onAccountClick,
}: ComparativeTableProps) {
  const hasComparative = sections.some(
    (s) => s.comparative_total !== undefined || s.rows.some((r) => r.comparative_amount !== undefined),
  );

  const colSpanFull = hasComparative ? 5 : 3;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <TH style={{ width: 72 }}>Code</TH>
            <TH>Account</TH>
            <TH style={{ textAlign: "right", width: 150 }}>{currentLabel}</TH>
            {hasComparative && (
              <>
                <TH style={{ textAlign: "right", width: 150 }}>{priorLabel}</TH>
                <TH style={{ textAlign: "right", width: 88 }}>Change %</TH>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {sections.map((section, si) => {
            const type = section.sectionType ?? "neutral";
            return (
              <React.Fragment key={si}>
                {/* Section header */}
                <tr style={GROUP_ROW_STYLE}>
                  <td colSpan={colSpanFull} style={GROUP_CELL_STYLE}>
                    {section.title_en}
                    {section.title_th && section.title_th !== section.title_en && (
                      <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: 6 }}>
                        · {section.title_th}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Account rows */}
                {section.rows.map((row) => (
                  <tr
                    key={row.account_code}
                    style={{
                      cursor: onAccountClick ? "pointer" : undefined,
                      transition: "background 0.1s",
                    }}
                    className="hover:bg-[--bg-hover]"
                    onClick={onAccountClick ? () => onAccountClick(row.account_code) : undefined}
                  >
                    <td style={CODE_CELL_STYLE}>
                      <span style={CODE_STYLE}>{row.account_code}</span>
                    </td>
                    <td style={TD_BASE}>
                      <span>{row.name_th}</span>
                      {row.name_en && row.name_en !== row.name_th && (
                        <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 4 }}>
                          · {row.name_en}
                        </span>
                      )}
                    </td>
                    <td style={NUM_CELL_STYLE}>
                      <span style={NUM_STYLE}>{formatMoney(row.amount)}</span>
                    </td>
                    {hasComparative && (
                      <>
                        <td style={NUM_CELL_STYLE}>
                          <span style={{ ...NUM_STYLE, color: "var(--text-muted)" }}>
                            {formatMoney(row.comparative_amount)}
                          </span>
                        </td>
                        <td style={NUM_CELL_STYLE}>
                          <PctCell pct={row.pct_change} type={type} />
                        </td>
                      </>
                    )}
                  </tr>
                ))}

                {/* Section total */}
                <tr style={SUBTOTAL_ROW_STYLE}>
                  <td colSpan={2} style={{ ...TD_BASE, fontWeight: 600, fontSize: 12 }}>
                    Total {section.title_en}
                  </td>
                  <td style={NUM_CELL_STYLE}>
                    <span style={{ ...NUM_STYLE, fontWeight: 600 }}>
                      {formatMoney(section.total)}
                    </span>
                  </td>
                  {hasComparative && (
                    <>
                      <td style={NUM_CELL_STYLE}>
                        <span style={{ ...NUM_STYLE, fontWeight: 600, color: "var(--text-muted)" }}>
                          {formatMoney(section.comparative_total)}
                        </span>
                      </td>
                      <td style={NUM_CELL_STYLE}>
                        <PctCell pct={section.pct_change} type={type} />
                      </td>
                    </>
                  )}
                </tr>
              </React.Fragment>
            );
          })}

          {/* Summary / derived rows (Gross Profit, Net Income, etc.) */}
          {summaryRows &&
            summaryRows.map((row, i) => {
              const type = row.sectionType ?? "revenue";
              return (
                <tr
                  key={i}
                  style={{
                    background: row.highlight ? "var(--surface)" : "var(--bg-elevated)",
                    borderTop: row.highlight
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border-strong)",
                    borderBottom: row.highlight ? "2px solid var(--accent)" : undefined,
                  }}
                >
                  <td
                    colSpan={2}
                    style={{
                      ...TD_BASE,
                      fontWeight: row.highlight ? 700 : 600,
                      fontSize: row.highlight ? 13 : 12,
                      color: row.highlight ? "var(--accent)" : undefined,
                    }}
                  >
                    {row.label_en}
                    {row.label_th && row.label_th !== row.label_en && (
                      <span style={{ color: "var(--text-dim)", fontWeight: 400, marginLeft: 6 }}>
                        · {row.label_th}
                      </span>
                    )}
                  </td>
                  <td style={NUM_CELL_STYLE}>
                    <span style={{ ...NUM_STYLE, fontWeight: row.highlight ? 700 : 600 }}>
                      {formatMoney(row.amount)}
                    </span>
                  </td>
                  {hasComparative && (
                    <>
                      <td style={NUM_CELL_STYLE}>
                        <span
                          style={{
                            ...NUM_STYLE,
                            fontWeight: row.highlight ? 700 : 600,
                            color: "var(--text-muted)",
                          }}
                        >
                          {formatMoney(row.comparative_amount)}
                        </span>
                      </td>
                      <td style={NUM_CELL_STYLE}>
                        <PctCell pct={row.pct_change} type={type} />
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TH({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        padding: "8px 12px",
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        fontSize: 11,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        color: "var(--text-muted)",
        textAlign: "left",
        position: "sticky",
        top: 0,
        zIndex: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}

// ── Style constants ────────────────────────────────────────────────────────────

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const TD_BASE: React.CSSProperties = {
  padding: "6px 12px",
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const CODE_CELL_STYLE: React.CSSProperties = { ...TD_BASE };

const NUM_CELL_STYLE: React.CSSProperties = { ...TD_BASE, textAlign: "right" };

const NUM_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: 13,
};

const CODE_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  color: "var(--text-muted)",
};

const GROUP_ROW_STYLE: React.CSSProperties = { background: "var(--bg-elevated)" };

const GROUP_CELL_STYLE: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--accent)",
  borderBottom: "1px solid var(--border)",
  borderTop: "1px solid var(--border-strong)",
};

const SUBTOTAL_ROW_STYLE: React.CSSProperties = { background: "var(--bg-elevated)" };

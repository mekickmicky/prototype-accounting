"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Download, AlertCircle, CheckCircle2, Loader2, Play } from "lucide-react";

import Decimal from "decimal.js";
import { apiClient } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { BranchPicker } from "@/components/ui/branch-picker";
import { DatePickerTH } from "@/components/ui/date-picker-th";

// ── Types ─────────────────────────────────────────────────────────────────────

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

interface TBRow {
  account_code: string;
  name_th: string;
  name_en: string;
  type: AccountType;
  debit_total: string;
  credit_total: string;
  balance: string;
}

interface TBGroup {
  type: AccountType;
  debit_total: string;
  credit_total: string;
  balance: string;
}

interface TBTotals {
  debit: string;
  credit: string;
  balance: string;
}

interface TrialBalanceResult {
  as_of: string;
  branch: string;
  rows: TBRow[];
  grouped_by_type?: TBGroup[];
  totals: TBTotals;
  imbalance?: string;
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

function formatMoney(value: string): string {
  try {
    const d = new Decimal(value ?? 0);
    if (d.isZero()) return "—";
    if (d.isNegative()) {
      return `(${d.abs().toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
    }
    return d.toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "—";
  }
}

function isZero(value: string): boolean {
  try { return new Decimal(value).isZero(); } catch { return true; }
}

function isNeg(value: string): boolean {
  try { return new Decimal(value).isNegative(); } catch { return false; }
}

const TYPE_ORDER: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

const TYPE_LABELS: Record<AccountType, { en: string; th: string }> = {
  ASSET:     { en: "Assets",      th: "สินทรัพย์" },
  LIABILITY: { en: "Liabilities", th: "หนี้สิน" },
  EQUITY:    { en: "Equity",      th: "ส่วนของผู้ถือหุ้น" },
  REVENUE:   { en: "Revenue",     th: "รายได้" },
  EXPENSE:   { en: "Expenses",    th: "ค่าใช้จ่าย" },
};

// ── Export helper ─────────────────────────────────────────────────────────────

async function triggerExport(asOf: string, branch: string, format: "csv" | "xlsx" | "pdf") {
  const blob = await apiClient.getBlob(
    `/api/v1/reports/trial-balance?as_of=${asOf}&branch=${branch}&format=${format}`
  );
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `trial-balance-${asOf}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TrialBalancePage() {
  const router = useRouter();

  const [asOf, setAsOf] = useState<string>(getTodayBangkok());
  const [branch, setBranch] = useState<string>("ALL");
  const [hideZero, setHideZero] = useState(false);

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<TrialBalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | "pdf" | null>(null);

  const fetchReport = useCallback(async (date: string, br: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<TrialBalanceResult>(
        `/api/v1/reports/trial-balance?as_of=${date}&branch=${br}&format=json`
      );
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(asOf, branch);
  }, [fetchReport]);

  const handleRun = () => {
    if (asOf) fetchReport(asOf, branch);
  };

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    if (!asOf) return;
    setExporting(format);
    try {
      await triggerExport(asOf, branch, format);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const handleAccountClick = (code: string) => {
    router.push(`/gl/accounts/${encodeURIComponent(code)}?as_of=${asOf}`);
  };

  // Group rows by type for rendering
  const rowsByType = React.useMemo(() => {
    if (!result) return new Map<AccountType, TBRow[]>();
    const map = new Map<AccountType, TBRow[]>();
    for (const row of result.rows) {
      const existing = map.get(row.type) ?? [];
      existing.push(row);
      map.set(row.type, existing);
    }
    return map;
  }, [result]);

  // Find subtotal for a type
  const getSubtotal = (type: AccountType): TBGroup | undefined =>
    result?.grouped_by_type?.find((g) => g.type === type);

  // Rows after hide-zero filter
  const filteredRows = (type: AccountType): TBRow[] => {
    const rows = rowsByType.get(type) ?? [];
    if (!hideZero) return rows;
    return rows.filter((r) => !isZero(r.debit_total) || !isZero(r.credit_total));
  };

  return (
    <div>
      <PageHeader
        title="งบทดลอง"
        description="Trial Balance · ยอดรวมของบัญชีทุกบัญชี ณ วันที่กำหนด"
        breadcrumbs={[
          { label: "Reports", href: "/reports" },
          { label: "Trial Balance" },
        ]}
        actions={
          result ? (
            <div style={{ display: "flex", gap: 6 }}>
              <ExportButton
                label="PDF"
                loading={exporting === "pdf"}
                onClick={() => handleExport("pdf")}
              />
              <ExportButton
                label="CSV"
                loading={exporting === "csv"}
                onClick={() => handleExport("csv")}
              />
              <ExportButton
                label="XLSX"
                loading={exporting === "xlsx"}
                onClick={() => handleExport("xlsx")}
              />
            </div>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          padding: "12px 0",
          borderBottom: "1px solid var(--border)",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={LABEL}>As of Date</span>
          <DatePickerTH value={asOf} onChange={(v) => setAsOf(v ?? getTodayBangkok())} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={LABEL}>Branch</span>
          <BranchPicker value={branch} onChange={setBranch} allowAll />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 1 }}>
          <input
            type="checkbox"
            id="hide-zero"
            checked={hideZero}
            onChange={(e) => setHideZero(e.target.checked)}
            style={{ width: 13, height: 13, accentColor: "var(--accent)", cursor: "pointer" }}
          />
          <label
            htmlFor="hide-zero"
            style={{ fontSize: 12, color: "var(--text-muted)", cursor: "pointer" }}
          >
            Hide zero-balance accounts
          </label>
        </div>

        <button
          onClick={handleRun}
          disabled={loading || !asOf}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            border: "none",
            background: loading ? "var(--surface)" : "var(--accent)",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
            fontFamily: "inherit",
            transition: "opacity 0.15s",
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Run
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 200,
            gap: 8,
          }}
        >
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังคำนวณ...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--error)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Report content */}
      {!loading && result && (
        <>
          {/* Balance status banner */}
          {result.imbalance ? (
            <div
              style={{
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 4,
                padding: "8px 14px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <AlertCircle size={14} style={{ color: "var(--error)", flexShrink: 0 }} />
              <span style={{ color: "var(--error)", fontWeight: 600 }}>
                TRIAL BALANCE NOT BALANCED — DATA INTEGRITY ISSUE
              </span>
              <span style={{ color: "var(--text-muted)" }}>
                ผลต่าง: {formatMoney(result.imbalance)}
              </span>
            </div>
          ) : (
            <div
              style={{
                background: "rgba(107,142,127,0.1)",
                border: "1px solid var(--credit)",
                borderRadius: 4,
                padding: "8px 14px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
              }}
            >
              <CheckCircle2 size={14} style={{ color: "var(--credit)", flexShrink: 0 }} />
              <span style={{ color: "var(--credit)", fontWeight: 600 }}>✓ Balanced</span>
              <span style={{ color: "var(--text-muted)" }}>
                งบทดลองสมดุล · Total Dr = Total Cr = {formatMoney(result.totals.debit)}
              </span>
            </div>
          )}

          {/* Table */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <table style={TABLE_STYLE}>
              <thead>
                <tr>
                  <TH style={{ width: 80 }}>Code</TH>
                  <TH>Account</TH>
                  <TH style={{ textAlign: "right", width: 160 }}>Debit Total</TH>
                  <TH style={{ textAlign: "right", width: 160 }}>Credit Total</TH>
                  <TH style={{ textAlign: "right", width: 160 }}>Balance</TH>
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.map((type) => {
                  const rows = filteredRows(type);
                  const subtotal = getSubtotal(type);
                  if (!subtotal && rows.length === 0) return null;

                  return (
                    <React.Fragment key={type}>
                      {/* Section header */}
                      <tr style={GROUP_ROW_STYLE}>
                        <td colSpan={5} style={GROUP_CELL_STYLE}>
                          {TYPE_LABELS[type].en} · {TYPE_LABELS[type].th}
                        </td>
                      </tr>

                      {/* Account rows */}
                      {rows.map((row) => (
                        <tr
                          key={row.account_code}
                          style={DATA_ROW_STYLE}
                          className="hover:bg-[--bg-hover]"
                          onClick={() => handleAccountClick(row.account_code)}
                        >
                          <td style={CODE_CELL_STYLE}>
                            <span style={CODE_STYLE}>{row.account_code}</span>
                          </td>
                          <td style={NAME_CELL_STYLE}>
                            <span>{row.name_th}</span>
                            {row.name_en && row.name_en !== row.name_th && (
                              <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 4 }}>
                                · {row.name_en}
                              </span>
                            )}
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={row.debit_total} colorDr />
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={row.credit_total} colorCr />
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={row.balance} colorBalance />
                          </td>
                        </tr>
                      ))}

                      {/* Subtotal row */}
                      {subtotal && (
                        <tr style={SUBTOTAL_ROW_STYLE}>
                          <td colSpan={2} style={{ ...TD_BASE, fontWeight: 600 }}>
                            Total {TYPE_LABELS[type].en}
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={subtotal.debit_total} bold />
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={subtotal.credit_total} bold />
                          </td>
                          <td style={NUM_CELL_STYLE}>
                            <NumCell value={subtotal.balance} bold />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Grand total */}
                <tr style={TOTAL_ROW_STYLE}>
                  <td colSpan={2} style={{ ...TD_BASE, fontWeight: 700, fontSize: 12 }}>
                    GRAND TOTAL
                  </td>
                  <td style={NUM_CELL_STYLE}>
                    <span style={{ ...NUM_STYLE, fontWeight: 700 }}>
                      {formatMoney(result.totals.debit)}
                    </span>
                  </td>
                  <td style={NUM_CELL_STYLE}>
                    <span style={{ ...NUM_STYLE, fontWeight: 700 }}>
                      {formatMoney(result.totals.credit)}
                    </span>
                  </td>
                  <td style={NUM_CELL_STYLE}>
                    <span
                      style={{
                        ...NUM_STYLE,
                        fontWeight: 700,
                        color: isNeg(result.totals.balance) ? "var(--error)" : undefined,
                      }}
                    >
                      {formatMoney(result.totals.balance)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer metadata */}
          <div
            style={{
              marginTop: 10,
              padding: "8px 14px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: 11,
              color: "var(--text-muted)",
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <span>
              <span style={META_LABEL}>Accounts</span>{" "}
              {result.rows.length} postable accounts
            </span>
            <span>
              <span style={META_LABEL}>Branch</span>{" "}
              {result.branch === "ALL" ? "All branches" : result.branch}
            </span>
            <span>
              <span style={META_LABEL}>As of</span>{" "}
              {new Date(result.as_of).toLocaleDateString("th-TH-u-ca-buddhist", {
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "Asia/Bangkok",
              })}
            </span>
            <span style={{ color: "var(--text-dim)", fontSize: 10 }}>
              Click any account row to drill into transactions
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ExportButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 11px",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 4,
        border: "1px solid var(--border-strong)",
        background: "transparent",
        color: "var(--text-primary)",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.6 : 1,
        fontFamily: "inherit",
        transition: "background 0.15s",
      }}
    >
      {loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : (
        <Download size={11} />
      )}
      {label}
    </button>
  );
}

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

function NumCell({
  value,
  colorDr,
  colorCr,
  colorBalance,
  bold,
}: {
  value: string;
  colorDr?: boolean;
  colorCr?: boolean;
  colorBalance?: boolean;
  bold?: boolean;
}) {
  const zero = isZero(value);
  const neg = isNeg(value);

  let color: string | undefined;
  if (zero) {
    color = "var(--text-dim)";
  } else if (colorDr && !zero) {
    color = "var(--debit)";
  } else if (colorCr && !zero) {
    color = "var(--credit)";
  } else if (colorBalance && neg) {
    color = "var(--error)";
  }

  return (
    <span
      style={{
        ...NUM_STYLE,
        color,
        fontWeight: bold ? 600 : undefined,
      }}
    >
      {formatMoney(value)}
    </span>
  );
}

// ── Style constants ────────────────────────────────────────────────────────────

const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

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

const CODE_CELL_STYLE: React.CSSProperties = {
  ...TD_BASE,
};

const NAME_CELL_STYLE: React.CSSProperties = {
  ...TD_BASE,
};

const NUM_CELL_STYLE: React.CSSProperties = {
  ...TD_BASE,
  textAlign: "right",
};

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

const GROUP_ROW_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
};

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

const DATA_ROW_STYLE: React.CSSProperties = {
  cursor: "pointer",
  transition: "background 0.1s",
};

const SUBTOTAL_ROW_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
};

const TOTAL_ROW_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  borderTop: "2px solid var(--accent)",
  borderBottom: "2px solid var(--accent)",
};

const META_LABEL: React.CSSProperties = {
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  fontSize: 10,
};

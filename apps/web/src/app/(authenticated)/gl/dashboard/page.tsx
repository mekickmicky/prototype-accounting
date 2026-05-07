"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  BarChart2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { MoneyDisplay } from "@/components/ui/money-display";
import { StatusBadge, type DocumentStatus } from "@/components/ui/status-badge";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Period {
  code: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
  closed_at: string | null;
  je_count: number;
  draft_je_count: number;
  posted_je_count: number;
}

interface JournalEntry {
  id: string;
  je_no: string;
  entry_date: string;
  period_code: string;
  branch_code: string;
  description: string;
  source_type: string;
  status: "DRAFT" | "POSTED" | "VOID";
  total_debit: string;
  total_credit: string;
  posted_at: string | null;
  posted_by_id: string | null;
}

interface TBTotals {
  debit: string;
  credit: string;
  balance: string;
}

interface TrialBalanceResult {
  as_of: string;
  branch: string;
  rows: unknown[];
  totals: TBTotals;
  imbalance?: string;
}

interface DashboardData {
  currentPeriod: Period | null;
  draftCount: number;
  postedCount: number;
  recentJEs: JournalEntry[];
  tbResult: TrialBalanceResult | null;
  tbError: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getBangkokNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 7 * 60 * 60 * 1000);
}

function getCurrentPeriodCode(): string {
  const d = getBangkokNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getTodayBangkok(): string {
  const d = getBangkokNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function periodLabel(code: string): string {
  const [y, m] = code.split("-").map(Number);
  if (!y || !m) return code;
  const thaiYear = y + 543;
  const monthName = THAI_MONTHS[m - 1] ?? "";
  return `${thaiYear}-${String(m).padStart(2, "0")} · ${monthName}`;
}

function formatEntryDate(isoDate: string): string {
  const parts = isoDate.split("T")[0]?.split("-").map(Number) ?? [];
  if (parts.length < 3) return isoDate;
  const [y, mo, d] = parts as [number, number, number];
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Invoice",
  RECEIPT: "Receipt",
  BILL: "Bill",
  PAYMENT: "Payment",
  TAX_FILING: "Tax Filing",
  BANK_TRANSFER: "Bank Transfer",
  STOCK_EXPORT: "Stock Export",
  RECURRING: "Recurring",
  ADJUSTMENT: "Adjustment",
  REVERSAL: "Reversal",
};

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  labelTh: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
}

function StatCard({ label, labelTh, children, meta, href }: StatCardProps) {
  const inner = (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "16px 18px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        transition: href ? "border-color 150ms" : undefined,
        cursor: href ? "pointer" : undefined,
      }}
      className={href ? "hover:border-[--border-strong]" : ""}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>
        {labelTh}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {meta && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
          {meta}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GLDashboardPage() {
  const [data, setData] = useState<DashboardData>({
    currentPeriod: null,
    draftCount: 0,
    postedCount: 0,
    recentJEs: [],
    tbResult: null,
    tbError: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentPeriodCode = getCurrentPeriodCode();
    const today = getTodayBangkok();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // All fetches in parallel
        const [periodsRes, draftRes, postedRes, tbRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/periods`, { credentials: "include" }),
          fetch(
            `${API_BASE}/api/v1/journal-entries?period=${currentPeriodCode}&status=DRAFT&page_size=1`,
            { credentials: "include" }
          ),
          fetch(
            `${API_BASE}/api/v1/journal-entries?period=${currentPeriodCode}&status=POSTED&page_size=5&sort=entry_date:desc`,
            { credentials: "include" }
          ),
          fetch(
            `${API_BASE}/api/v1/reports/trial-balance?as_of=${today}&branch=ALL&format=json`,
            { credentials: "include" }
          ),
        ]);

        const [periodsBody, draftBody, postedBody, tbBody] = await Promise.all([
          periodsRes.json(),
          draftRes.json(),
          postedRes.json(),
          tbRes.json(),
        ]);

        const periods: Period[] = periodsBody.success ? periodsBody.data : [];
        const currentPeriod =
          periods.find((p) => p.code === currentPeriodCode) ?? null;

        const draftCount: number = draftBody.meta?.total ?? 0;
        const postedCount: number = postedBody.meta?.total ?? 0;
        const recentJEs: JournalEntry[] = postedBody.success
          ? postedBody.data
          : [];

        let tbResult: TrialBalanceResult | null = null;
        let tbError: string | null = null;
        if (tbBody.success) {
          tbResult = tbBody.data as TrialBalanceResult;
        } else {
          tbError = tbBody.error?.message ?? "Trial balance unavailable";
        }

        setData({
          currentPeriod,
          draftCount,
          postedCount,
          recentJEs,
          tbResult,
          tbError,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const currentPeriodCode = getCurrentPeriodCode();

  // ── Render loading ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <PageHeader
          title="GL Dashboard"
          description="ภาพรวมบัญชีแยกประเภท"
          breadcrumbs={[{ label: "GL" }, { label: "Dashboard" }]}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            justifyContent: "center",
            height: 120,
          }}
        >
          <Loader2 size={16} className="animate-spin text-[--text-dim]" />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            กำลังโหลด...
          </span>
        </div>
      </div>
    );
  }

  // ── Render error ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div>
        <PageHeader
          title="GL Dashboard"
          description="ภาพรวมบัญชีแยกประเภท"
          breadcrumbs={[{ label: "GL" }, { label: "Dashboard" }]}
        />
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--error)",
            marginTop: 16,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  const { currentPeriod, draftCount, postedCount, recentJEs, tbResult, tbError } = data;

  const tbIsBalanced =
    tbResult !== null &&
    (tbResult.imbalance === undefined ||
      tbResult.imbalance === "0" ||
      tbResult.imbalance === "0.00");

  const imbalanceAmount = tbResult?.imbalance ?? null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="GL Dashboard"
        description="ภาพรวมบัญชีแยกประเภท"
        breadcrumbs={[{ label: "GL" }, { label: "Dashboard" }]}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              href="/gl/journal-entries/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <Plus size={12} />
              สร้าง JE ใหม่
            </Link>
            <Link
              href="/reports/trial-balance"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <BarChart2 size={12} />
              Trial Balance
            </Link>
            <Link
              href="/gl/periods"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <Lock size={12} />
              ปิดงวด
            </Link>
          </div>
        }
      />

      {/* ── 4 stat cards ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginTop: 20,
          marginBottom: 20,
        }}
      >
        {/* Card 1 — Current period */}
        <StatCard
          label="Current Period"
          labelTh="งวดบัญชีปัจจุบัน"
          meta={
            currentPeriod ? (
              <span>
                {currentPeriod.status === "OPEN" && (
                  <span style={{ color: "var(--text-credit)" }}>OPEN</span>
                )}
                {currentPeriod.status === "CLOSED" && (
                  <span style={{ color: "var(--text-muted)" }}>CLOSED</span>
                )}
                {currentPeriod.status === "LOCKED" && (
                  <span style={{ color: "var(--text-dim)" }}>LOCKED</span>
                )}
              </span>
            ) : (
              <span style={{ color: "var(--text-dim)" }}>ยังไม่มีงวด</span>
            )
          }
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 20,
              fontWeight: 500,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {currentPeriod ? periodLabel(currentPeriod.code) : periodLabel(currentPeriodCode)}
          </div>
        </StatCard>

        {/* Card 2 — Pending drafts */}
        <StatCard
          label="Pending Drafts"
          labelTh="รายการร่างที่ยังไม่ส่ง"
          href={
            draftCount > 0
              ? `/gl/journal-entries?period=${currentPeriodCode}&status=DRAFT`
              : undefined
          }
          meta={
            draftCount > 0 ? (
              <span style={{ color: "var(--warning)" }}>
                คลิกเพื่อดูรายการ →
              </span>
            ) : (
              <span style={{ color: "var(--text-credit)" }}>ไม่มีรายการค้าง</span>
            )
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            {draftCount > 0 ? (
              <AlertTriangle size={16} style={{ color: "var(--warning)", flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={16} style={{ color: "var(--text-credit)", flexShrink: 0 }} />
            )}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 500,
                color: draftCount > 0 ? "var(--warning)" : "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {draftCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>รายการ</span>
          </div>
        </StatCard>

        {/* Card 3 — TB balance check */}
        <StatCard
          label="Trial Balance"
          labelTh="ความสมดุลงบทดลอง"
          href="/reports/trial-balance"
          meta={
            tbError ? (
              <span style={{ color: "var(--text-dim)" }}>ไม่สามารถตรวจสอบได้</span>
            ) : tbResult ? (
              <span style={{ color: "var(--text-dim)" }}>
                As of {getTodayBangkok()}
              </span>
            ) : null
          }
        >
          {tbError ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <AlertTriangle size={16} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>N/A</span>
            </div>
          ) : tbIsBalanced ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <CheckCircle2 size={20} style={{ color: "var(--text-credit)", flexShrink: 0 }} />
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: "var(--text-credit)",
                }}
              >
                สมดุล
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
              <XCircle size={20} style={{ color: "var(--error)", flexShrink: 0 }} />
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--error)",
                  }}
                >
                  ไม่สมดุล
                </div>
                {imbalanceAmount && (
                  <div style={{ fontSize: 11, color: "var(--error)", marginTop: 2 }}>
                    ต่างกัน{" "}
                    <MoneyDisplay value={imbalanceAmount} showCurrency />
                  </div>
                )}
              </div>
            </div>
          )}
        </StatCard>

        {/* Card 4 — Posted this period */}
        <StatCard
          label="Posted This Period"
          labelTh="รายการที่ผ่านบัญชีงวดนี้"
          href={`/gl/journal-entries?period=${currentPeriodCode}&status=POSTED`}
          meta={
            <span style={{ color: "var(--text-dim)" }}>
              คลิกเพื่อดูรายการ →
            </span>
          }
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 2 }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 500,
                color: "var(--text-primary)",
                lineHeight: 1,
              }}
            >
              {postedCount}
            </span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>รายการ</span>
          </div>
        </StatCard>
      </div>

      {/* ── Recent JEs ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        {/* Card header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              รายการล่าสุด
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginLeft: 8,
              }}
            >
              Recent Journal Entries
            </span>
          </div>
          <Link
            href={`/gl/journal-entries?period=${currentPeriodCode}&status=POSTED`}
            style={{
              fontSize: 11,
              color: "var(--accent)",
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            ดูทั้งหมด →
          </Link>
        </div>

        {/* Table */}
        {recentJEs.length === 0 ? (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-dim)",
            }}
          >
            ยังไม่มีรายการในงวดนี้
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr>
                {["JE No", "Date", "Description", "Branch", "Total Dr", "Total Cr", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Total Dr" || h === "Total Cr" ? "right" : "left",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {recentJEs.map((je, idx) => (
                <tr
                  key={je.id}
                  style={{
                    borderBottom:
                      idx < recentJEs.length - 1
                        ? "1px solid var(--border)"
                        : undefined,
                  }}
                  className="hover:bg-[--bg-hover]"
                >
                  <td style={{ padding: "8px 12px" }}>
                    <Link
                      href={`/gl/journal-entries/${je.id}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontWeight: 500,
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {je.je_no.startsWith("DRAFT-") ? "(draft)" : je.je_no}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 12,
                      color: "var(--text-primary)",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {formatEntryDate(je.entry_date)}
                  </td>
                  <td style={{ padding: "8px 12px", maxWidth: 300 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                        maxWidth: 300,
                      }}
                      title={je.description}
                    >
                      {je.description}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-dim)",
                        marginTop: 1,
                      }}
                    >
                      {SOURCE_TYPE_LABELS[je.source_type] ?? je.source_type}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap" as const,
                    }}
                  >
                    {je.branch_code}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <MoneyDisplay value={je.total_debit} showZero />
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    <MoneyDisplay value={je.total_credit} showZero />
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <StatusBadge status={je.status as DocumentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

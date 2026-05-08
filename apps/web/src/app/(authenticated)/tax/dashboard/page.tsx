"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, AlertTriangle, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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

function getPrevPeriodCode(): string {
  const d = getBangkokNow();
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1 - 1;
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

function fmtMoney(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtPeriod(code: string): string {
  const [year, month] = code.split("-");
  const m = parseInt(month ?? "0", 10);
  const thMonths = [
    "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const be = parseInt(year ?? "0", 10) + 543;
  return `${thMonths[m] ?? month} ${be}`;
}

function getFilingDeadlines(periodCode: string): { pp30EFiling: Date; pnd: Date } {
  const parts = periodCode.split("-");
  const year = parseInt(parts[0] ?? "2026", 10);
  const month = parseInt(parts[1] ?? "1", 10);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    pp30EFiling: new Date(nextYear, nextMonth - 1, 23),
    pnd: new Date(nextYear, nextMonth - 1, 7),
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaxFiling {
  id: string;
  filing_no: string;
  filing_type: string;
  period_code: string;
  status: "DRAFT" | "FINALIZED" | "SUBMITTED" | "VOID";
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  total_wht: string | null;
  filed_at: string | null;
  created_at: string;
}

interface WhtCertSummary {
  wht_amount: string;
  status: string;
}

interface UpcomingFiling {
  period: string;
  type: "PP30" | "PND3" | "PND53";
  deadline: Date;
  daysLeft: number;
  overdue: boolean;
  filingId?: string;
  filingStatus?: string;
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  labelTh,
  children,
  meta,
  href,
}: {
  label: string;
  labelTh: string;
  children: React.ReactNode;
  meta?: React.ReactNode;
  href?: string;
}) {
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
      }}
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

// ── Filing type label map ─────────────────────────────────────────────────────

const FILING_TYPE_LABEL: Record<string, string> = {
  PP30: "ภพ.30",
  PND3: "ภงด.3",
  PND53: "ภงด.53",
};

const FILING_STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(200,150,122,0.12)", color: "var(--accent)" },
  FINALIZED: { bg: "rgba(200,160,60,0.12)", color: "#C8A03C" },
  SUBMITTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const FILING_ROUTE: Record<string, string> = {
  PP30: "/tax/pp30",
  PND3: "/tax/pnd3",
  PND53: "/tax/pnd53",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TaxDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [outputVat, setOutputVat] = useState("0");
  const [inputVat, setInputVat] = useState("0");
  const [vatPayable, setVatPayable] = useState("0");
  const [whtTotal, setWhtTotal] = useState(0);
  const [recentFilings, setRecentFilings] = useState<TaxFiling[]>([]);
  const [upcomingFilings, setUpcomingFilings] = useState<UpcomingFiling[]>([]);

  const period = getCurrentPeriodCode();
  const prevPeriod = getPrevPeriodCode();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [previewRes, whtRes, recentRes, currRes, prevRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/tax-filings/pp30/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ period }),
            credentials: "include",
          }),
          fetch(`${API_BASE}/api/v1/tax-filings/wht-certs?period=${period}&page_size=200`, {
            credentials: "include",
          }),
          fetch(`${API_BASE}/api/v1/tax-filings?page_size=5&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/tax-filings?period=${period}&page_size=50`, {
            credentials: "include",
          }),
          fetch(`${API_BASE}/api/v1/tax-filings?period=${prevPeriod}&page_size=50`, {
            credentials: "include",
          }),
        ]);

        const [previewBody, whtBody, recentBody, currBody, prevBody] = await Promise.all([
          previewRes.json(),
          whtRes.json(),
          recentRes.json(),
          currRes.json(),
          prevRes.json(),
        ]);

        // Live VAT for current period
        if (previewBody.success && previewBody.data) {
          setOutputVat(previewBody.data.output_vat ?? "0");
          setInputVat(previewBody.data.input_vat ?? "0");
          setVatPayable(previewBody.data.vat_payable ?? "0");
        }

        // WHT total for current period (active certs only)
        const whtCerts: WhtCertSummary[] = whtBody.data ?? [];
        const totalWht = whtCerts
          .filter((c) => c.status !== "VOID")
          .reduce((acc, c) => acc + parseFloat(c.wht_amount || "0"), 0);
        setWhtTotal(totalWht);

        // Recent 5 filings
        setRecentFilings(recentBody.data ?? []);

        // Upcoming: check current + previous periods for missing SUBMITTED filings
        const now = getBangkokNow();
        const upcoming: UpcomingFiling[] = [];

        for (const [p, filings] of [
          [period, (currBody.data ?? []) as TaxFiling[]],
          [prevPeriod, (prevBody.data ?? []) as TaxFiling[]],
        ] as [string, TaxFiling[]][]) {
          const deadlines = getFilingDeadlines(p);

          // PP30
          const pp30Filed = (filings as TaxFiling[]).find(
            (f) => f.filing_type === "PP30" && f.status === "SUBMITTED",
          );
          if (!pp30Filed) {
            const existing = (filings as TaxFiling[]).find((f) => f.filing_type === "PP30");
            const daysLeft = Math.ceil(
              (deadlines.pp30EFiling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            upcoming.push({
              period: p,
              type: "PP30",
              deadline: deadlines.pp30EFiling,
              daysLeft,
              overdue: daysLeft < 0,
              filingId: existing?.id,
              filingStatus: existing?.status,
            });
          }

          // PND3
          const pnd3Filed = (filings as TaxFiling[]).find(
            (f) => f.filing_type === "PND3" && f.status === "SUBMITTED",
          );
          if (!pnd3Filed) {
            const existing = (filings as TaxFiling[]).find((f) => f.filing_type === "PND3");
            const daysLeft = Math.ceil(
              (deadlines.pnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            upcoming.push({
              period: p,
              type: "PND3",
              deadline: deadlines.pnd,
              daysLeft,
              overdue: daysLeft < 0,
              filingId: existing?.id,
              filingStatus: existing?.status,
            });
          }

          // PND53
          const pnd53Filed = (filings as TaxFiling[]).find(
            (f) => f.filing_type === "PND53" && f.status === "SUBMITTED",
          );
          if (!pnd53Filed) {
            const existing = (filings as TaxFiling[]).find((f) => f.filing_type === "PND53");
            const daysLeft = Math.ceil(
              (deadlines.pnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
            );
            upcoming.push({
              period: p,
              type: "PND53",
              deadline: deadlines.pnd,
              daysLeft,
              overdue: daysLeft < 0,
              filingId: existing?.id,
              filingStatus: existing?.status,
            });
          }
        }

        upcoming.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
        setUpcomingFilings(upcoming);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vatPayableNum = parseFloat(vatPayable);
  const vatIsRefund = vatPayableNum < 0;

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Tax Dashboard"
          description="ภาพรวมภาษี · Tax Overview"
          breadcrumbs={[{ label: "Tax" }, { label: "Dashboard" }]}
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
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-dim)" }} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังโหลด...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader
          title="Tax Dashboard"
          description="ภาพรวมภาษี · Tax Overview"
          breadcrumbs={[{ label: "Tax" }, { label: "Dashboard" }]}
        />
        <div
          style={{
            marginTop: 16,
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tax Dashboard"
        description="ภาพรวมภาษี · Tax Overview"
        breadcrumbs={[{ label: "Tax" }, { label: "Dashboard" }]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/tax/pp30/new"
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
              New ภพ.30
            </Link>
            <Link
              href="/tax/pnd3/new"
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
              <Plus size={12} />
              New ภงด.3
            </Link>
            <Link
              href="/tax/pnd53/new"
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
              <Plus size={12} />
              New ภงด.53
            </Link>
            <Link
              href="/tax/wht-certs"
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
              WHT Certs →
            </Link>
          </div>
        }
      />

      {/* ── 4 stat cards ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginTop: 20,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Output VAT"
          labelTh={`ภาษีขาย ${fmtPeriod(period)}`}
          meta="ยอดสะสมเดือนนี้ (live)"
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            {fmtMoney(outputVat)}
          </div>
        </StatCard>

        <StatCard
          label="Input VAT"
          labelTh={`ภาษีซื้อ ${fmtPeriod(period)}`}
          meta="เฉพาะที่ขอคืนได้ (live)"
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text-credit, #6CB278)",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            {fmtMoney(inputVat)}
          </div>
        </StatCard>

        <StatCard
          label={vatIsRefund ? "VAT Refundable" : "VAT Payable"}
          labelTh={vatIsRefund ? "ภาษีที่ขอคืนได้" : "ภาษีที่ต้องชำระ"}
          href="/tax/pp30/new"
          meta={vatIsRefund ? "ภาษีซื้อ > ภาษีขาย · click to file PP30" : "ภาษีขาย > ภาษีซื้อ · click to file PP30"}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 500,
              color: vatIsRefund ? "var(--text-credit, #6CB278)" : vatPayableNum > 0 ? "var(--error)" : "var(--text-primary)",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            {fmtMoney(Math.abs(vatPayableNum))}
          </div>
        </StatCard>

        <StatCard
          label="WHT This Month"
          labelTh={`หัก ณ ที่จ่าย ${fmtPeriod(period)}`}
          href="/tax/wht-certs"
          meta="ยอดสะสมเดือนนี้ · click for certs"
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1.2,
              marginTop: 4,
            }}
          >
            {fmtMoney(whtTotal)}
          </div>
        </StatCard>
      </div>

      {/* ── Two-column: upcoming filings + recent history ─────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Upcoming / pending filings */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
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
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Upcoming Filings
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                รายการที่ยังไม่ยื่น
              </span>
            </div>
            <Clock size={13} style={{ color: "var(--text-dim)" }} />
          </div>

          {upcomingFilings.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ยื่นครบแล้วทุกรายการ ✓
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Period", "Type", "Deadline", "Days Left"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Days Left" ? "right" : "left",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingFilings.map((row, idx) => {
                  const route = row.filingId
                    ? `${FILING_ROUTE[row.type] ?? "/tax/pp30"}/${row.filingId}`
                    : `${FILING_ROUTE[row.type] ?? "/tax/pp30"}/new`;
                  return (
                    <tr
                      key={`${row.period}-${row.type}`}
                      style={{
                        borderBottom:
                          idx < upcomingFilings.length - 1
                            ? "1px solid var(--border)"
                            : undefined,
                      }}
                    >
                      <td style={{ padding: "9px 12px", fontSize: 12, color: "var(--text-primary)" }}>
                        {fmtPeriod(row.period)}
                        <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{row.period}</div>
                      </td>
                      <td style={{ padding: "9px 12px" }}>
                        <Link
                          href={route}
                          style={{ textDecoration: "none" }}
                        >
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              background: "rgba(200,150,122,0.12)",
                              color: "var(--accent)",
                            }}
                          >
                            {FILING_TYPE_LABEL[row.type] ?? row.type}
                          </span>
                          {row.filingStatus && row.filingStatus !== "SUBMITTED" && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 10,
                                color: "var(--text-dim)",
                              }}
                            >
                              ({row.filingStatus})
                            </span>
                          )}
                        </Link>
                      </td>
                      <td style={{ padding: "9px 12px", fontSize: 11, color: "var(--text-muted)" }}>
                        {row.deadline.toLocaleDateString("th-TH-u-ca-buddhist", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}>
                        {row.overdue ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: "var(--error)",
                            }}
                          >
                            <AlertTriangle size={11} />
                            เกินกำหนด
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: "var(--font-mono)",
                              color: row.daysLeft <= 7 ? "var(--error)" : row.daysLeft <= 14 ? "#C8A03C" : "var(--text-muted)",
                              fontWeight: row.daysLeft <= 7 ? 600 : 400,
                            }}
                          >
                            {row.daysLeft}d
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Deadline legend */}
          <div
            style={{
              padding: "8px 12px",
              borderTop: "1px solid var(--border)",
              fontSize: 10,
              color: "var(--text-dim)",
              display: "flex",
              gap: 16,
            }}
          >
            <span>ภพ.30: ยื่นกระดาษ 15, อิเล็กทรอนิกส์ 23</span>
            <span>ภงด.: ยื่น 7 ของเดือนถัดไป</span>
          </div>
        </div>

        {/* Recent 5 filings */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
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
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                Filing History
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                ประวัติการยื่นล่าสุด
              </span>
            </div>
            <Link
              href="/tax/pp30"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
            >
              View all →
            </Link>
          </div>

          {recentFilings.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ยังไม่มีประวัติการยื่น
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Filing No.", "Type", "Period", "Payable / WHT", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Payable / WHT" ? "right" : "left",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentFilings.map((filing, idx) => {
                  const route = `${FILING_ROUTE[filing.filing_type] ?? "/tax/pp30"}/${filing.id}`;
                  const amountVal = filing.filing_type === "PP30"
                    ? filing.vat_payable
                    : filing.total_wht;
                  const statusStyle =
                    FILING_STATUS_STYLES[filing.status] ?? { bg: "rgba(200,150,122,0.12)", color: "var(--accent)" };
                  return (
                    <tr
                      key={filing.id}
                      style={{
                        borderBottom:
                          idx < recentFilings.length - 1 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          href={route}
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 11,
                            color: "var(--accent)",
                            textDecoration: "none",
                            whiteSpace: "nowrap" as const,
                          }}
                        >
                          {filing.filing_no}
                        </Link>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-primary)" }}>
                        {FILING_TYPE_LABEL[filing.filing_type] ?? filing.filing_type}
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" as const }}>
                        {fmtPeriod(filing.period_code)}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          color: "var(--text-primary)",
                          textAlign: "right",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {amountVal != null ? fmtMoney(amountVal) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 9999,
                            fontSize: 10,
                            fontWeight: 500,
                            background: statusStyle.bg,
                            color: statusStyle.color,
                          }}
                        >
                          {filing.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

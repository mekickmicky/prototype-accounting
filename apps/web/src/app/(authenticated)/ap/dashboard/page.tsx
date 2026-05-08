"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, AlertTriangle, CreditCard } from "lucide-react";
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

function getTodayBangkok(): string {
  const d = getBangkokNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoney(val: string | number): string {
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bill {
  id: string;
  bill_no: string;
  vendor: { id: string; code: string; name: string; name_th: string | null };
  issue_date: string;
  due_date: string;
  total: string;
  status: string;
}

interface Payment {
  id: string;
  withholding_total: string;
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
  rows: AgingVendorRow[];
  totals: AgingTotals;
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

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "var(--text-muted)",
  POSTED: "#6480CC",
  PARTIAL_PAID: "#C8A03C",
  PAID: "#6CB278",
  VOID: "var(--error)",
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function APDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthExpenses, setMonthExpenses] = useState(0);
  const [apBalance, setApBalance] = useState("0");
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueAmount, setOverdueAmount] = useState(0);
  const [monthWht, setMonthWht] = useState(0);
  const [topVendors, setTopVendors] = useState<AgingVendorRow[]>([]);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);

  const period = getCurrentPeriodCode();
  const today = getTodayBangkok();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [billsRes, overdueRes, recentRes, paymentsRes, agingRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/bills?period=${period}&page_size=200&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/bills?overdue=true&page_size=1&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/bills?page_size=5&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/payments?period=${period}&status=POSTED&page_size=200&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/reports/ap-aging?as_of=${today}&branch=ALL&format=json`, { credentials: "include" }),
        ]);

        const [billsBody, overdueBody, recentBody, paymentsBody, agingBody] = await Promise.all([
          billsRes.json(),
          overdueRes.json(),
          recentRes.json(),
          paymentsRes.json(),
          agingRes.json(),
        ]);

        // This month expenses: sum non-DRAFT/VOID bill totals for current period
        const monthBills: Bill[] = billsBody.data ?? [];
        const expenses = monthBills
          .filter((b) => b.status !== "DRAFT" && b.status !== "VOID")
          .reduce((acc, b) => acc + parseFloat(b.total), 0);
        setMonthExpenses(expenses);

        // Overdue count
        setOverdueCount(overdueBody.meta?.total ?? 0);

        // Recent 5 bills
        setRecentBills(recentBody.data ?? []);

        // This month WHT total: sum withholding_total from posted payments
        const payments: Payment[] = paymentsBody.data ?? [];
        const totalWht = payments.reduce((acc, p) => acc + parseFloat(p.withholding_total ?? "0"), 0);
        setMonthWht(totalWht);

        // AP aging: balance + overdue amount + top 5 vendors
        if (agingBody.success && agingBody.data) {
          const aging: ApAgingResult = agingBody.data;
          setApBalance(aging.totals.total);

          const overdueTotal =
            parseFloat(aging.totals.b1_30) +
            parseFloat(aging.totals.b31_60) +
            parseFloat(aging.totals.b61_90) +
            parseFloat(aging.totals.b90plus);
          setOverdueAmount(overdueTotal);

          const top5 = [...aging.rows]
            .filter((r) => parseFloat(r.total) > 0)
            .sort((a, b) => parseFloat(b.total) - parseFloat(a.total))
            .slice(0, 5);
          setTopVendors(top5);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="AP Dashboard"
          description="ภาพรวมเจ้าหนี้ · Accounts Payable"
          breadcrumbs={[{ label: "AP" }, { label: "Dashboard" }]}
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
          title="AP Dashboard"
          description="ภาพรวมเจ้าหนี้ · Accounts Payable"
          breadcrumbs={[{ label: "AP" }, { label: "Dashboard" }]}
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
        title="AP Dashboard"
        description="ภาพรวมเจ้าหนี้ · Accounts Payable"
        breadcrumbs={[{ label: "AP" }, { label: "Dashboard" }]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/ap/bills/new"
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
              New Bill
            </Link>
            <Link
              href="/ap/payments/new"
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
              <CreditCard size={12} />
              New Payment
            </Link>
            <Link
              href="/reports/ap-aging"
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
              AP Aging →
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
          label="This Month Expenses"
          labelTh={`ค่าใช้จ่าย ${period}`}
          meta="Posted bills this period"
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
            {fmtMoney(monthExpenses)}
          </div>
        </StatCard>

        <StatCard
          label="AP Balance"
          labelTh="ยอดเจ้าหนี้คงค้าง"
          href="/reports/ap-aging"
          meta="All open bills · click for aging"
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
            {fmtMoney(apBalance)}
          </div>
        </StatCard>

        <StatCard
          label="Overdue"
          labelTh="เกินกำหนดชำระ"
          href="/reports/ap-aging"
          meta={
            overdueCount > 0 ? (
              <span style={{ color: "var(--error)" }}>
                {overdueCount} bill{overdueCount !== 1 ? "s" : ""} · click for details
              </span>
            ) : (
              "No overdue bills"
            )
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            {overdueCount > 0 && (
              <AlertTriangle size={16} style={{ color: "var(--error)", flexShrink: 0 }} />
            )}
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 22,
                fontWeight: 500,
                color: overdueCount > 0 ? "var(--error)" : "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {fmtMoney(overdueAmount)}
            </div>
          </div>
        </StatCard>

        <StatCard
          label="This Month WHT"
          labelTh={`ภาษีหัก ณ ที่จ่าย ${period}`}
          href="/ap/payments"
          meta="Withholding tax withheld this period"
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
            {fmtMoney(monthWht)}
          </div>
        </StatCard>
      </div>

      {/* ── Two-column: top vendors by AP balance + recent bills ──────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top 5 vendors by AP balance */}
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
                Top Vendors by AP Balance
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                เจ้าหนี้ยอดสูงสุด
              </span>
            </div>
            <Link
              href="/reports/ap-aging"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
            >
              Full Aging →
            </Link>
          </div>

          {topVendors.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ไม่มีเจ้าหนี้คงค้าง
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Vendor", "Current", "1-30d", "31+d", "Total"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Vendor" ? "left" : "right",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topVendors.map((row, idx) => {
                  const b31plus =
                    parseFloat(row.b31_60) + parseFloat(row.b61_90) + parseFloat(row.b90plus);
                  return (
                    <tr
                      key={row.vendor_id}
                      style={{
                        borderBottom:
                          idx < topVendors.length - 1 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          href={`/ap/vendors/${row.vendor_id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-primary)",
                              fontWeight: 500,
                            }}
                          >
                            {row.vendor_name}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                            {row.vendor_code}
                          </div>
                        </Link>
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color:
                            parseFloat(row.current) > 0 ? "var(--text-primary)" : "var(--text-dim)",
                        }}
                      >
                        {parseFloat(row.current) > 0 ? fmtMoney(row.current) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color:
                            parseFloat(row.b1_30) > 0 ? "var(--warning)" : "var(--text-dim)",
                        }}
                      >
                        {parseFloat(row.b1_30) > 0 ? fmtMoney(row.b1_30) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: b31plus > 0 ? "var(--error)" : "var(--text-dim)",
                          fontWeight: b31plus > 0 ? 600 : 400,
                        }}
                      >
                        {b31plus > 0 ? fmtMoney(b31plus) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 12,
                          fontFamily: "var(--font-mono)",
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {fmtMoney(row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent 5 bills */}
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
                Recent Bills
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                บิลล่าสุด
              </span>
            </div>
            <Link
              href="/ap/bills"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
            >
              View all →
            </Link>
          </div>

          {recentBills.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ยังไม่มีบิล
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Bill", "Vendor", "Date", "Total", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Total" ? "right" : "left",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBills.map((bill, idx) => (
                  <tr
                    key={bill.id}
                    style={{
                      borderBottom:
                        idx < recentBills.length - 1 ? "1px solid var(--border)" : undefined,
                    }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <Link
                        href={`/ap/bills/${bill.id}`}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--accent)",
                          textDecoration: "none",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {bill.bill_no}
                      </Link>
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        maxWidth: 130,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {bill.vendor.name_th ?? bill.vendor.name}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {fmtDate(bill.issue_date)}
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
                      {fmtMoney(bill.total)}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 500,
                          background: `${STATUS_COLORS[bill.status] ?? STATUS_COLORS.DRAFT}20`,
                          color: STATUS_COLORS[bill.status] ?? STATUS_COLORS.DRAFT,
                        }}
                      >
                        {bill.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

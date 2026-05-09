"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2, AlertTriangle, Receipt } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import Decimal from "decimal.js";

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

function fmtMoney(val: string | number | Decimal): string {
  const n = new Decimal(val ?? 0).toNumber();
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

interface SalesInvoice {
  id: string;
  invoice_no: string;
  customer: { id: string; code: string; name: string; name_th: string | null };
  issue_date: string;
  total: string;
  status: string;
}

interface ReceiptItem {
  id: string;
  total_amount: string;
}

interface AgingCustomerRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
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

interface AgingResult {
  rows: AgingCustomerRow[];
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

export default function ARDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [monthRevenue, setMonthRevenue] = useState(0);
  const [arBalance, setArBalance] = useState("0");
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueAmount, setOverdueAmount] = useState(0);
  const [monthReceipts, setMonthReceipts] = useState(0);
  const [topOverdue, setTopOverdue] = useState<AgingCustomerRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<SalesInvoice[]>([]);

  const period = getCurrentPeriodCode();
  const today = getTodayBangkok();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [invRes, overdueRes, recentRes, receiptRes, agingRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/sales-invoices?period=${period}&page_size=200&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/sales-invoices?overdue=true&page_size=1&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/sales-invoices?page_size=5&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/receipts?period=${period}&status=POSTED&page_size=200&page=1`, { credentials: "include" }),
          fetch(`${API_BASE}/api/v1/reports/ar-aging?as_of=${today}&branch=ALL&format=json`, { credentials: "include" }),
        ]);

        const [invBody, overdueBody, recentBody, receiptBody, agingBody] = await Promise.all([
          invRes.json(),
          overdueRes.json(),
          recentRes.json(),
          receiptRes.json(),
          agingRes.json(),
        ]);

        // This month revenue: sum non-DRAFT/VOID invoice totals for current period
        const monthInvoices: SalesInvoice[] = invBody.data ?? [];
        const revenue = monthInvoices
          .filter((inv) => inv.status !== "DRAFT" && inv.status !== "VOID")
          .reduce((acc, inv) => acc.plus(new Decimal(inv.total)), new Decimal(0))
          .toNumber();
        setMonthRevenue(revenue);

        // Overdue count
        setOverdueCount(overdueBody.meta?.total ?? 0);

        // Recent 5 invoices
        setRecentInvoices(recentBody.data ?? []);

        // This month receipts total
        const receipts: ReceiptItem[] = receiptBody.data ?? [];
        const totalReceipts = receipts
          .reduce((acc, r) => acc.plus(new Decimal(r.total_amount)), new Decimal(0))
          .toNumber();
        setMonthReceipts(totalReceipts);

        // AR aging
        if (agingBody.success && agingBody.data) {
          const aging: AgingResult = agingBody.data;
          setArBalance(aging.totals.total);

          const overdueTotal = new Decimal(aging.totals.b1_30)
            .plus(new Decimal(aging.totals.b31_60))
            .plus(new Decimal(aging.totals.b61_90))
            .plus(new Decimal(aging.totals.b90plus))
            .toNumber();
          setOverdueAmount(overdueTotal);

          const overdueRows = aging.rows
            .filter((r) =>
              new Decimal(r.b1_30)
                .plus(new Decimal(r.b31_60))
                .plus(new Decimal(r.b61_90))
                .plus(new Decimal(r.b90plus))
                .gt(0)
            )
            .sort((a, b) => new Decimal(b.total).minus(new Decimal(a.total)).toNumber())
            .slice(0, 5);
          setTopOverdue(overdueRows);
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
          title="AR Dashboard"
          description="ภาพรวมลูกหนี้ · Accounts Receivable"
          breadcrumbs={[{ label: "AR" }, { label: "Dashboard" }]}
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
          title="AR Dashboard"
          description="ภาพรวมลูกหนี้ · Accounts Receivable"
          breadcrumbs={[{ label: "AR" }, { label: "Dashboard" }]}
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
        title="AR Dashboard"
        description="ภาพรวมลูกหนี้ · Accounts Receivable"
        breadcrumbs={[{ label: "AR" }, { label: "Dashboard" }]}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/ar/invoices/new"
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
              New Invoice
            </Link>
            <Link
              href="/ar/receipts/new"
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
              <Receipt size={12} />
              New Receipt
            </Link>
            <Link
              href="/reports/ar-aging"
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
              AR Aging →
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
          label="This Month Revenue"
          labelTh={`รายได้ ${period}`}
          meta="Posted invoices this period"
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
            {fmtMoney(monthRevenue)}
          </div>
        </StatCard>

        <StatCard
          label="AR Balance"
          labelTh="ยอดลูกหนี้คงค้าง"
          href="/reports/ar-aging"
          meta="All open invoices · click for aging"
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
            {fmtMoney(arBalance)}
          </div>
        </StatCard>

        <StatCard
          label="Overdue"
          labelTh="เกินกำหนดชำระ"
          href="/reports/ar-aging"
          meta={
            overdueCount > 0 ? (
              <span style={{ color: "var(--error)" }}>
                {overdueCount} invoice{overdueCount !== 1 ? "s" : ""} · click for details
              </span>
            ) : (
              "No overdue invoices"
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
          label="This Month Receipts"
          labelTh={`ใบรับเงิน ${period}`}
          href="/ar/receipts"
          meta="Posted receipts this period"
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
            {fmtMoney(monthReceipts)}
          </div>
        </StatCard>
      </div>

      {/* ── Two-column: top overdue customers + recent invoices ────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top 5 overdue customers */}
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
                Top Overdue Customers
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                ลูกหนี้เกินกำหนด
              </span>
            </div>
            <Link
              href="/reports/ar-aging"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
            >
              Full Aging →
            </Link>
          </div>

          {topOverdue.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ไม่มีลูกหนี้เกินกำหนด
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Customer", "1-30d", "31-60d", "61+d", "Total"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "7px 12px",
                        fontSize: 10,
                        fontWeight: 500,
                        textTransform: "uppercase" as const,
                        letterSpacing: "0.04em",
                        color: "var(--text-muted)",
                        textAlign: h === "Customer" ? "left" : "right",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topOverdue.map((row, idx) => {
                  const b61plus = new Decimal(row.b61_90).plus(new Decimal(row.b90plus));
                  return (
                    <tr
                      key={row.customer_id}
                      style={{
                        borderBottom:
                          idx < topOverdue.length - 1 ? "1px solid var(--border)" : undefined,
                      }}
                    >
                      <td style={{ padding: "8px 12px" }}>
                        <Link
                          href={`/ar/customers/${row.customer_id}`}
                          style={{ textDecoration: "none" }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-primary)",
                              fontWeight: 500,
                            }}
                          >
                            {row.customer_name}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                            {row.customer_code}
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
                            new Decimal(row.b1_30).gt(0) ? "var(--warning)" : "var(--text-dim)",
                        }}
                      >
                        {new Decimal(row.b1_30).gt(0) ? fmtMoney(row.b1_30) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color:
                            new Decimal(row.b31_60).gt(0) ? "var(--error)" : "var(--text-dim)",
                        }}
                      >
                        {new Decimal(row.b31_60).gt(0) ? fmtMoney(row.b31_60) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          textAlign: "right",
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: b61plus.gt(0) ? "var(--error)" : "var(--text-dim)",
                          fontWeight: b61plus.gt(0) ? 600 : 400,
                        }}
                      >
                        {b61plus.gt(0) ? fmtMoney(b61plus) : "—"}
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

        {/* Recent 5 invoices */}
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
                Recent Invoices
              </span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                ใบแจ้งหนี้ล่าสุด
              </span>
            </div>
            <Link
              href="/ar/invoices"
              style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}
            >
              View all →
            </Link>
          </div>

          {recentInvoices.length === 0 ? (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-dim)",
              }}
            >
              ยังไม่มีใบแจ้งหนี้
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Invoice", "Customer", "Date", "Total", "Status"].map((h) => (
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
                {recentInvoices.map((inv, idx) => (
                  <tr
                    key={inv.id}
                    style={{
                      borderBottom:
                        idx < recentInvoices.length - 1 ? "1px solid var(--border)" : undefined,
                    }}
                  >
                    <td style={{ padding: "8px 12px" }}>
                      <Link
                        href={`/ar/invoices/${inv.id}`}
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          color: "var(--accent)",
                          textDecoration: "none",
                          whiteSpace: "nowrap" as const,
                        }}
                      >
                        {inv.invoice_no}
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
                      {inv.customer.name_th ?? inv.customer.name}
                    </td>
                    <td
                      style={{
                        padding: "8px 12px",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap" as const,
                      }}
                    >
                      {fmtDate(inv.issue_date)}
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
                      {fmtMoney(inv.total)}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: 9999,
                          fontSize: 10,
                          fontWeight: 500,
                          background: `${STATUS_COLORS[inv.status] ?? STATUS_COLORS.DRAFT}20`,
                          color: STATUS_COLORS[inv.status] ?? STATUS_COLORS.DRAFT,
                        }}
                      >
                        {inv.status}
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

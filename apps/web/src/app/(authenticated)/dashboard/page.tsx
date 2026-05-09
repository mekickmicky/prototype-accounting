"use client";

import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import { useUser } from "@/lib/use-user";
import { apiClient } from "@/lib/api-client";

function fmtMoney(val: string | number | null | undefined): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function currentPeriod(): string {
  return new Date().toISOString().substring(0, 7);
}

interface AgingTotals {
  totals: { total: string };
}

interface CashPositionData {
  totals: { closing_balance: string };
}

interface Pp30PreviewData {
  vat_payable: string;
}

interface PeriodItem {
  code: string;
  status: string;
}

interface InvoiceItem {
  total: string;
}

interface DashboardData {
  todayRevenue: string | null;
  outstandingAR: string | null;
  outstandingAP: string | null;
  cashOnHand: string | null;
  vatDue: string | null;
  openPeriod: string | null;
}

export default function DashboardPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    async function load() {
      const today = todayISO();
      const period = currentPeriod();

      const [invoicesR, arR, apR, cashR, vatR, periodsR] = await Promise.allSettled([
        apiClient.getPaged<InvoiceItem[]>(
          `/api/v1/sales-invoices?status=POSTED&date_from=${today}&date_to=${today}&page_size=500`,
        ),
        apiClient.get<AgingTotals>(`/api/v1/reports/ar-aging?as_of=${today}`),
        apiClient.get<AgingTotals>(`/api/v1/reports/ap-aging?as_of=${today}`),
        apiClient.get<CashPositionData>(`/api/v1/reports/cash-position?as_of=${today}`),
        apiClient.post<Pp30PreviewData>(`/api/v1/tax-filings/pp30/preview`, { period }),
        apiClient.get<PeriodItem[]>(`/api/v1/periods`),
      ]);

      let todayRevenue: string | null = null;
      if (invoicesR.status === "fulfilled") {
        const sum = invoicesR.value.data.reduce(
          (acc, inv) => acc.plus(new Decimal(inv.total ?? 0)),
          new Decimal(0),
        );
        todayRevenue = sum.toFixed(2);
      }

      setData({
        todayRevenue,
        outstandingAR: arR.status === "fulfilled" ? arR.value.totals.total : null,
        outstandingAP: apR.status === "fulfilled" ? apR.value.totals.total : null,
        cashOnHand: cashR.status === "fulfilled" ? cashR.value.totals.closing_balance : null,
        vatDue: vatR.status === "fulfilled" ? vatR.value.vat_payable : null,
        openPeriod:
          periodsR.status === "fulfilled"
            ? (periodsR.value.find((p) => p.status === "OPEN")?.code ?? null)
            : null,
      });
      setFetching(false);
    }

    load();
  }, []);

  if (userLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "200px",
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
          กำลังโหลด...
        </span>
      </div>
    );
  }

  const cards: Array<{
    label: string;
    labelTh: string;
    value: string | null;
    isMoney: boolean;
  }> = [
    {
      label: "Today's Revenue",
      labelTh: "รายได้วันนี้",
      value: data?.todayRevenue ?? null,
      isMoney: true,
    },
    {
      label: "Accounts Receivable",
      labelTh: "ลูกหนี้คงค้าง",
      value: data?.outstandingAR ?? null,
      isMoney: true,
    },
    {
      label: "Accounts Payable",
      labelTh: "เจ้าหนี้คงค้าง",
      value: data?.outstandingAP ?? null,
      isMoney: true,
    },
    {
      label: "Cash & Bank",
      labelTh: "เงินสดและเงินฝากธนาคาร",
      value: data?.cashOnHand ?? null,
      isMoney: true,
    },
    {
      label: "VAT Due (this period)",
      labelTh: "ภาษีมูลค่าเพิ่มที่ต้องชำระ",
      value: data?.vatDue ?? null,
      isMoney: true,
    },
    {
      label: "Current Period",
      labelTh: "งวดบัญชีปัจจุบัน",
      value: data?.openPeriod ?? null,
      isMoney: false,
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: "var(--s-6)" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "28px",
            fontWeight: 400,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          WIND Accounting
        </h1>
        {user && (
          <p
            style={{
              marginTop: "6px",
              fontSize: "13px",
              color: "var(--text-muted)",
              margin: "6px 0 0",
            }}
          >
            Welcome, {user.name}
          </p>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "var(--s-4)",
          marginBottom: "var(--s-5)",
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              padding: "var(--s-4)",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                marginBottom: "var(--s-2)",
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-dim)",
                marginBottom: "var(--s-2)",
              }}
            >
              {card.labelTh}
            </div>
            {fetching ? (
              <div
                className="animate-pulse"
                style={{
                  height: "30px",
                  width: "70%",
                  background: "var(--border)",
                  borderRadius: "4px",
                }}
              />
            ) : card.value === null ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "24px",
                  color: "var(--text-dim)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                —
              </div>
            ) : card.isMoney ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "24px",
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ฿{fmtMoney(card.value)}
              </div>
            ) : (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "20px",
                  color: "var(--text-primary)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {card.value}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useUser } from "@/lib/use-user";

const PLACEHOLDER_CARDS = [
  {
    label: "Current Period",
    labelTh: "งวดบัญชีปัจจุบัน",
    note: "Available in Phase 2",
  },
  {
    label: "Accounts Receivable",
    labelTh: "ลูกหนี้คงค้าง",
    note: "Available in Phase 3",
  },
  {
    label: "Accounts Payable",
    labelTh: "เจ้าหนี้คงค้าง",
    note: "Available in Phase 4",
  },
  {
    label: "Cash & Bank",
    labelTh: "เงินสดและเงินฝากธนาคาร",
    note: "Available in Phase 6",
  },
] as const;

export default function DashboardPage() {
  const { user, loading } = useUser();

  if (loading) {
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
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "var(--s-4)",
          marginBottom: "var(--s-5)",
        }}
      >
        {PLACEHOLDER_CARDS.map((card) => (
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
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "24px",
                color: "var(--text-dim)",
                marginBottom: "var(--s-1)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              —
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-dim)" }}>
              {card.note}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "var(--s-5)",
          textAlign: "center",
        }}
      >
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-muted)",
            margin: 0,
          }}
        >
          Dashboard data will be available after Phase 2 (GL Core) is complete.
        </p>
      </div>
    </div>
  );
}

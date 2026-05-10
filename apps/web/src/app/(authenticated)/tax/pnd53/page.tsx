"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";
import Decimal from "decimal.js";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { format } from "date-fns";

interface TaxFiling {
  id: string;
  filing_no: string;
  filing_type: string;
  period_code: string;
  status: "DRAFT" | "FINALIZED" | "SUBMITTED" | "VOID";
  withholding_total: string;
  recipient_count: number;
  filed_at: string | null;
  created_at: string;
}

interface ListResponse {
  data: TaxFiling[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(200,150,122,0.12)", color: "var(--accent)" },
  FINALIZED: { bg: "rgba(200,160,60,0.12)", color: "#C8A03C" },
  SUBMITTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

function fmtMoney(val: string | number | null): string {
  if (val === null || val === undefined) return "—";
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPeriod(code: string): string {
  const [year, month] = code.split("-");
  const m = parseInt(month ?? "0", 10);
  const thMonths = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const be = parseInt(year ?? "0", 10) + 543;
  return `${thMonths[m] ?? month} ${be} (${code})`;
}

const TD: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: 12,
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const NUM_TD: React.CSSProperties = {
  ...TD,
  textAlign: "right",
  fontFamily: "var(--font-mono)",
};

export default function PND53ListPage() {
  const [filings, setFilings] = useState<TaxFiling[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ type: "PND53", page: String(page), page_size: String(PAGE_SIZE) });
    apiClient
      .getPaged<TaxFiling[]>(`/api/v1/tax-filings?${qs}`)
      .then((res) => {
        setFilings(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load filings");
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="ภงด.53 — Withholding Tax (Juristic)"
        description="Monthly withholding tax filings for juristic (corporate) vendors"
        breadcrumbs={[{ label: "Tax", href: "/tax/pnd53" }, { label: "ภงด.53" }]}
        actions={
          <Link
            href="/tax/pnd53/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              background: "var(--accent)",
              color: "var(--bg)",
              textDecoration: "none",
              fontFamily: "inherit",
            }}
          >
            <Plus size={13} />
            New ภงด.53
          </Link>
        }
      />

      {error && (
        <div
          style={{
            margin: "16px 0",
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
        {loading ? (
          <Loader2 size={12} className="animate-spin" style={{ display: "inline" }} />
        ) : (
          `${total} filing${total !== 1 ? "s" : ""}`
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
          background: "var(--bg-elevated)",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              {["Filing No.", "Period", "Status", "Total WHT", "Recipients", "Submitted"].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: "8px 12px",
                    fontSize: 11,
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    textAlign: i === 3 ? "right" : "left",
                    borderBottom: "1px solid var(--border)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={`skel-${i}`}>
                {[160, 130, 70, 90, 50, 80].map((w, j) => (
                  <td key={j} style={j === 3 ? NUM_TD : TD}>
                    <div
                      className="animate-pulse"
                      style={{ height: 11, borderRadius: 3, background: "var(--surface)", width: w }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && filings.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: "40px 12px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "var(--text-dim)",
                  }}
                >
                  ไม่พบแบบ ภงด.53 — <Link href="/tax/pnd53/new" style={{ color: "var(--accent)" }}>สร้างใหม่</Link>
                </td>
              </tr>
            )}
            {filings.map((f) => {
              const s = STATUS_STYLES[f.status] ?? STATUS_STYLES["DRAFT"]!;
              return (
                <tr key={f.id} style={{ cursor: "pointer" }}>
                  <td style={TD}>
                    <Link
                      href={`/tax/pnd53/${f.id}`}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        color: "var(--accent)",
                        textDecoration: "none",
                      }}
                    >
                      {f.filing_no}
                    </Link>
                  </td>
                  <td style={TD}>{fmtPeriod(f.period_code)}</td>
                  <td style={TD}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 8px",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 500,
                        background: s.bg,
                        color: s.color,
                      }}
                    >
                      {f.status}
                    </span>
                  </td>
                  <td style={{ ...NUM_TD, color: "var(--accent)", fontWeight: 500 }}>
                    {fmtMoney(f.withholding_total)}
                  </td>
                  <td style={{ ...TD, fontFamily: "var(--font-mono)", textAlign: "center" }}>
                    {f.recipient_count}
                  </td>
                  <td style={{ ...TD, color: "var(--text-muted)", fontSize: 11 }}>
                    {f.filed_at ? format(new Date(f.filed_at), "dd MMM yyyy") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: page === 1 ? "var(--text-dim)" : "var(--text-primary)",
              cursor: page === 1 ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: page >= totalPages ? "var(--text-dim)" : "var(--text-primary)",
              cursor: page >= totalPages ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

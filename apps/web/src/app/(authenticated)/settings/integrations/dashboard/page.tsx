"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, RefreshCw, Activity, Calendar } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { format } from "date-fns";

interface WebhookRow {
  id: string;
  source: string;
  idempotency_key: string;
  result_json: Record<string, unknown>;
  created_at: string;
}

interface LogResponse {
  rows: WebhookRow[];
  stats: { today: number; this_week: number };
  total: number;
  page: number;
  limit: number;
}

const SOURCE_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "wind-clinic", label: "wind-clinic" },
  { value: "wind-stock", label: "wind-stock" },
];

const INPUT_STYLE: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
};

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  cursor: "pointer",
};

const BADGE: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 7px",
  borderRadius: 3,
  fontSize: 11,
  fontWeight: 600,
  fontFamily: "var(--font-mono, monospace)",
};

function SourceBadge({ source }: { source: string }) {
  const isClinic = source === "wind-clinic";
  return (
    <span
      style={{
        ...BADGE,
        background: isClinic ? "rgba(108,178,120,0.15)" : "rgba(100,140,220,0.15)",
        color: isClinic ? "#6CB278" : "#6480CC",
      }}
    >
      {source}
    </span>
  );
}

function ResultSummary({ source, result }: { source: string; result: Record<string, unknown> }) {
  if (source === "wind-clinic") {
    return (
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {result.invoice_no ? (
          <>
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--text-primary)" }}>
              {String(result.invoice_no)}
            </span>
            {" · "}
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--text-primary)" }}>
              {String(result.receipt_no ?? "")}
            </span>
          </>
        ) : (
          <span style={{ color: "var(--text-dim)" }}>—</span>
        )}
      </span>
    );
  }
  if (source === "wind-stock") {
    return (
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {result.period ? (
          <>
            <span style={{ fontFamily: "var(--font-mono, monospace)", color: "var(--text-primary)" }}>
              {String(result.period)}
            </span>
            {" · "}
            {result.created_count as number} JEs
            {result.first_je ? (
              <>
                {" ("}
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {String(result.first_je)}
                </span>
                {".."}
                <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                  {String(result.last_je)}
                </span>
                {")"}
              </>
            ) : null}
          </>
        ) : (
          <span style={{ color: "var(--text-dim)" }}>—</span>
        )}
      </span>
    );
  }
  return <span style={{ fontSize: 12, color: "var(--text-dim)" }}>—</span>;
}

function DocLinks({ source, result }: { source: string; result: Record<string, unknown> }) {
  const router = useRouter();

  if (source === "wind-clinic") {
    const links: Array<{ label: string; href: string }> = [];
    if (result.invoice_no) {
      links.push({ label: String(result.invoice_no), href: `/ar/invoices?q=${result.invoice_no}` });
    }
    if (result.receipt_no) {
      links.push({ label: String(result.receipt_no), href: `/ar/receipts?q=${result.receipt_no}` });
    }
    if (!links.length) return null;
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {links.map((l) => (
          <button
            key={l.href}
            type="button"
            onClick={() => router.push(l.href)}
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            {l.label}
          </button>
        ))}
      </div>
    );
  }

  if (source === "wind-stock" && result.first_je) {
    return (
      <button
        type="button"
        onClick={() => router.push(`/gl/journal-entries?q=${result.first_je}`)}
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono, monospace)",
          color: "var(--accent)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
        }}
      >
        {String(result.first_je)}
      </button>
    );
  }

  return null;
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 160,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "rgba(var(--accent-rgb, 184,134,100), 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon size={16} style={{ color: "var(--accent)" }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

export default function WebhookDashboardPage() {
  const [source, setSource] = useState("");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LogResponse | null>(null);
  const [page, setPage] = useState(1);
  const limit = 50;

  // Tracks filters from the last executed load — pagination and refresh reuse them
  const appliedRef = useRef({ source, from, to });

  const load = useCallback(async (pg: number) => {
    const { source: src, from: f, to: t } = appliedRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(limit) });
      if (src) params.set("source", src);
      if (f) params.set("from", f);
      if (t) params.set("to", t + "T23:59:59");
      const result = await apiClient.get<LogResponse>(
        `/api/v1/settings/integrations/log?${params}`
      );
      setData(result);
      setPage(pg);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load webhook log");
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads appliedRef, does not depend on filter state

  useEffect(() => { void load(1); }, [load]); // mount-only; Apply button triggers reloads

  return (
    <div style={{ maxWidth: 1100 }}>
      <PageHeader
        title="Webhook Dashboard"
        description="ประวัติการรับ webhook จาก wind-clinic และ wind-stock"
        breadcrumbs={[{ label: "Settings" }, { label: "Integrations" }, { label: "Dashboard" }]}
        actions={
          <button
            type="button"
            onClick={() => void load(page)}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 32,
              padding: "0 12px",
              border: "1px solid var(--border-strong)",
              borderRadius: 4,
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 12,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            รีเฟรช
          </button>
        }
      />

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <StatCard
          label="Webhooks today"
          value={data?.stats.today ?? 0}
          icon={Activity}
        />
        <StatCard
          label="Webhooks this week"
          value={data?.stats.this_week ?? 0}
          icon={Calendar}
        />
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <select
          style={{ ...SELECT_STYLE, width: 160 }}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {SOURCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ตั้งแต่</span>
          <input
            type="date"
            style={{ ...INPUT_STYLE, width: 140 }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>ถึง</span>
          <input
            type="date"
            style={{ ...INPUT_STYLE, width: 140 }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            appliedRef.current = { source, from, to };
            void load(1);
          }}
          style={{
            height: 32,
            padding: "0 14px",
            borderRadius: 4,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Apply
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "var(--color-danger, #ef4444)",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["เวลา", "Source", "Idempotency Key", "สรุปผล", "เอกสาร"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 14px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    background: "var(--bg-elevated)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "40px 14px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  <Loader2 size={16} className="animate-spin" style={{ display: "inline", marginRight: 8 }} />
                  กำลังโหลด...
                </td>
              </tr>
            )}
            {!loading && (!data || data.rows.length === 0) && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: "40px 14px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  ไม่พบข้อมูล webhook ในช่วงเวลาที่เลือก
                </td>
              </tr>
            )}
            {!loading &&
              data?.rows.map((row) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      "var(--bg-elevated)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background = "")
                  }
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {format(new Date(row.created_at), "dd MMM yyyy HH:mm:ss")}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <SourceBadge source={row.source} />
                  </td>
                  <td
                    style={{
                      padding: "10px 14px",
                      fontSize: 11,
                      fontFamily: "var(--font-mono, monospace)",
                      color: "var(--text-muted)",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={row.idempotency_key}
                  >
                    {row.idempotency_key}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <ResultSummary
                      source={row.source}
                      result={row.result_json as Record<string, unknown>}
                    />
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <DocLinks
                      source={row.source}
                      result={row.result_json as Record<string, unknown>}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {data && data.rows.length > 0 && (
          <div
            style={{
              padding: "8px 14px",
              fontSize: 11,
              color: "var(--text-dim)",
              borderTop: "1px solid var(--border)",
            }}
          >
            แสดง {data.rows.length} จาก {data.total} รายการ
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > limit && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Page {page} of {Math.max(1, Math.ceil(data.total / limit))}
          </span>
          <button
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
            style={{
              height: 28, padding: "0 12px", borderRadius: 4,
              border: "1px solid var(--border-strong)", background: "transparent",
              color: "var(--text-muted)", fontSize: 12,
              cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            Prev
          </button>
          <button
            disabled={page >= Math.ceil(data.total / limit) || loading}
            onClick={() => void load(page + 1)}
            style={{
              height: 28, padding: "0 12px", borderRadius: 4,
              border: "1px solid var(--border-strong)", background: "transparent",
              color: "var(--text-muted)", fontSize: 12,
              cursor: page >= Math.ceil(data.total / limit) ? "not-allowed" : "pointer",
              opacity: page >= Math.ceil(data.total / limit) ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

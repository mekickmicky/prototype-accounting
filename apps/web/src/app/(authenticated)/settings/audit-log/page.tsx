"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, RefreshCw, Shield, ShieldAlert, Activity } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { format } from "date-fns";

interface AuditRow {
  id: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  after_json: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
}

interface AuditLogResponse {
  rows: AuditRow[];
  total: number;
  page: number;
  limit: number;
}

const ALL_ACTIONS = [
  "WEBHOOK_RECEIVED",
  "WEBHOOK_REJECTED",
  "POST",
  "VOID",
  "CREATE",
  "UPDATE",
  "DELETE",
  "PERIOD_CLOSE",
  "PERIOD_REOPEN",
  "LOGIN",
  "EXPORT",
  "IMPORT",
];

const ACTION_BADGE: Record<string, { color: string; bg: string; label: string }> = {
  WEBHOOK_RECEIVED: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Received" },
  WEBHOOK_REJECTED: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Rejected" },
  POST: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: "Post" },
  VOID: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Void" },
  CREATE: { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", label: "Create" },
  UPDATE: { color: "#06b6d4", bg: "rgba(6,182,212,0.12)", label: "Update" },
  DELETE: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Delete" },
  PERIOD_CLOSE: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", label: "Period Close" },
  PERIOD_REOPEN: { color: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "Period Reopen" },
  LOGIN: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", label: "Login" },
  EXPORT: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", label: "Export" },
  IMPORT: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", label: "Import" },
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_BADGE[action] ?? { color: "var(--text-muted)", bg: "var(--bg-elevated)", label: action };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: style.color,
        background: style.bg,
        fontFamily: "var(--font-mono, monospace)",
        whiteSpace: "nowrap",
      }}
    >
      {action}
    </span>
  );
}

function ResultSummary({ row }: { row: AuditRow }) {
  if (row.action === "WEBHOOK_RECEIVED" && row.after_json && typeof row.after_json === "object") {
    const data = row.after_json as Record<string, unknown>;
    const parts: string[] = [];
    if (data.invoice_no) parts.push(`INV: ${data.invoice_no}`);
    if (data.receipt_no) parts.push(`RCT: ${data.receipt_no}`);
    if (data.created_count) parts.push(`${data.created_count} JEs`);
    if (data.period) parts.push(`Period: ${data.period}`);
    if (data.replayed) parts.push("(replayed)");
    return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{parts.join(" · ") || "—"}</span>;
  }
  if (row.action === "WEBHOOK_REJECTED") {
    return (
      <span style={{ color: "#ef4444", fontSize: 12 }}>
        {row.reason ?? "rejected"} {row.ip_address ? `from ${row.ip_address}` : ""}
      </span>
    );
  }
  return <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>;
}

const SURFACE: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
};

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const limit = 50;

  // Tracks the filters from the last executed load — pagination reuses them without auto-fetching
  const appliedFiltersRef = useRef({ action: "", from: "", to: "" });

  const load = useCallback(async (pg: number) => {
    const { action, from, to } = appliedFiltersRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(limit) });
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const data = await apiClient.get<AuditLogResponse>(`/api/v1/settings/audit-log?${params}`);
      setRows(data.rows);
      setTotal(data.total);
      setPage(data.page);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, []); // stable — reads appliedFiltersRef, does not depend on filter state

  useEffect(() => { void load(1); }, [load]); // mount-only; Filter button applies new filters

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const webhookCount = rows.filter((r) => r.action === "WEBHOOK_RECEIVED").length;
  const rejectedCount = rows.filter((r) => r.action === "WEBHOOK_REJECTED").length;

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1100 }}>
      <PageHeader
        title="Audit Log"
        description="System activity and webhook events"
      />

      {/* Stats row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { icon: Activity, label: "Total (page)", value: rows.length, color: "var(--text-primary)" },
          { icon: Shield, label: "Webhooks received (this page)", value: webhookCount, color: "#22c55e" },
          { icon: ShieldAlert, label: "Webhooks rejected (this page)", value: rejectedCount, color: "#ef4444" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} style={{ ...SURFACE, padding: "12px 16px", minWidth: 160, display: "flex", alignItems: "center", gap: 10 }}>
            <Icon size={18} color={color} strokeWidth={1.5} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ ...SURFACE, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{
            height: 30, padding: "0 8px", border: "1px solid var(--border-strong)",
            borderRadius: 4, background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12,
          }}
        >
          <option value="">All actions</option>
          {ALL_ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          placeholder="From"
          style={{
            height: 30, padding: "0 8px", border: "1px solid var(--border-strong)",
            borderRadius: 4, background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12,
          }}
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          placeholder="To"
          style={{
            height: 30, padding: "0 8px", border: "1px solid var(--border-strong)",
            borderRadius: 4, background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12,
          }}
        />
        <button
          onClick={() => {
            appliedFiltersRef.current = { action: filterAction, from: filterFrom, to: filterTo };
            void load(1);
          }}
          style={{
            height: 30, padding: "0 14px", borderRadius: 4, border: "none",
            background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}
        >
          Filter
        </button>
        <button
          onClick={() => {
            setFilterAction("");
            setFilterFrom("");
            setFilterTo("");
            appliedFiltersRef.current = { action: "", from: "", to: "" };
            void load(1);
          }}
          style={{
            height: 30, padding: "0 12px", borderRadius: 4,
            border: "1px solid var(--border-strong)", background: "transparent",
            color: "var(--text-muted)", fontSize: 12, cursor: "pointer",
          }}
        >
          Clear
        </button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {total} total
          </span>
          <button
            onClick={() => void load(page)}
            disabled={loading}
            style={{
              height: 28, width: 28, display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid var(--border-strong)", borderRadius: 4, background: "transparent", cursor: "pointer",
            }}
          >
            <RefreshCw size={13} color="var(--text-muted)" className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...SURFACE, overflow: "hidden" }}>
        {loading && rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Loader2 size={20} color="var(--text-dim)" style={{ display: "inline-block" }} />
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: "#ef4444", fontSize: 13 }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
            No audit entries found
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Timestamp", "Action", "Entity", "Source / Result", "Actor", "IP"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600,
                      color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em",
                      background: "var(--bg-elevated)",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {format(new Date(row.created_at), "dd MMM yyyy HH:mm:ss")}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <ActionBadge action={row.action} />
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)", marginRight: 4 }}>{row.entity_type}</span>
                    <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono, monospace)" }}>
                      {row.entity_id.length > 30 ? row.entity_id.slice(0, 28) + "…" : row.entity_id}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px", maxWidth: 300 }}>
                    <ResultSummary row={row} />
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                    {row.actor_name ?? <span style={{ color: "var(--text-dim)" }}>system</span>}
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono, monospace)" }}>
                    {row.ip_address ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1)}
            style={{
              height: 28, padding: "0 12px", borderRadius: 4,
              border: "1px solid var(--border-strong)", background: "transparent",
              color: "var(--text-muted)", fontSize: 12, cursor: page <= 1 ? "not-allowed" : "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1)}
            style={{
              height: 28, padding: "0 12px", borderRadius: 4,
              border: "1px solid var(--border-strong)", background: "transparent",
              color: "var(--text-muted)", fontSize: 12, cursor: page >= totalPages ? "not-allowed" : "pointer",
              opacity: page >= totalPages ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

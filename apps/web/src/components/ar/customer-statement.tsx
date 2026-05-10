"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, FileDown } from "lucide-react";

const API_BASE = "";

type DocType = "INVOICE" | "RECEIPT";

interface StatementLine {
  date: string;
  doc_type: DocType;
  document_no: string;
  document_id: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
  status: string;
}

interface StatementData {
  customer_id: string;
  date_from: string | null;
  date_to: string | null;
  lines: StatementLine[];
  closing_balance: string;
}

async function fetchStatement(
  customerId: string,
  dateFrom: string,
  dateTo: string,
): Promise<StatementData> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const url = `${API_BASE}/api/v1/customers/${customerId}/statement?${params.toString()}`;
  const res = await fetch(url, { credentials: "include" });
  const body = await res.json();
  if (!body.success) throw new Error(body.error?.message ?? "Failed to load statement");
  return body.data as StatementData;
}

function fmt(v: string): string {
  const n = parseFloat(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 12 };
const CELL: React.CSSProperties = { padding: "7px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" };

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "POSTED" || status === "PAID"
      ? "#6CB278"
      : status === "PARTIAL_PAID"
      ? "#d4a017"
      : status === "VOID"
      ? "var(--text-dim)"
      : "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 6px",
        borderRadius: 9999,
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {status}
    </span>
  );
}

interface CustomerStatementProps {
  customerId: string;
  customerName: string;
}

export function CustomerStatement({ customerId, customerName }: CustomerStatementProps) {
  const router = useRouter();

  const today = new Date().toISOString().slice(0, 10);
  const yearStart = today.slice(0, 4) + "-01-01";

  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(today);
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchStatement(customerId, dateFrom, dateTo);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load statement");
    } finally {
      setLoading(false);
    }
  }, [customerId, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  function handleRowClick(line: StatementLine) {
    if (line.doc_type === "INVOICE") {
      router.push(`/ar/invoices/${line.document_id}`);
    } else {
      router.push(`/ar/receipts/${line.document_id}`);
    }
  }

  function exportCsv() {
    if (!data) return;
    const header = ["Date", "Type", "Document No", "Description", "Status", "Debit", "Credit", "Balance"];
    const rows = data.lines.map((l) => [
      l.date,
      l.doc_type,
      l.document_no,
      l.description,
      l.status,
      l.debit,
      l.credit,
      l.running_balance,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `statement-${customerId}-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const closingBalance = data ? parseFloat(data.closing_balance) : 0;
  const balanceColor = closingBalance > 0 ? "var(--error)" : "var(--text-primary)";

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "16px 20px",
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
          paddingBottom: 10,
          borderBottom: "1px solid var(--border)",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
          ใบแสดงยอด · Customer Statement
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                padding: "4px 8px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
              }}
            />
          </div>
          <button
            onClick={exportCsv}
            disabled={!data || data.lines.length === 0}
            title="Export CSV"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              fontSize: 11,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
              opacity: !data || data.lines.length === 0 ? 0.5 : 1,
            }}
          >
            <FileDown size={12} />
            Export
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 0", color: "var(--text-muted)" }}>
          <Loader2 size={14} className="animate-spin" />
          <span style={{ fontSize: 12 }}>กำลังโหลด...</span>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {data.lines.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "12px 0" }}>
              ไม่มีรายการในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: "var(--bg-base)" }}>
                    <th style={{ ...CELL, textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      วันที่
                    </th>
                    <th style={{ ...CELL, textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      ประเภท
                    </th>
                    <th style={{ ...CELL, textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      เลขที่เอกสาร
                    </th>
                    <th style={{ ...CELL, textAlign: "left", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      สถานะ
                    </th>
                    <th style={{ ...CELL, textAlign: "right", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      เดบิต
                    </th>
                    <th style={{ ...CELL, textAlign: "right", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      เครดิต
                    </th>
                    <th style={{ ...CELL, textAlign: "right", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                      ยอดคงเหลือ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((line, idx) => (
                    <tr
                      key={idx}
                      onClick={() => handleRowClick(line)}
                      style={{
                        cursor: "pointer",
                        transition: "background 0.1s",
                        opacity: line.status === "VOID" ? 0.55 : 1,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover, rgba(255,255,255,0.04))")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td style={{ ...CELL, ...MONO }}>{line.date}</td>
                      <td style={{ ...CELL }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            background:
                              line.doc_type === "INVOICE"
                                ? "rgba(180,130,60,0.15)"
                                : "rgba(108,178,120,0.15)",
                            color:
                              line.doc_type === "INVOICE" ? "#b4823c" : "#6CB278",
                          }}
                        >
                          {line.doc_type === "INVOICE" ? "Invoice" : "Receipt"}
                        </span>
                      </td>
                      <td style={{ ...CELL, ...MONO }}>{line.document_no}</td>
                      <td style={{ ...CELL }}>
                        <StatusBadge status={line.status} />
                      </td>
                      <td style={{ ...CELL, ...MONO, textAlign: "right" }}>
                        {parseFloat(line.debit) > 0 ? fmt(line.debit) : ""}
                      </td>
                      <td style={{ ...CELL, ...MONO, textAlign: "right" }}>
                        {parseFloat(line.credit) > 0 ? fmt(line.credit) : ""}
                      </td>
                      <td
                        style={{
                          ...CELL,
                          ...MONO,
                          textAlign: "right",
                          fontWeight: 600,
                          color:
                            parseFloat(line.running_balance) > 0
                              ? "var(--error)"
                              : "var(--text-primary)",
                        }}
                      >
                        {fmt(line.running_balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: "var(--bg-base)", borderTop: "2px solid var(--border-strong)" }}>
                    <td
                      colSpan={6}
                      style={{
                        ...CELL,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--text-muted)",
                        borderBottom: "none",
                      }}
                    >
                      ยอดคงเหลือสุทธิ · Closing Balance
                    </td>
                    <td
                      style={{
                        ...CELL,
                        ...MONO,
                        textAlign: "right",
                        fontSize: 14,
                        fontWeight: 700,
                        color: balanceColor,
                        borderBottom: "none",
                      }}
                    >
                      {fmt(data.closing_balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

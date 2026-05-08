"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, X, Loader2, Eye, ChevronDown } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface BankAccount {
  id: string;
  code: string;
  name: string;
  bank_name: string;
  account_number: string | null;
}

interface ImportResult {
  imported: number;
  skipped: number;
}

type SourceType = "mock" | "csv";

interface CsvPreviewRow {
  cells: string[];
}

function parseCsvPreview(csv: string, maxRows = 10): { headers: string[]; rows: CsvPreviewRow[] } {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  const headers = splitCsvLine(lines[0]!);
  const rows = lines
    .slice(1, maxRows + 1)
    .map((l) => ({ cells: splitCsvLine(l) }));

  return { headers, rows };
}

function maskAccountNo(no: string | null): string {
  if (!no) return "";
  if (no.length <= 4) return no;
  return "****" + no.slice(-4);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

const LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-muted)",
  marginBottom: 5,
  display: "block",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box" as const,
};

function BankImportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedAccountId = searchParams.get("account_id") ?? "";

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [selectedAccountId, setSelectedAccountId] = useState(preselectedAccountId);
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [source, setSource] = useState<SourceType>("mock");
  const [csvContent, setCsvContent] = useState("");

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: CsvPreviewRow[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const result = await apiClient.get<BankAccount[] | { data: BankAccount[] }>(
        "/api/v1/bank-accounts?page=1&page_size=100",
      );
      const list = Array.isArray(result) ? result : (result as { data: BankAccount[] }).data ?? [];
      setAccounts(list);
      if (!preselectedAccountId && list.length > 0) {
        setSelectedAccountId(list[0]!.id);
      }
    } catch {
      // non-blocking
    } finally {
      setLoadingAccounts(false);
    }
  }, [preselectedAccountId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function handlePreview() {
    setPreviewError(null);
    if (source === "mock") {
      setPreviewData({ headers: [], rows: [] });
      setPreviewOpen(true);
      return;
    }
    if (!csvContent.trim()) {
      setPreviewError("Paste CSV content first.");
      return;
    }
    const parsed = parseCsvPreview(csvContent, 10);
    if (parsed.headers.length === 0) {
      setPreviewError("Could not parse CSV — no header row found.");
      return;
    }
    setPreviewData(parsed);
    setPreviewOpen(true);
  }

  async function handleImport() {
    if (!selectedAccountId) {
      setImportError("Select a bank account.");
      return;
    }
    if (!dateFrom || !dateTo) {
      setImportError("Select a date range.");
      return;
    }
    if (source === "csv" && !csvContent.trim()) {
      setImportError("Paste CSV content to import.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const body: Record<string, unknown> = {
        bank_account_id: selectedAccountId,
        date_from: dateFrom,
        date_to: dateTo,
      };
      if (source === "mock") {
        body.use_mock_data = true;
      } else {
        body.csv_content = csvContent;
      }

      const result = await apiClient.post<ImportResult>("/api/v1/bank/import", body);
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function handleGoToReconcile() {
    if (selectedAccountId) {
      router.push(`/bank/reconcile/${selectedAccountId}`);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
          <a href="/bank/accounts" style={{ color: "inherit", textDecoration: "none" }}>Bank</a>
          {" / "}
          <span>Import Statement</span>
        </nav>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1.2,
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          นำเข้าข้อมูลธนาคาร
        </h1>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
          Import Bank Statement · Mock or CSV
        </div>
      </div>

      {/* Form card */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "20px 24px",
        }}
      >
        {/* Section label */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted)",
            marginBottom: 18,
            paddingBottom: 8,
            borderBottom: "1px solid var(--border)",
          }}
        >
          Import Configuration
        </div>

        {/* Bank account picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>Bank Account</label>
          <div style={{ position: "relative" }}>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              disabled={loadingAccounts}
              style={{
                ...INPUT,
                appearance: "none",
                paddingRight: 30,
                cursor: loadingAccounts ? "wait" : "pointer",
                opacity: loadingAccounts ? 0.6 : 1,
              }}
            >
              <option value="">
                {loadingAccounts ? "Loading accounts…" : "Select bank account…"}
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} · {a.name}
                  {a.account_number ? ` (${maskAccountNo(a.account_number)})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
          </div>
        </div>

        {/* Date range */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={LABEL}>Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={INPUT}
            />
          </div>
          <div>
            <label style={LABEL}>Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={INPUT}
            />
          </div>
        </div>

        {/* Source radios */}
        <div style={{ marginBottom: source === "csv" ? 12 : 0 }}>
          <label style={LABEL}>Source</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(
              [
                { value: "mock", label: "Generate mock data", desc: "prototype only" },
                { value: "csv", label: "Paste CSV", desc: "KBank / SCB / BBL format" },
              ] as const
            ).map(({ value, label, desc }) => (
              <label
                key={value}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  padding: "8px 12px",
                  borderRadius: 4,
                  border: `1px solid ${source === value ? "var(--accent)" : "var(--border)"}`,
                  background: source === value ? "rgba(180,140,90,0.06)" : "transparent",
                }}
              >
                <input
                  type="radio"
                  name="source"
                  value={value}
                  checked={source === value}
                  onChange={() => setSource(value)}
                  style={{ accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                  {label}
                  <span
                    style={{
                      marginLeft: 7,
                      fontSize: 10,
                      color: "var(--text-dim)",
                      fontStyle: "italic",
                    }}
                  >
                    ({desc})
                  </span>
                </span>
              </label>
            ))}

            {/* XLSX — deferred */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "not-allowed",
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "transparent",
                opacity: 0.4,
              }}
            >
              <input type="radio" name="source" disabled style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                Upload XLSX file
                <span style={{ marginLeft: 7, fontSize: 10, color: "var(--text-dim)", fontStyle: "italic" }}>
                  (coming soon)
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* CSV textarea */}
        {source === "csv" && (
          <div style={{ marginTop: 12 }}>
            <label style={LABEL}>CSV Content</label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              placeholder={
                "Date,Time,Description,Debit,Credit,Balance\n" +
                "07/05/2026,09:15,TRF FROM 0123-45-6789 / SOMCHAI,,5350.00,125640.00\n..."
              }
              rows={8}
              style={{
                ...INPUT,
                resize: "vertical",
                lineHeight: 1.5,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
              }}
            />
          </div>
        )}

        {/* Validation / import error */}
        {(importError || previewError) && (
          <div
            style={{
              marginTop: 14,
              padding: "9px 13px",
              background: "rgba(184,92,80,0.1)",
              border: "1px solid var(--error)",
              borderRadius: 4,
              fontSize: 12,
              color: "var(--error)",
            }}
          >
            {importError ?? previewError}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 20,
            paddingTop: 16,
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick={handlePreview}
            disabled={importing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: importing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: importing ? 0.6 : 1,
            }}
          >
            <Eye size={13} />
            Preview
          </button>

          <button
            onClick={handleImport}
            disabled={importing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: importing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: importing ? 0.7 : 1,
            }}
          >
            {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      {/* Import result */}
      {importResult && (
        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "rgba(108,178,120,0.08)",
            border: "1px solid rgba(108,178,120,0.4)",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#6CB278",
              marginBottom: 10,
            }}
          >
            Import Complete
          </div>
          <div style={{ display: "flex", gap: 32, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1 }}>
                {importResult.imported.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>new transactions imported</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-dim)", lineHeight: 1 }}>
                {importResult.skipped.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>duplicates skipped</div>
            </div>
          </div>
          <button
            onClick={handleGoToReconcile}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Go to Reconciliation →
          </button>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && previewData && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 24,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              width: "100%",
              maxWidth: 820,
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>
                  Preview
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {source === "mock"
                    ? "Mock data will be generated for the selected date range"
                    : `First ${previewData.rows.length} rows of parsed CSV`}
                </div>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: 4,
                  lineHeight: 1,
                  display: "flex",
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ overflow: "auto", flex: 1 }}>
              {source === "mock" ? (
                <div
                  style={{
                    padding: "28px 24px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🏦</div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)", marginBottom: 6 }}>
                    Mock data preview
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Deterministic transactions will be generated for{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {dateFrom} → {dateTo}
                    </strong>
                    .<br />
                    Click <strong>Import</strong> to insert them into the database.
                  </div>
                </div>
              ) : previewData.headers.length === 0 ? (
                <div style={{ padding: "24px", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
                  No rows parsed.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--bg-base)" }}>
                      {previewData.headers.map((h, i) => (
                        <th
                          key={i}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontSize: 10,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            color: "var(--text-muted)",
                            borderBottom: "1px solid var(--border)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        style={{
                          background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        {row.cells.map((cell, ci) => (
                          <td
                            key={ci}
                            style={{
                              padding: "7px 12px",
                              color: "var(--text-primary)",
                              fontFamily:
                                previewData.headers[ci]?.toLowerCase().includes("amount") ||
                                previewData.headers[ci]?.toLowerCase().includes("debit") ||
                                previewData.headers[ci]?.toLowerCase().includes("credit") ||
                                previewData.headers[ci]?.toLowerCase().includes("balance")
                                  ? "var(--font-mono)"
                                  : "inherit",
                              maxWidth: 200,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {cell || <span style={{ color: "var(--text-dim)" }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => setPreviewOpen(false)}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setPreviewOpen(false);
                  handleImport();
                }}
                disabled={importing}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: importing ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: importing ? 0.7 : 1,
                }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BankImportPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
          <Loader2 size={16} className="animate-spin" />
          <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
        </div>
      }
    >
      <BankImportPageInner />
    </Suspense>
  );
}

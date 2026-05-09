"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, FileDown, CheckCircle2, Send } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { KBANK_CURRENT_CODE, VAT_RECEIVABLE_CODE, VAT_REFUNDABLE_CODE, VAT_PAYABLE_CODE } from "@/lib/account-codes";

interface TaxFiling {
  id: string;
  filing_no: string;
  filing_type: string;
  period_code: string;
  status: "DRAFT" | "FINALIZED" | "SUBMITTED" | "VOID";
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  je_id: string | null;
  filed_at: string | null;
  created_at: string;
}

interface VatRegisterRow {
  id: string;
  vat_type: "INPUT" | "OUTPUT";
  txn_date: string;
  tax_invoice_no: string | null;
  counterparty_name: string;
  net_amount: string;
  vat_amount: string;
  claimable: boolean;
}

interface PP30Aggregate {
  period_code: string;
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  output_rows: VatRegisterRow[];
  input_rows: VatRegisterRow[];
  non_claimable_rows: VatRegisterRow[];
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(200,150,122,0.12)", color: "var(--accent)" },
  FINALIZED: { bg: "rgba(200,160,60,0.12)", color: "#C8A03C" },
  SUBMITTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

function fmtMoney(val: string | number): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}

function fmtPeriod(code: string): string {
  const [year, month] = code.split("-");
  const m = parseInt(month ?? "0", 10);
  const thMonths = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const be = parseInt(year ?? "0", 10) + 543;
  return `${thMonths[m] ?? month} ${be}`;
}

const TH: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 500,
  color: "var(--text-muted)",
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};

const TD: React.CSSProperties = {
  padding: "7px 10px",
  fontSize: 12,
  borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};

const NUM_TD: React.CSSProperties = { ...TD, textAlign: "right", fontFamily: "var(--font-mono)" };

type FilingStep = { label: string; state: "done" | "active" | "pending" };

function getSteps(status: string): FilingStep[] {
  const steps: Array<{ label: string; doneIf: string[] }> = [
    { label: "1. Aggregate VAT register", doneIf: ["DRAFT", "FINALIZED", "SUBMITTED"] },
    { label: "2. Review & finalize", doneIf: ["FINALIZED", "SUBMITTED"] },
    { label: "3. Generate PDF", doneIf: ["FINALIZED", "SUBMITTED"] },
    { label: "4. Submit to RD", doneIf: ["SUBMITTED"] },
    { label: "5. Mark submitted & post closing JE", doneIf: ["SUBMITTED"] },
  ];

  const activeIdx =
    status === "DRAFT" ? 1 : status === "FINALIZED" ? 2 : status === "SUBMITTED" ? 4 : 0;

  return steps.map((s, i) => ({
    label: s.label,
    state: s.doneIf.includes(status)
      ? "done"
      : i === activeIdx
      ? "active"
      : "pending",
  }));
}

export default function PP30DetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const filingId = params.id;

  const [filing, setFiling] = useState<TaxFiling | null>(null);
  const [aggregate, setAggregate] = useState<PP30Aggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Flag non-claimable state (DRAFT only)
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [flagging, setFlagging] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  // Finalize state
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  // Submit state
  const [submissionDate, setSubmissionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [submissionRef, setSubmissionRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const f = await apiClient.get<TaxFiling>(`/api/v1/tax-filings/${filingId}`);
      setFiling(f);

      // Load live aggregate for DRAFT/FINALIZED; for SUBMITTED we use snapshot
      if (f.status !== "SUBMITTED") {
        const agg = await apiClient.post<PP30Aggregate>("/api/v1/tax-filings/pp30/preview", {
          period: f.period_code,
        });
        setAggregate(agg);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load filing");
    } finally {
      setLoading(false);
    }
  }, [filingId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApplyFlags() {
    if (!filing || flagged.size === 0) return;
    setFlagging(true);
    setFlagError(null);
    try {
      const updated = await apiClient.post<TaxFiling>(
        `/api/v1/tax-filings/${filingId}/flag-non-claimable`,
        { vat_register_ids: Array.from(flagged) }
      );
      setFiling(updated);
      setFlagged(new Set());
      // Refresh aggregate
      const agg = await apiClient.post<PP30Aggregate>("/api/v1/tax-filings/pp30/preview", {
        period: updated.period_code,
      });
      setAggregate(agg);
    } catch (err) {
      setFlagError(err instanceof ApiError ? err.message : "Failed to flag rows");
    } finally {
      setFlagging(false);
    }
  }

  async function handleFinalize() {
    if (!filing) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const updated = await apiClient.post<TaxFiling>(`/api/v1/tax-filings/${filingId}/finalize`);
      setFiling(updated);
    } catch (err) {
      setFinalizeError(err instanceof ApiError ? err.message : "Failed to finalize");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleSubmit() {
    if (!filing || !submissionRef.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const updated = await apiClient.post<TaxFiling>(`/api/v1/tax-filings/${filingId}/submit`, {
        submission_date: submissionDate,
        submission_ref: submissionRef.trim(),
      });
      setFiling(updated);
      // Reload to clear aggregate (now read-only from snapshot)
      await load();
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 40, justifyContent: "center" }}>
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-dim)" }} />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Loading...</span>
      </div>
    );
  }

  if (error || !filing) {
    return (
      <div style={{ marginTop: 40, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--error)", marginBottom: 12 }}>
          {error ?? "Filing not found"}
        </div>
        <Link href="/tax/pp30" style={{ fontSize: 12, color: "var(--accent)" }}>
          ← Back to ภพ.30
        </Link>
      </div>
    );
  }

  const steps = getSteps(filing.status);
  const s = STATUS_STYLES[filing.status] ?? STATUS_STYLES["DRAFT"]!;

  const outputVat = new Decimal(filing.output_vat);
  const inputVat = new Decimal(filing.input_vat);
  const vatPayable = new Decimal(filing.vat_payable);
  const isRefund = outputVat.minus(inputVat).lt(0);

  const pdfUrl = `/api/v1/tax-filings/${filingId}/pdf`;
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div>
      <PageHeader
        title={`ภพ.30 — ${filing.filing_no}`}
        description={`Period: ${fmtPeriod(filing.period_code)} (${filing.period_code})`}
        breadcrumbs={[
          { label: "Tax", href: "/tax/pp30" },
          { label: "ภพ.30", href: "/tax/pp30" },
          { label: filing.filing_no },
        ]}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a
              href={`${API_BASE}${pdfUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <FileDown size={12} />
              Export PDF (ภพ.30)
            </a>
            <Link
              href="/tax/pp30"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-muted)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft size={12} />
              Back
            </Link>
          </div>
        }
      />

      {/* Filing info + status */}
      <div
        style={{
          marginTop: 16,
          fontSize: 12,
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span>
          งวด: <strong style={{ color: "var(--text-primary)" }}>{fmtPeriod(filing.period_code)}</strong>
        </span>
        <span
          style={{
            display: "inline-block",
            padding: "1px 9px",
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 500,
            background: s.bg,
            color: s.color,
          }}
        >
          {filing.status}
        </span>
        {filing.filed_at && (
          <span>
            Submitted: <strong style={{ color: "var(--text-primary)" }}>{format(new Date(filing.filed_at), "dd MMM yyyy")}</strong>
          </span>
        )}
        {filing.je_id && (
          <Link
            href={`/gl/journal-entries/${filing.je_id}`}
            style={{ fontSize: 11, color: "var(--accent)" }}
          >
            View Closing JE →
          </Link>
        )}
      </div>

      {/* Filing progress steps */}
      <div
        style={{
          marginTop: 16,
          padding: "14px 18px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 10,
          }}
        >
          Filing Progress · ขั้นตอน
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {steps.map((step, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "6px 10px",
                borderRadius: 4,
                fontSize: 11,
                background:
                  step.state === "done"
                    ? "rgba(107,142,127,.1)"
                    : step.state === "active"
                    ? "rgba(200,150,122,.1)"
                    : "var(--surface)",
                color:
                  step.state === "done"
                    ? "#6CB278"
                    : step.state === "active"
                    ? "var(--accent)"
                    : "var(--text-muted)",
                border: step.state === "active" ? "1px solid var(--accent)" : "1px solid transparent",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "currentColor",
                  color: "var(--bg)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {step.state === "done" ? "✓" : i + 1}
              </span>
              {step.label}
            </div>
          ))}
        </div>
      </div>

      {/* Output + Input tables side by side */}
      {aggregate && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
          {/* Output VAT */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>ภาษีขาย · Output VAT</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {aggregate.output_rows.length} rows
              </span>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                  <tr>
                    <th style={TH}>Date</th>
                    <th style={TH}>Tax Inv. No</th>
                    <th style={TH}>Customer</th>
                    <th style={{ ...TH, textAlign: "right" }}>Net</th>
                    <th style={{ ...TH, textAlign: "right" }}>VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate.output_rows.map((row) => (
                    <tr key={row.id}>
                      <td style={{ ...TD, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {fmtDate(row.txn_date)}
                      </td>
                      <td style={TD}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                          {row.tax_invoice_no ?? "—"}
                        </span>
                      </td>
                      <td style={{ ...TD, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.counterparty_name}
                      </td>
                      <td style={NUM_TD}>{fmtMoney(row.net_amount)}</td>
                      <td style={{ ...NUM_TD, color: "#C8A03C" }}>{fmtMoney(row.vat_amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "var(--surface)" }}>
                    <td colSpan={3} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total</td>
                    <td style={{ ...NUM_TD, fontWeight: 600 }}>
                      {fmtMoney(aggregate.output_rows.reduce((a, r) => a.plus(new Decimal(r.net_amount)), new Decimal(0)).toFixed(2))}
                    </td>
                    <td style={{ ...NUM_TD, fontWeight: 600, color: "#C8A03C" }}>
                      {fmtMoney(aggregate.output_vat)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Input VAT */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>ภาษีซื้อ · Input VAT</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {aggregate.input_rows.length + aggregate.non_claimable_rows.length} rows
              </span>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 320 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                  <tr>
                    {filing.status === "DRAFT" && <th style={{ ...TH, width: 28 }} title="Flag non-claimable">✗</th>}
                    <th style={TH}>Date</th>
                    <th style={TH}>Tax Inv. No</th>
                    <th style={TH}>Vendor</th>
                    <th style={{ ...TH, textAlign: "right" }}>Net</th>
                    <th style={{ ...TH, textAlign: "right" }}>VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {[...aggregate.input_rows, ...aggregate.non_claimable_rows].map((row) => {
                    const isNonClaimable = aggregate.non_claimable_rows.some((r) => r.id === row.id);
                    const isFlagged = flagged.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        style={{
                          opacity: isNonClaimable || isFlagged ? 0.5 : 1,
                          textDecoration: isNonClaimable || isFlagged ? "line-through" : "none",
                        }}
                      >
                        {filing.status === "DRAFT" && (
                          <td style={{ ...TD, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isFlagged || isNonClaimable}
                              disabled={isNonClaimable}
                              onChange={() => {
                                setFlagged((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                });
                              }}
                              style={{ cursor: isNonClaimable ? "not-allowed" : "pointer" }}
                            />
                          </td>
                        )}
                        <td style={{ ...TD, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {fmtDate(row.txn_date)}
                        </td>
                        <td style={TD}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                            {row.tax_invoice_no ?? "—"}
                          </span>
                        </td>
                        <td style={{ ...TD, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.counterparty_name}
                        </td>
                        <td style={NUM_TD}>{fmtMoney(row.net_amount)}</td>
                        <td style={{ ...NUM_TD, color: isNonClaimable || isFlagged ? "var(--text-dim)" : "#6CB278" }}>
                          {fmtMoney(row.vat_amount)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "var(--surface)" }}>
                    {filing.status === "DRAFT" && <td style={TD} />}
                    <td colSpan={3} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total (claimable)</td>
                    <td style={{ ...NUM_TD, fontWeight: 600 }}>
                      {fmtMoney(aggregate.input_rows.reduce((a, r) => a.plus(new Decimal(r.net_amount)), new Decimal(0)).toFixed(2))}
                    </td>
                    <td style={{ ...NUM_TD, fontWeight: 600, color: "#6CB278" }}>
                      {fmtMoney(aggregate.input_vat)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Summary box */}
      <div
        style={{
          marginTop: 16,
          padding: "18px 22px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          สรุป · Summary
        </div>
        {[
          { label: "ภาษีขาย · Output VAT", val: outputVat },
          { label: "ภาษีซื้อ · Input VAT (claimable)", val: inputVat.negated() },
        ].map(({ label, val }, i) => (
          <div
            key={i}
            style={{ display: "grid", gridTemplateColumns: "1fr 200px", padding: "6px 0", fontSize: 13 }}
          >
            <span style={{ color: "var(--text-primary)" }}>{label}</span>
            <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>
              {val.lt(0) ? `(${fmtMoney(val.abs().toFixed(2))})` : fmtMoney(val.toFixed(2))}
            </span>
          </div>
        ))}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 200px",
            padding: "12px 0 6px",
            fontSize: 18,
            fontWeight: 600,
            borderTop: isRefund ? "2px solid #6CB278" : "2px solid var(--accent)",
            marginTop: 8,
            color: isRefund ? "#6CB278" : "var(--accent)",
          }}
        >
          <span>{isRefund ? "ขอคืนภาษี / Carry Forward" : "ต้องชำระ ณ วันยื่น"}</span>
          <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>
            ฿{fmtMoney(vatPayable.toFixed(2))}
          </span>
        </div>
      </div>

      {/* Closing JE preview (DRAFT / FINALIZED) */}
      {filing.status !== "SUBMITTED" && aggregate && (
        <div
          style={{
            marginTop: 16,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Closing JE Preview · เมื่อ submit จะสร้าง JE นี้</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface)" }}>
                {["Account", "Description", "Debit", "Credit"].map((h, i) => (
                  <th
                    key={i}
                    style={{ ...TH, textAlign: i >= 2 ? "right" : "left" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {outputVat.gt(0) && (
                <tr>
                  <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{VAT_PAYABLE_CODE}</span> ภาษีขาย</td>
                  <td style={{ ...TD, color: "var(--text-muted)" }}>Clear output VAT for {filing.period_code}</td>
                  <td style={{ ...NUM_TD, color: "var(--debit, #C87B5A)" }}>{fmtMoney(filing.output_vat)}</td>
                  <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
                </tr>
              )}
              {inputVat.gt(0) && (
                <tr>
                  <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{VAT_RECEIVABLE_CODE}</span> ภาษีซื้อ</td>
                  <td style={{ ...TD, color: "var(--text-muted)" }}>Clear input VAT for {filing.period_code}</td>
                  <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
                  <td style={{ ...NUM_TD, color: "var(--credit, #6CB278)" }}>{fmtMoney(filing.input_vat)}</td>
                </tr>
              )}
              {!isRefund && vatPayable.gt(0) && (
                <tr>
                  <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{KBANK_CURRENT_CODE}</span> KBank Current</td>
                  <td style={{ ...TD, color: "var(--text-muted)" }}>Pay VAT to RD</td>
                  <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
                  <td style={{ ...NUM_TD, color: "var(--credit, #6CB278)" }}>{fmtMoney(vatPayable.toFixed(2))}</td>
                </tr>
              )}
              {isRefund && (
                <tr>
                  <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{VAT_REFUNDABLE_CODE}</span> VAT Refundable</td>
                  <td style={{ ...TD, color: "var(--text-muted)" }}>VAT refundable / carry-forward</td>
                  <td style={{ ...NUM_TD, color: "var(--debit, #C87B5A)" }}>{fmtMoney(outputVat.minus(inputVat).abs().toFixed(2))}</td>
                  <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
                </tr>
              )}
              <tr style={{ background: "var(--surface)" }}>
                <td colSpan={2} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total</td>
                <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(filing.output_vat)}</td>
                <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(filing.output_vat)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Action panel — DRAFT: apply flags + finalize */}
      {filing.status === "DRAFT" && (
        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Actions — DRAFT</div>

          {flagError && (
            <div style={{ padding: "8px 12px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 4, fontSize: 12, color: "var(--error)", marginBottom: 10 }}>
              {flagError}
            </div>
          )}
          {finalizeError && (
            <div style={{ padding: "8px 12px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 4, fontSize: 12, color: "var(--error)", marginBottom: 10 }}>
              {finalizeError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {flagged.size > 0 && (
              <button
                onClick={handleApplyFlags}
                disabled={flagging}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: flagging ? "var(--text-dim)" : "var(--text-primary)",
                  cursor: flagging ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {flagging ? <Loader2 size={12} className="animate-spin" /> : null}
                Apply Non-Claimable ({flagged.size})
              </button>
            )}
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: finalizing ? "var(--surface)" : "var(--accent)",
                color: finalizing ? "var(--text-dim)" : "var(--bg)",
                cursor: finalizing ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {finalizing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Finalize
            </button>
          </div>
        </div>
      )}

      {/* Action panel — FINALIZED: submit form */}
      {filing.status === "FINALIZED" && (
        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>
            Submit to Revenue Department
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            After paying the RD, enter the submission date and reference number to record the submission and post the closing journal entry.
          </div>

          {submitError && (
            <div style={{ padding: "8px 12px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 4, fontSize: 12, color: "var(--error)", marginBottom: 10 }}>
              {submitError}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: 12, alignItems: "center", maxWidth: 540 }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              Submission Date
            </label>
            <input
              type="date"
              value={submissionDate}
              onChange={(e) => setSubmissionDate(e.target.value)}
              style={{
                height: 32,
                padding: "0 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            <div />

            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              Reference No.
            </label>
            <input
              type="text"
              value={submissionRef}
              onChange={(e) => setSubmissionRef(e.target.value)}
              placeholder="e.g. RD-2026-05-123456"
              style={{
                height: 32,
                padding: "0 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
                outline: "none",
                gridColumn: "2 / 4",
              }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !submissionRef.trim() || !submissionDate}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: submitting || !submissionRef.trim() ? "var(--surface)" : "var(--accent)",
                color: submitting || !submissionRef.trim() ? "var(--text-dim)" : "var(--bg)",
                cursor: submitting || !submissionRef.trim() ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Mark Submitted &amp; Post Closing JE
            </button>
          </div>
        </div>
      )}

      {/* SUBMITTED — read only confirmation */}
      {filing.status === "SUBMITTED" && (
        <div
          style={{
            marginTop: 16,
            padding: "16px 20px",
            background: "rgba(108,178,120,0.06)",
            border: "1px solid #6CB278",
            borderRadius: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <CheckCircle2 size={16} style={{ color: "#6CB278" }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "#6CB278" }}>
              ยื่นแบบแล้ว · Filed Successfully
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Submitted on{" "}
            {filing.filed_at ? format(new Date(filing.filed_at), "dd MMMM yyyy") : "—"}.
            {filing.je_id && (
              <>
                {" "}
                Closing JE posted:{" "}
                <Link href={`/gl/journal-entries/${filing.je_id}`} style={{ color: "var(--accent)" }}>
                  View JE →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

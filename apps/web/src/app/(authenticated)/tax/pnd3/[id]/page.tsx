"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2, ArrowLeft, FileDown, CheckCircle2, Send } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { KBANK_CURRENT_CODE, WHT_PAYABLE_CODE } from "@/lib/account-codes";

interface TaxFiling {
  id: string;
  filing_no: string;
  filing_type: string;
  period_code: string;
  status: "DRAFT" | "FINALIZED" | "SUBMITTED" | "VOID";
  withholding_total: string;
  recipient_count: number;
  je_id: string | null;
  filed_at: string | null;
  created_at: string;
}

interface PndRow {
  record_id: string;
  vendor_id: string;
  vendor_name: string;
  vendor_name_th: string | null;
  vendor_tax_id: string | null;
  wht_type: string;
  wht_rate: string;
  gross_amount: string;
  wht_amount: string;
  cert_no: string;
  payment_date: string;
  payment_id: string;
}

interface PndVendorGroup {
  vendor_id: string;
  vendor_name: string;
  vendor_name_th: string | null;
  vendor_tax_id: string | null;
  total_gross: string;
  total_wht: string;
  lines: PndRow[];
}

interface PndAggregate {
  period_code: string;
  pnd_type: string;
  vendor_type: string;
  total_gross: string;
  total_wht: string;
  recipient_count: number;
  rows: PndRow[];
  groups: PndVendorGroup[];
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

function fmtPct(rate: string): string {
  return `${new Decimal(rate).times(100).toFixed(0)}%`;
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
    { label: "1. Aggregate WHT records", doneIf: ["DRAFT", "FINALIZED", "SUBMITTED"] },
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

export default function PND3DetailPage() {
  const params = useParams<{ id: string }>();
  const filingId = params.id;

  const [filing, setFiling] = useState<TaxFiling | null>(null);
  const [aggregate, setAggregate] = useState<PndAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

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

      // For DRAFT and FINALIZED, load live aggregate for display.
      // For SUBMITTED, the snapshot on the filing is authoritative.
      if (f.status !== "SUBMITTED") {
        const agg = await apiClient.post<PndAggregate>("/api/v1/tax-filings/pnd3/preview", {
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
      setAggregate(null);
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
        <Link href="/tax/pnd3" style={{ fontSize: 12, color: "var(--accent)" }}>
          ← Back to ภงด.3
        </Link>
      </div>
    );
  }

  const steps = getSteps(filing.status);
  const s = STATUS_STYLES[filing.status] ?? STATUS_STYLES["DRAFT"]!;
  const totalWht = new Decimal(filing.withholding_total ?? 0);

  const pdfUrl = `/api/v1/tax-filings/${filingId}/pdf`;
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

  return (
    <div>
      <PageHeader
        title={`ภงด.3 — ${filing.filing_no}`}
        description={`Period: ${fmtPeriod(filing.period_code)} (${filing.period_code})`}
        breadcrumbs={[
          { label: "Tax", href: "/tax/pnd3" },
          { label: "ภงด.3", href: "/tax/pnd3" },
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
              Export PDF (ภงด.3)
            </a>
            <Link
              href="/tax/pnd3"
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

      {/* Vendor groups table (DRAFT / FINALIZED) */}
      {aggregate && (
        <div
          style={{
            marginTop: 16,
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
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              ผู้รับเงิน · Withholding Records (บุคคลธรรมดา / Individual)
            </span>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
              {aggregate.recipient_count} vendor{aggregate.recipient_count !== 1 ? "s" : ""} · {aggregate.rows.length} records
            </span>
          </div>
          <div style={{ overflowY: "auto", maxHeight: 360 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                <tr>
                  <th style={TH}>Vendor</th>
                  <th style={TH}>Tax ID</th>
                  <th style={TH}>Cert No.</th>
                  <th style={TH}>Date</th>
                  <th style={TH}>WHT Type</th>
                  <th style={{ ...TH, textAlign: "right" }}>Rate</th>
                  <th style={{ ...TH, textAlign: "right" }}>Gross</th>
                  <th style={{ ...TH, textAlign: "right" }}>WHT</th>
                </tr>
              </thead>
              <tbody>
                {aggregate.groups.map((group) => (
                  <React.Fragment key={group.vendor_id}>
                    {group.lines.map((line, li) => (
                      <tr key={line.record_id}>
                        {li === 0 ? (
                          <td
                            style={{ ...TD, verticalAlign: "top", fontWeight: 500 }}
                            rowSpan={group.lines.length}
                          >
                            <div style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {group.vendor_name_th ?? group.vendor_name}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                              {group.vendor_name}
                            </div>
                          </td>
                        ) : null}
                        {li === 0 ? (
                          <td
                            style={{ ...TD, verticalAlign: "top", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}
                            rowSpan={group.lines.length}
                          >
                            {group.vendor_tax_id ?? "—"}
                          </td>
                        ) : null}
                        <td style={{ ...TD, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                          {line.cert_no}
                        </td>
                        <td style={{ ...TD, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {fmtDate(line.payment_date)}
                        </td>
                        <td style={{ ...TD, fontSize: 11 }}>{line.wht_type}</td>
                        <td style={{ ...NUM_TD, fontSize: 11, color: "var(--text-muted)" }}>
                          {fmtPct(line.wht_rate)}
                        </td>
                        <td style={NUM_TD}>{fmtMoney(line.gross_amount)}</td>
                        <td style={{ ...NUM_TD, color: "#C8A03C" }}>{fmtMoney(line.wht_amount)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "var(--surface)" }}>
                      <td colSpan={6} style={{ ...TD, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                        Subtotal — {group.vendor_name_th ?? group.vendor_name}
                      </td>
                      <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(group.total_gross)}</td>
                      <td style={{ ...NUM_TD, fontWeight: 600, color: "#C8A03C" }}>{fmtMoney(group.total_wht)}</td>
                    </tr>
                  </React.Fragment>
                ))}
                <tr style={{ background: "rgba(200,150,122,0.07)" }}>
                  <td colSpan={6} style={{ ...TD, fontWeight: 700, fontSize: 12 }}>Grand Total</td>
                  <td style={{ ...NUM_TD, fontWeight: 700 }}>{fmtMoney(aggregate.total_gross)}</td>
                  <td style={{ ...NUM_TD, fontWeight: 700, color: "var(--accent)" }}>{fmtMoney(aggregate.total_wht)}</td>
                </tr>
              </tbody>
            </table>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", padding: "6px 0", fontSize: 13 }}>
          <span style={{ color: "var(--text-primary)" }}>จำนวนผู้รับเงิน · Recipients</span>
          <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>{filing.recipient_count}</span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 200px",
            padding: "12px 0 6px",
            fontSize: 18,
            fontWeight: 600,
            borderTop: "2px solid var(--accent)",
            marginTop: 8,
            color: "var(--accent)",
          }}
        >
          <span>ภาษีหัก ณ ที่จ่าย · Total WHT Payable</span>
          <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>
            ฿{fmtMoney(totalWht.toFixed(2))}
          </span>
        </div>
      </div>

      {/* Closing JE preview (DRAFT / FINALIZED) */}
      {filing.status !== "SUBMITTED" && totalWht.gt(0) && (
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
                  <th key={i} style={{ ...TH, textAlign: i >= 2 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{WHT_PAYABLE_CODE}</span> WHT Payable</td>
                <td style={{ ...TD, color: "var(--text-muted)" }}>Clear WHT payable for {filing.period_code}</td>
                <td style={{ ...NUM_TD, color: "var(--debit, #C87B5A)" }}>{fmtMoney(totalWht.toFixed(2))}</td>
                <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
              </tr>
              <tr>
                <td style={TD}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{KBANK_CURRENT_CODE}</span> KBank Current</td>
                <td style={{ ...TD, color: "var(--text-muted)" }}>Pay WHT to RD ({filing.period_code})</td>
                <td style={{ ...NUM_TD, color: "var(--text-dim)" }}>—</td>
                <td style={{ ...NUM_TD, color: "var(--credit, #6CB278)" }}>{fmtMoney(totalWht.toFixed(2))}</td>
              </tr>
              <tr style={{ background: "var(--surface)" }}>
                <td colSpan={2} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total</td>
                <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(totalWht.toFixed(2))}</td>
                <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(totalWht.toFixed(2))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Action panel — DRAFT: finalize */}
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

          {finalizeError && (
            <div style={{ padding: "8px 12px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 4, fontSize: 12, color: "var(--error)", marginBottom: 10 }}>
              {finalizeError}
            </div>
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
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Submission Date</label>
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
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>Reference No.</label>
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

      {/* SUBMITTED — read-only confirmation */}
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

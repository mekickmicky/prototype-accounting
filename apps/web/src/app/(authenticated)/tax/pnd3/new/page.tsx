"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Eye, Save } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";

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

interface TaxFiling {
  id: string;
  filing_no: string;
}

function fmtMoney(val: string | number): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
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

export default function NewPND3Page() {
  const router = useRouter();

  const [period, setPeriod] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [aggregate, setAggregate] = useState<PndAggregate | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handlePreview() {
    if (!period) return;
    setPreviewing(true);
    setPreviewError(null);
    setAggregate(null);
    try {
      const res = await apiClient.post<PndAggregate>("/api/v1/tax-filings/pnd3/preview", { period });
      setAggregate(res);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSaveDraft() {
    if (!period) return;
    setSaving(true);
    setSaveError(null);
    try {
      const filing = await apiClient.post<TaxFiling>("/api/v1/tax-filings/pnd3", { period });
      router.push(`/tax/pnd3/${filing.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save draft");
      setSaving(false);
    }
  }

  const hasData = aggregate !== null;

  return (
    <div>
      <PageHeader
        title="New ภงด.3 — Withholding Tax (Individual)"
        description="Generate a new PND3 filing for individual (natural person) vendors"
        breadcrumbs={[
          { label: "Tax", href: "/tax/pnd3" },
          { label: "ภงด.3", href: "/tax/pnd3" },
          { label: "New" },
        ]}
        actions={
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
        }
      />

      {/* Period picker */}
      <div
        style={{
          marginTop: 20,
          padding: "16px 20px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <label style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500, minWidth: 80 }}>
          Period (งวด)
        </label>
        <input
          type="month"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setAggregate(null);
            setPreviewError(null);
          }}
          style={{
            height: 32,
            padding: "0 10px",
            fontSize: 13,
            borderRadius: 4,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={handlePreview}
          disabled={!period || previewing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            fontSize: 12,
            fontWeight: 500,
            borderRadius: 4,
            border: "none",
            background: !period || previewing ? "var(--surface)" : "var(--accent)",
            color: !period || previewing ? "var(--text-dim)" : "var(--bg)",
            cursor: !period || previewing ? "default" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {previewing ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
          Generate Preview
        </button>
      </div>

      {previewError && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
          }}
        >
          {previewError}
        </div>
      )}

      {hasData && (
        <>
          {/* Vendor groups table */}
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
                {aggregate!.recipient_count} vendor{aggregate!.recipient_count !== 1 ? "s" : ""} · {aggregate!.rows.length} records
              </span>
            </div>
            <div style={{ overflowY: "auto", maxHeight: 420 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                  <tr>
                    <th style={TH}>Vendor</th>
                    <th style={TH}>Tax ID</th>
                    <th style={TH}>Cert No.</th>
                    <th style={TH}>Date</th>
                    <th style={TH}>WHT Type</th>
                    <th style={{ ...TH, textAlign: "right" }}>WHT Rate</th>
                    <th style={{ ...TH, textAlign: "right" }}>Gross</th>
                    <th style={{ ...TH, textAlign: "right" }}>WHT Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregate!.groups.map((group) => (
                    <React.Fragment key={group.vendor_id}>
                      {group.lines.map((line, li) => (
                        <tr key={line.record_id}>
                          {li === 0 ? (
                            <td
                              style={{
                                ...TD,
                                verticalAlign: "top",
                                fontWeight: 500,
                              }}
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
                              style={{
                                ...TD,
                                verticalAlign: "top",
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                color: "var(--text-muted)",
                              }}
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
                      {/* Vendor subtotal row */}
                      <tr style={{ background: "var(--surface)" }}>
                        <td colSpan={6} style={{ ...TD, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                          Subtotal — {group.vendor_name_th ?? group.vendor_name}
                        </td>
                        <td style={{ ...NUM_TD, fontWeight: 600 }}>{fmtMoney(group.total_gross)}</td>
                        <td style={{ ...NUM_TD, fontWeight: 600, color: "#C8A03C" }}>{fmtMoney(group.total_wht)}</td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {/* Grand total row */}
                  <tr style={{ background: "rgba(200,150,122,0.07)" }}>
                    <td colSpan={6} style={{ ...TD, fontWeight: 700, fontSize: 12 }}>Grand Total</td>
                    <td style={{ ...NUM_TD, fontWeight: 700 }}>{fmtMoney(aggregate!.total_gross)}</td>
                    <td style={{ ...NUM_TD, fontWeight: 700, color: "var(--accent)" }}>{fmtMoney(aggregate!.total_wht)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

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
              { label: "จำนวนผู้รับเงิน · Recipients", val: aggregate!.recipient_count, isMoney: false },
              { label: "ยอดรวมก่อนหัก · Total Gross Amount", val: new Decimal(aggregate!.total_gross).toNumber(), isMoney: true },
            ].map(({ label, val, isMoney }, i) => (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "1fr 200px", padding: "6px 0", fontSize: 13 }}
              >
                <span style={{ color: "var(--text-primary)" }}>{label}</span>
                <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>
                  {isMoney ? fmtMoney((val as number).toFixed(2)) : val}
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
                borderTop: "2px solid var(--accent)",
                marginTop: 8,
                color: "var(--accent)",
              }}
            >
              <span>ภาษีหัก ณ ที่จ่าย · Total WHT</span>
              <span style={{ fontFamily: "var(--font-mono)", textAlign: "right" }}>
                ฿{fmtMoney(aggregate!.total_wht)}
              </span>
            </div>
          </div>

          {saveError && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 5,
                fontSize: 12,
                color: "var(--error)",
              }}
            >
              {saveError}
            </div>
          )}

          {/* Save actions */}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 18px",
                fontSize: 13,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: saving ? "var(--surface)" : "var(--accent)",
                color: saving ? "var(--text-dim)" : "var(--bg)",
                cursor: saving ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save as Draft
            </button>
          </div>
        </>
      )}
    </div>
  );
}

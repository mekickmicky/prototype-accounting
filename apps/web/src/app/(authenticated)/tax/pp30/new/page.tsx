"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Eye, Save } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import Link from "next/link";
import Decimal from "decimal.js";

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

export default function NewPP30Page() {
  const router = useRouter();

  const [period, setPeriod] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [aggregate, setAggregate] = useState<PP30Aggregate | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // IDs of input rows flagged as non-claimable locally
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handlePreview() {
    if (!period) return;
    setPreviewing(true);
    setPreviewError(null);
    setAggregate(null);
    setFlagged(new Set());
    try {
      const res = await apiClient.post<PP30Aggregate>("/api/v1/tax-filings/pp30/preview", {
        period,
      });
      setAggregate(res);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  function toggleFlagged(id: string) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveDraft() {
    if (!period) return;
    setSaving(true);
    setSaveError(null);
    try {
      const filing = await apiClient.post<TaxFiling>("/api/v1/tax-filings/pp30", { period });
      // Flag non-claimable rows if any are checked
      if (flagged.size > 0) {
        await apiClient.post(`/api/v1/tax-filings/${filing.id}/flag-non-claimable`, {
          vat_register_ids: Array.from(flagged),
        });
      }
      router.push(`/tax/pp30/${filing.id}`);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save draft");
      setSaving(false);
    }
  }

  const hasData = aggregate !== null;
  const vatPayable: Decimal = aggregate ? new Decimal(aggregate.vat_payable) : new Decimal(0);
  const isRefund = vatPayable.lt(0);

  const displayInputVat: Decimal = aggregate
    ? aggregate.input_rows
        .reduce((acc, r) => acc.plus(new Decimal(r.vat_amount)), new Decimal(0))
        .minus(
          Array.from(flagged)
            .map((id) => aggregate.input_rows.find((r) => r.id === id))
            .filter((r): r is VatRegisterRow => r !== undefined)
            .reduce((acc, r) => acc.plus(new Decimal(r.vat_amount)), new Decimal(0))
        )
    : new Decimal(0);

  const displayOutputVat: Decimal = aggregate ? new Decimal(aggregate.output_vat) : new Decimal(0);
  const displayPayable: Decimal = displayOutputVat.minus(displayInputVat);

  return (
    <div>
      <PageHeader
        title="New ภพ.30 — VAT Return"
        description="Generate a new VAT return filing for a period"
        breadcrumbs={[
          { label: "Tax", href: "/tax/pp30" },
          { label: "ภพ.30", href: "/tax/pp30" },
          { label: "New" },
        ]}
        actions={
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
          {/* Output / Input tables side by side */}
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
                <span style={{ fontSize: 13, fontWeight: 500 }}>ภาษีขาย · Output VAT (Sales)</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {aggregate!.output_rows.length} rows
                </span>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 360 }}>
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
                    {aggregate!.output_rows.map((row) => (
                      <tr key={row.id}>
                        <td style={{ ...TD, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {fmtDate(row.txn_date)}
                        </td>
                        <td style={TD}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                            {row.tax_invoice_no ?? "—"}
                          </span>
                        </td>
                        <td style={{ ...TD, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {row.counterparty_name}
                        </td>
                        <td style={NUM_TD}>{fmtMoney(row.net_amount)}</td>
                        <td style={{ ...NUM_TD, color: "#C8A03C" }}>{fmtMoney(row.vat_amount)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: "var(--surface)" }}>
                      <td colSpan={3} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total</td>
                      <td style={{ ...NUM_TD, fontWeight: 600 }}>
                        {fmtMoney(
                          aggregate!.output_rows
                            .reduce((acc, r) => acc.plus(new Decimal(r.net_amount)), new Decimal(0))
                            .toFixed(2)
                        )}
                      </td>
                      <td style={{ ...NUM_TD, fontWeight: 600, color: "#C8A03C" }}>
                        {fmtMoney(aggregate!.output_vat)}
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
                <span style={{ fontSize: 13, fontWeight: 500 }}>ภาษีซื้อ · Input VAT (Purchases)</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {aggregate!.input_rows.length + aggregate!.non_claimable_rows.length} rows
                </span>
              </div>
              <div style={{ overflowY: "auto", maxHeight: 360 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--surface)" }}>
                    <tr>
                      <th style={{ ...TH, width: 28 }} title="Flag as non-claimable">✗</th>
                      <th style={TH}>Date</th>
                      <th style={TH}>Tax Inv. No</th>
                      <th style={TH}>Vendor</th>
                      <th style={{ ...TH, textAlign: "right" }}>Net</th>
                      <th style={{ ...TH, textAlign: "right" }}>VAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...aggregate!.input_rows, ...aggregate!.non_claimable_rows].map((row) => {
                      const isNonClaimable = aggregate!.non_claimable_rows.some((r) => r.id === row.id);
                      const isFlagged = flagged.has(row.id) || isNonClaimable;
                      return (
                        <tr
                          key={row.id}
                          style={{
                            opacity: isFlagged ? 0.5 : 1,
                            textDecoration: isFlagged ? "line-through" : "none",
                          }}
                        >
                          <td style={{ ...TD, textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={isFlagged}
                              disabled={isNonClaimable}
                              onChange={() => toggleFlagged(row.id)}
                              style={{ cursor: isNonClaimable ? "not-allowed" : "pointer" }}
                              title="Flag as non-claimable"
                            />
                          </td>
                          <td style={{ ...TD, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                            {fmtDate(row.txn_date)}
                          </td>
                          <td style={TD}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
                              {row.tax_invoice_no ?? "—"}
                            </span>
                          </td>
                          <td style={{ ...TD, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.counterparty_name}
                          </td>
                          <td style={NUM_TD}>{fmtMoney(row.net_amount)}</td>
                          <td style={{ ...NUM_TD, color: isFlagged ? "var(--text-dim)" : "#6CB278" }}>
                            {fmtMoney(row.vat_amount)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: "var(--surface)" }}>
                      <td colSpan={4} style={{ ...TD, fontWeight: 600, fontSize: 11 }}>Total (claimable)</td>
                      <td style={{ ...NUM_TD, fontWeight: 600 }}>
                        {fmtMoney(
                          aggregate!.input_rows
                            .filter((r) => !flagged.has(r.id))
                            .reduce((acc, r) => acc.plus(new Decimal(r.net_amount)), new Decimal(0))
                            .toFixed(2)
                        )}
                      </td>
                      <td style={{ ...NUM_TD, fontWeight: 600, color: "#6CB278" }}>
                        {fmtMoney(displayInputVat.toFixed(2))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
              { label: "ภาษีขาย · Output VAT", val: displayOutputVat },
              { label: "ภาษีซื้อ · Input VAT (claimable)", val: displayInputVat.negated() },
            ].map(({ label, val }, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 200px",
                  padding: "6px 0",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "var(--text-primary)" }}>{label}</span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    textAlign: "right",
                    color: "var(--text-primary)",
                  }}
                >
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
                ฿{fmtMoney(displayPayable.abs().toFixed(2))}
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
          <div
            style={{
              marginTop: 16,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {flagged.size > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", alignSelf: "center" }}>
                {flagged.size} row{flagged.size !== 1 ? "s" : ""} flagged as non-claimable
              </span>
            )}
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

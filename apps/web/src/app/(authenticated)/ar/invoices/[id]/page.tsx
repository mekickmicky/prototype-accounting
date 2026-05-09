"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, FileDown, CreditCard, XCircle, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { InvoiceForm, type InvoiceSubmitValues } from "@/components/ar/invoice-form";
import { ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type InvoiceStatus = "DRAFT" | "POSTED" | "PARTIAL_PAID" | "PAID" | "VOID";

interface InvoiceLine {
  id: string;
  line_no: number;
  description: string;
  service_code: string | null;
  qty: string;
  unit_price: string;
  discount: string;
  vat_rate: string;
  revenue_account_code: string;
  line_total: string;
}

interface ReceiptApplication {
  id: string;
  applied_amount: string;
  applied_at: string;
  receipt: {
    id: string;
    receipt_no: string;
    receipt_date: string;
    total_amount: string;
  };
}

interface Customer {
  id: string;
  code: string;
  name: string;
  name_th: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
}

interface Invoice {
  id: string;
  invoice_no: string;
  tax_invoice_no: string | null;
  customer_id: string;
  customer: Customer;
  branch_code: string;
  issue_date: string;
  due_date: string;
  is_tax_invoice: boolean;
  vat_inclusive: boolean;
  subtotal: string;
  discount: string;
  vat_amount: string;
  withholding_amount: string;
  total: string;
  paid_amount: string;
  status: InvoiceStatus;
  je_id: string | null;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  source_ref: string | null;
  updated_at: string;
  lines: InvoiceLine[];
  receipt_applications: ReceiptApplication[];
}

async function apiReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  let body: { success: boolean; data?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("PARSE_ERROR", "Failed to parse response", res.status);
  }
  if (!body.success) {
    throw new ApiError(body.error?.code ?? "UNKNOWN", body.error?.message ?? "Unknown error", res.status);
  }
  return body.data as T;
}

function fmtMoney(val: string | number | Decimal): string {
  const n = new Decimal(val ?? 0).toNumber();
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

function toDateInput(iso: string): string {
  return new Date(iso).toISOString().split("T")[0]!;
}

function vatRateForForm(val: string): "7" | "0" | "EXEMPT" {
  const n = new Decimal(val ?? 0);
  if (n.gte(7)) return "7";
  return "0";
}

function buildPayload(values: InvoiceSubmitValues) {
  return {
    customer_id: values.customer_id,
    branch_code: values.branch_code,
    issue_date: values.issue_date,
    due_date: values.due_date,
    is_tax_invoice: values.is_tax_invoice,
    vat_inclusive: values.vat_inclusive,
    notes: values.notes || undefined,
    source_ref: values.source_ref || undefined,
    lines: values.lines,
  };
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIAL_PAID: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_COLORS: Record<InvoiceStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(100,140,220,0.15)", color: "#6480CC" },
  PARTIAL_PAID: { bg: "rgba(200,160,60,0.15)", color: "#C8A03C" },
  PAID: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 16,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 12,
  paddingBottom: 6,
  borderBottom: "1px solid var(--border)",
};

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? 12 : 13,
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          color: !value ? "var(--text-dim)" : "var(--text-primary)",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 6px",
  fontSize: 10,
  fontWeight: 500,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const TD: React.CSSProperties = {
  padding: "7px 6px",
  fontSize: 12,
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  verticalAlign: "middle",
};

function InvoiceReadOnly({ invoice, onRefresh }: { invoice: Invoice; onRefresh: () => void }) {
  const router = useRouter();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const isVoid = invoice.status === "VOID";
  const canVoid = invoice.status === "POSTED" || invoice.status === "PARTIAL_PAID";
  const canRecordPayment = invoice.status === "POSTED" || invoice.status === "PARTIAL_PAID";
  const balance = new Decimal(invoice.total).minus(new Decimal(invoice.paid_amount));
  const pdfUrl = `${API_BASE}/api/v1/sales-invoices/${invoice.id}/pdf`;

  async function doVoid() {
    if (!voidReason.trim()) {
      setVoidError("กรุณาระบุเหตุผล");
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      await apiReq(`/api/v1/sales-invoices/${invoice.id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setShowVoid(false);
      onRefresh();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setVoiding(false);
    }
  }

  const { bg: statusBg, color: statusColor } = STATUS_COLORS[invoice.status];

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div>
          <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <a href="/ar/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AR</a>
            {" / "}
            <a href="/ar/invoices" style={{ color: "inherit", textDecoration: "none" }}>Invoices</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {invoice.invoice_no.startsWith("DRAFT-") ? "(Draft)" : invoice.invoice_no}
            </span>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
              {invoice.invoice_no.startsWith("DRAFT-") ? "Invoice (Draft)" : invoice.invoice_no}
            </h1>
            <span
              style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 600,
                background: statusBg,
                color: statusColor,
              }}
            >
              {STATUS_LABELS[invoice.status]}
            </span>
            {invoice.is_tax_invoice && (
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 500,
                  background: "rgba(100,140,220,0.12)",
                  color: "#6480CC",
                }}
              >
                Tax Invoice
              </span>
            )}
          </div>
          {invoice.tax_invoice_no && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
              Tax Invoice #: {invoice.tax_invoice_no}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 4 }}>
          {!isVoid && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <FileDown size={12} />
              PDF
            </a>
          )}
          {canRecordPayment && (
            <button
              onClick={() =>
                router.push(
                  `/ar/receipts/new?invoice_id=${invoice.id}&customer_id=${invoice.customer_id}`
                )
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 14px",
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
              <CreditCard size={12} />
              Record Payment
            </button>
          )}
          {canVoid && (
            <button
              onClick={() => {
                setVoidReason("");
                setVoidError(null);
                setShowVoid(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "6px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--error)",
                background: "transparent",
                color: "var(--error)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <XCircle size={12} />
              Void
            </button>
          )}
        </div>
      </div>

      {/* VOID banner */}
      {isVoid && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 16px",
            background: "rgba(184,92,80,0.08)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            marginBottom: 16,
          }}
        >
          <AlertTriangle size={14} style={{ color: "var(--error)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--error)", marginBottom: 2 }}>
              ใบแจ้งหนี้ถูกยกเลิก (Void)
              {invoice.voided_at && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: "var(--text-muted)" }}>
                  · {fmtDate(invoice.voided_at)}
                </span>
              )}
              {invoice.je_id && (
                <a
                  href={`/gl/journal-entries/${invoice.je_id}`}
                  style={{ marginLeft: 12, fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 400 }}
                >
                  Reversal JE →
                </a>
              )}
            </div>
            {invoice.void_reason && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{invoice.void_reason}</div>
            )}
          </div>
        </div>
      )}

      {/* Main layout: 2-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Invoice header fields */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ข้อมูลใบแจ้งหนี้ · Invoice Info</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="ลูกค้า" value={invoice.customer.name_th ?? invoice.customer.name} />
              <Field label="Branch" value={invoice.branch_code} mono />
              <Field label="Source Ref" value={invoice.source_ref} mono />
              <Field label="Issue Date" value={fmtDate(invoice.issue_date)} />
              <Field label="Due Date" value={fmtDate(invoice.due_date)} />
              <Field
                label="Payment Terms"
                value={
                  invoice.customer.payment_terms_days === 0
                    ? "COD"
                    : `Net ${invoice.customer.payment_terms_days}d`
                }
              />
            </div>
            {invoice.notes && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}
              >
                {invoice.notes}
              </div>
            )}
          </div>

          {/* Lines table */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>รายการสินค้า/บริการ · Line Items</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: "right", width: 30 }}>#</th>
                    <th style={TH}>รายละเอียด</th>
                    <th style={{ ...TH, textAlign: "right" }}>จำนวน</th>
                    <th style={{ ...TH, textAlign: "right" }}>ราคา/หน่วย</th>
                    <th style={{ ...TH, textAlign: "right" }}>ส่วนลด</th>
                    <th style={{ ...TH, textAlign: "right" }}>VAT%</th>
                    <th style={{ ...TH, textAlign: "right" }}>ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l) => (
                    <tr key={l.id}>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-dim)" }}>{l.line_no}</td>
                      <td style={TD}>{l.description}</td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {new Decimal(l.qty).toNumber().toLocaleString("th-TH", { maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {fmtMoney(l.unit_price)}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {new Decimal(l.discount).gt(0) ? `(${fmtMoney(l.discount)})` : "—"}
                      </td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                        {(() => {
                          const r = new Decimal(l.vat_rate ?? 0);
                          return r.eq(7) ? "7%" : r.isZero() ? "0%" : `${r.toFixed(0)}%`;
                        })()}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {fmtMoney(l.line_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <div style={{ width: 260, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>ราคาก่อนส่วนลด</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {fmtMoney(new Decimal(invoice.subtotal).plus(new Decimal(invoice.discount)))}
                  </span>
                </div>
                {new Decimal(invoice.discount).gt(0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)" }}>ส่วนลด</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      ({fmtMoney(invoice.discount)})
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>ราคาหลังส่วนลด</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(invoice.subtotal)}</span>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>
                    VAT{invoice.vat_inclusive ? " (รวมแล้ว)" : " 7%"}
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(invoice.vat_amount)}</span>
                </div>
                {new Decimal(invoice.withholding_amount).gt(0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)" }}>หัก ณ ที่จ่าย (WHT)</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
                      ({fmtMoney(invoice.withholding_amount)})
                    </span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                  <span>ยอดรวมสุทธิ</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                    {fmtMoney(invoice.total)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Payment summary */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>การชำระ · Payment</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>ยอดรวม</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(invoice.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>ชำระแล้ว</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#6CB278" }}>
                  ({fmtMoney(invoice.paid_amount)})
                </span>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: balance.gt(new Decimal("0.005")) ? "var(--error)" : "var(--text-muted)" }}>
                  คงเหลือ
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: balance.gt(new Decimal("0.005")) ? "var(--error)" : "var(--text-dim)",
                  }}
                >
                  {fmtMoney(balance)}
                </span>
              </div>
            </div>
          </div>

          {/* Receipt applications */}
          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                }}
              >
                ใบเสร็จ · Receipts
              </div>
              {invoice.receipt_applications.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                  {invoice.receipt_applications.length} รายการ
                </span>
              )}
            </div>
            {invoice.receipt_applications.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0" }}>
                ยังไม่มีการรับชำระ
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {invoice.receipt_applications.map((app) => (
                  <div
                    key={app.id}
                    style={{
                      padding: "6px 8px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 4,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <a
                        href={`/ar/receipts/${app.receipt.id}`}
                        style={{
                          fontSize: 11,
                          fontFamily: "var(--font-mono)",
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        {app.receipt.receipt_no}
                      </a>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
                        {fmtMoney(app.applied_amount)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>
                      {fmtDate(app.receipt.receipt_date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Journal Entry link */}
          {invoice.je_id && !isVoid && (
            <div style={CARD}>
              <div style={SECTION_TITLE}>Journal Entry</div>
              <a
                href={`/gl/journal-entries/${invoice.je_id}`}
                style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", textDecoration: "none" }}
              >
                View JE →
              </a>
              {invoice.posted_at && (
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
                  Posted {fmtDate(invoice.posted_at)}
                </div>
              )}
            </div>
          )}

          {/* Customer quick-view */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ลูกค้า · Customer</div>
            <a
              href={`/ar/customers/${invoice.customer_id}`}
              style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", display: "block", marginBottom: 4 }}
            >
              {invoice.customer.name_th ?? invoice.customer.name}
            </a>
            {invoice.customer.name_th && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                {invoice.customer.name}
              </div>
            )}
            {invoice.customer.tax_id && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 2 }}>
                Tax ID: {invoice.customer.tax_id}
              </div>
            )}
            {invoice.customer.phone && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{invoice.customer.phone}</div>
            )}
          </div>
        </div>
      </div>

      {/* Void confirmation dialog */}
      {showVoid && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowVoid(false);
          }}
        >
          <div
            style={{
              width: 420,
              maxWidth: "90vw",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                ยืนยันการยกเลิก (Void Invoice)
              </h2>
              <button
                onClick={() => setShowVoid(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, display: "flex" }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: "14px 18px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                ใบแจ้งหนี้{" "}
                <strong style={{ color: "var(--text-primary)" }}>{invoice.invoice_no}</strong>{" "}
                จะถูกยกเลิก และจะสร้าง Journal Entry กลับรายการโดยอัตโนมัติ
              </p>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                เหตุผล *
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="ระบุเหตุผลการยกเลิก..."
                autoFocus
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              {voidError && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 10px",
                    background: "rgba(184,92,80,0.1)",
                    border: "1px solid var(--error)",
                    borderRadius: 4,
                    fontSize: 11,
                    color: "var(--error)",
                  }}
                >
                  {voidError}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "10px 18px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => setShowVoid(false)}
                disabled={voiding}
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
                ยกเลิก
              </button>
              <button
                onClick={doVoid}
                disabled={voiding}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--error)",
                  color: "#fff",
                  cursor: voiding ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: voiding ? 0.7 : 1,
                }}
              >
                {voiding && <Loader2 size={12} className="animate-spin" />}
                {voiding ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiReq<Invoice>(`/api/v1/sales-invoices/${id}`);
      setInvoice(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchInvoice();
  }, [fetchInvoice]);

  async function handleSaveDraft(values: InvoiceSubmitValues) {
    if (!invoice) return;
    await apiReq(`/api/v1/sales-invoices/${id}`, {
      method: "PATCH",
      headers: { "If-Match": invoice.updated_at },
      body: JSON.stringify(buildPayload(values)),
    });
    await fetchInvoice();
  }

  async function handlePost(values: InvoiceSubmitValues) {
    if (!invoice) return;
    await apiReq(`/api/v1/sales-invoices/${id}`, {
      method: "PATCH",
      headers: { "If-Match": invoice.updated_at },
      body: JSON.stringify(buildPayload(values)),
    });
    await apiReq(`/api/v1/sales-invoices/${id}/post`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await fetchInvoice();
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div>
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 13,
            color: "var(--error)",
            marginBottom: 12,
          }}
        >
          {error ?? "Invoice not found"}
        </div>
        <button
          onClick={() => router.push("/ar/invoices")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={12} />
          Back to Invoices
        </button>
      </div>
    );
  }

  if (invoice.status === "DRAFT") {
    return (
      <InvoiceForm
        key={invoice.updated_at}
        defaultValues={{
          customer_id: invoice.customer_id,
          branch_code: invoice.branch_code,
          issue_date: toDateInput(invoice.issue_date),
          due_date: toDateInput(invoice.due_date),
          is_tax_invoice: invoice.is_tax_invoice,
          vat_inclusive: invoice.vat_inclusive,
          notes: invoice.notes ?? "",
          source_ref: invoice.source_ref ?? "",
          lines: invoice.lines.map((l) => ({
            description: l.description,
            service_code: l.service_code,
            qty: l.qty,
            unit_price: l.unit_price,
            discount: l.discount,
            vat_rate: vatRateForForm(l.vat_rate),
            revenue_account_code: l.revenue_account_code,
          })),
        }}
        onSaveDraft={handleSaveDraft}
        onPost={handlePost}
        onCancel={() => router.push("/ar/invoices")}
      />
    );
  }

  return <InvoiceReadOnly invoice={invoice} onRefresh={fetchInvoice} />;
}

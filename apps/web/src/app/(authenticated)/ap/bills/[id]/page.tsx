"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, FileDown, CreditCard, XCircle, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { BillForm, type BillSubmitValues } from "@/components/ap/bill-form";
import { ApiError } from "@/lib/api-client";

const API_BASE = "";

type BillStatus = "DRAFT" | "POSTED" | "PARTIAL_PAID" | "PAID" | "VOID";

interface BillLine {
  id: string;
  line_no: number;
  description: string;
  expense_account_code: string;
  qty: string;
  unit_price: string;
  vat_rate: string;
  withholding_rate: string;
  withholding_type: string | null;
  line_total: string;
}

interface PaymentApplication {
  id: string;
  applied_amount: string;
  created_at: string;
  payment: {
    id: string;
    payment_no: string;
    payment_date: string;
    total_amount: string;
  };
}

interface Vendor {
  id: string;
  code: string;
  name: string;
  name_th: string | null;
  vendor_type: "INDIVIDUAL" | "JURISTIC";
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  payment_terms_days: number;
}

interface Bill {
  id: string;
  bill_no: string;
  vendor_invoice_no: string | null;
  vendor_id: string;
  vendor: Vendor;
  branch_code: string;
  issue_date: string;
  due_date: string;
  vat_inclusive: boolean;
  subtotal: string;
  vat_amount: string;
  withholding_amount: string;
  total: string;
  paid_amount: string;
  status: BillStatus;
  je_id: string | null;
  posted_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  updated_at: string;
  lines: BillLine[];
  payment_applications: PaymentApplication[];
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

function fmtMoney(val: string | number): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

function toDateInput(iso: string): string {
  return new Date(iso).toISOString().split("T")[0]!;
}

function buildPayload(values: BillSubmitValues) {
  return {
    vendor_id: values.vendor_id,
    vendor_invoice_no: values.vendor_invoice_no || undefined,
    branch_code: values.branch_code,
    issue_date: values.issue_date,
    due_date: values.due_date,
    vat_inclusive: values.vat_inclusive,
    notes: values.notes || undefined,
    lines: values.lines,
  };
}

const STATUS_LABELS: Record<BillStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIAL_PAID: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_COLORS: Record<BillStatus, { bg: string; color: string }> = {
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

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: mono ? 12 : 13, fontFamily: mono ? "var(--font-mono)" : "inherit", color: !value ? "var(--text-dim)" : "var(--text-primary)" }}>
        {value ?? "—"}
      </div>
    </div>
  );
}

function BillReadOnly({ bill, onRefresh }: { bill: Bill; onRefresh: () => void }) {
  const router = useRouter();
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const isVoid = bill.status === "VOID";
  const canVoid = bill.status === "POSTED" || bill.status === "PARTIAL_PAID";
  const canRecordPayment = bill.status === "POSTED" || bill.status === "PARTIAL_PAID";
  const balance = new Decimal(bill.total).minus(bill.paid_amount).toNumber();
  const pdfUrl = `${API_BASE}/api/v1/bills/${bill.id}/pdf`;

  async function doVoid() {
    if (!voidReason.trim()) {
      setVoidError("กรุณาระบุเหตุผล");
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      await apiReq(`/api/v1/bills/${bill.id}/void`, {
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

  const { bg: statusBg, color: statusColor } = STATUS_COLORS[bill.status];

  return (
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: 16, borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
        <div>
          <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <a href="/ap/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AP</a>
            {" / "}
            <a href="/ap/bills" style={{ color: "inherit", textDecoration: "none" }}>Bills</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {bill.bill_no.startsWith("DRAFT-") ? "(Draft)" : bill.bill_no}
            </span>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              {bill.bill_no.startsWith("DRAFT-") ? "Bill (Draft)" : bill.bill_no}
            </h1>
            <span data-testid="status-badge" style={{ display: "inline-block", padding: "2px 10px", borderRadius: 9999, fontSize: 11, fontWeight: 600, background: statusBg, color: statusColor }}>
              {STATUS_LABELS[bill.status]}
            </span>
          </div>
          {bill.vendor_invoice_no && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
              Vendor Invoice #: {bill.vendor_invoice_no}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 4 }}>
          {!isVoid && bill.status !== "DRAFT" && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-primary)", textDecoration: "none", fontFamily: "inherit" }}
            >
              <FileDown size={12} />
              PDF
            </a>
          )}
          {canRecordPayment && (
            <button
              onClick={() => router.push(`/ap/payments/new?vendor_id=${bill.vendor_id}&bill_id=${bill.id}`)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 4, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
            >
              <CreditCard size={12} />
              Record Payment
            </button>
          )}
          {canVoid && (
            <button
              data-testid="action-void"
              onClick={() => { setVoidReason(""); setVoidError(null); setShowVoid(true); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", fontSize: 12, borderRadius: 4, border: "1px solid var(--error)", background: "transparent", color: "var(--error)", cursor: "pointer", fontFamily: "inherit" }}
            >
              <XCircle size={12} />
              Void
            </button>
          )}
        </div>
      </div>

      {/* VOID banner */}
      {isVoid && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 16px", background: "rgba(184,92,80,0.08)", border: "1px solid var(--error)", borderRadius: 5, marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ color: "var(--error)", flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--error)", marginBottom: 2 }}>
              ใบวางบิลถูกยกเลิก (Void)
              {bill.voided_at && <span style={{ fontWeight: 400, marginLeft: 8, color: "var(--text-muted)" }}>· {fmtDate(bill.voided_at)}</span>}
              {bill.je_id && (
                <a href={`/gl/journal-entries/${bill.je_id}`} style={{ marginLeft: 12, fontSize: 11, color: "var(--accent)", textDecoration: "none", fontWeight: 400 }}>
                  Reversal JE →
                </a>
              )}
            </div>
            {bill.void_reason && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{bill.void_reason}</div>}
          </div>
        </div>
      )}

      {/* Main layout: 2-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Bill header fields */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ข้อมูลใบวางบิล · Bill Info</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="เจ้าหนี้" value={bill.vendor.name_th ?? bill.vendor.name} />
              <Field label="Branch" value={bill.branch_code} mono />
              <Field label="Vendor Invoice #" value={bill.vendor_invoice_no} mono />
              <Field label="Issue Date" value={fmtDate(bill.issue_date)} />
              <Field label="Due Date" value={fmtDate(bill.due_date)} />
              <Field
                label="Payment Terms"
                value={bill.vendor.payment_terms_days === 0 ? "COD" : `Net ${bill.vendor.payment_terms_days}d`}
              />
            </div>
            {bill.notes && (
              <div style={{ marginTop: 12, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 4, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic", lineHeight: 1.5 }}>
                {bill.notes}
              </div>
            )}
          </div>

          {/* Lines table */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>รายการค่าใช้จ่าย · Line Items</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, textAlign: "right", width: 30 }}>#</th>
                    <th style={TH}>รายละเอียด</th>
                    <th style={TH}>บัญชี</th>
                    <th style={{ ...TH, textAlign: "right" }}>จำนวน</th>
                    <th style={{ ...TH, textAlign: "right" }}>ราคา/หน่วย</th>
                    <th style={{ ...TH, textAlign: "right" }}>VAT%</th>
                    <th style={TH}>WHT</th>
                    <th style={{ ...TH, textAlign: "right" }}>ยอดรวม</th>
                  </tr>
                </thead>
                <tbody>
                  {bill.lines.map((l) => (
                    <tr key={l.id}>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-dim)" }}>{l.line_no}</td>
                      <td style={TD}>{l.description}</td>
                      <td style={{ ...TD, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>{l.expense_account_code}</td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {new Decimal(l.qty).toNumber().toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmtMoney(l.unit_price)}</td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                        {new Decimal(l.vat_rate).eq(7) ? "7%" : new Decimal(l.vat_rate).eq(0) ? "0%" : "Exempt"}
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: "var(--text-muted)" }}>
                        {new Decimal(l.withholding_rate).gt(0) ? (
                          <span>
                            {l.withholding_type && <span style={{ color: "var(--text-dim)", marginRight: 3 }}>{l.withholding_type}</span>}
                            {new Decimal(l.withholding_rate).toNumber()}%
                          </span>
                        ) : "—"}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmtMoney(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>ราคาก่อน VAT</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(bill.subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>VAT{bill.vat_inclusive ? " (รวมแล้ว)" : " 7%"}</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(bill.vat_amount)}</span>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>ยอดรวม</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(bill.total)}</span>
                </div>
                {new Decimal(bill.withholding_amount).gt(0) && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-dim)" }}>หัก ณ ที่จ่าย (WHT)</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "#C8A03C" }}>
                      ({fmtMoney(bill.withholding_amount)})
                    </span>
                  </div>
                )}
                <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                  <span>ยอดสุทธิที่ต้องชำระ</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                    {fmtMoney(new Decimal(bill.total).minus(bill.withholding_amount).toNumber())}
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
                <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(bill.total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>ชำระแล้ว</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#6CB278" }}>({fmtMoney(bill.paid_amount)})</span>
              </div>
              <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: balance > 0.005 ? "var(--error)" : "var(--text-muted)" }}>คงเหลือ</span>
                <span style={{ fontFamily: "var(--font-mono)", color: balance > 0.005 ? "var(--error)" : "var(--text-dim)" }}>
                  {fmtMoney(balance)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment applications */}
          <div style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                การชำระเงิน · Payments
              </div>
              {bill.payment_applications.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{bill.payment_applications.length} รายการ</span>
              )}
            </div>
            {bill.payment_applications.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0" }}>ยังไม่มีการชำระ</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {bill.payment_applications.map((app) => (
                  <div key={app.id} style={{ padding: "6px 8px", background: "rgba(255,255,255,0.03)", borderRadius: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <a
                        href={`/ap/payments/${app.payment.id}`}
                        style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)", textDecoration: "none" }}
                      >
                        {app.payment.payment_no}
                      </a>
                      <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>{fmtMoney(app.applied_amount)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>
                      {fmtDate(app.payment.payment_date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Journal Entry link */}
          {bill.je_id && !isVoid && (
            <div style={CARD}>
              <div style={SECTION_TITLE}>Journal Entry</div>
              <a
                href={`/gl/journal-entries/${bill.je_id}`}
                style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", textDecoration: "none" }}
              >
                View JE →
              </a>
              {bill.posted_at && (
                <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>
                  Posted {fmtDate(bill.posted_at)}
                </div>
              )}
            </div>
          )}

          {/* Vendor quick-view */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>เจ้าหนี้ · Vendor</div>
            <a
              href={`/ap/vendors/${bill.vendor_id}`}
              style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", display: "block", marginBottom: 4 }}
            >
              {bill.vendor.name_th ?? bill.vendor.name}
            </a>
            {bill.vendor.name_th && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{bill.vendor.name}</div>
            )}
            <div style={{ fontSize: 10, padding: "2px 6px", borderRadius: 9999, display: "inline-block", marginBottom: 4, background: bill.vendor.vendor_type === "INDIVIDUAL" ? "rgba(120,160,220,0.15)" : "rgba(180,140,100,0.15)", color: bill.vendor.vendor_type === "INDIVIDUAL" ? "#78a0dc" : "var(--accent)" }}>
              {bill.vendor.vendor_type === "INDIVIDUAL" ? "บุคคล" : "นิติบุคคล"}
            </div>
            {bill.vendor.tax_id && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 2 }}>
                Tax ID: {bill.vendor.tax_id}
              </div>
            )}
            {bill.vendor.phone && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{bill.vendor.phone}</div>
            )}
          </div>
        </div>
      </div>

      {/* Void confirmation dialog */}
      {showVoid && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowVoid(false); }}
        >
          <div style={{ width: 420, maxWidth: "90vw", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                ยืนยันการยกเลิก (Void Bill)
              </h2>
              <button onClick={() => setShowVoid(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, display: "flex" }}>
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: "14px 18px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                ใบวางบิล{" "}
                <strong style={{ color: "var(--text-primary)" }}>{bill.bill_no}</strong>{" "}
                จะถูกยกเลิก และจะสร้าง Journal Entry กลับรายการโดยอัตโนมัติ
              </p>
              <label style={{ display: "block", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 4 }}>
                เหตุผล *
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={3}
                placeholder="ระบุเหตุผลการยกเลิก..."
                autoFocus
                style={{ width: "100%", padding: "7px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text-primary)", fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box" }}
              />
              {voidError && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 4, fontSize: 11, color: "var(--error)" }}>
                  {voidError}
                </div>
              )}
            </div>

            <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setShowVoid(false)} disabled={voiding} style={{ padding: "6px 14px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-primary)", cursor: "pointer", fontFamily: "inherit" }}>
                ยกเลิก
              </button>
              <button
                data-testid="action-confirm-void"
                onClick={doVoid}
                disabled={voiding}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 4, border: "none", background: "var(--error)", color: "#fff", cursor: voiding ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: voiding ? 0.7 : 1 }}
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

export default function BillDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBill = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiReq<Bill>(`/api/v1/bills/${id}`);
      setBill(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load bill");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBill();
  }, [fetchBill]);

  async function handleSaveDraft(values: BillSubmitValues) {
    if (!bill) return;
    await apiReq(`/api/v1/bills/${id}`, {
      method: "PATCH",
      headers: { "If-Match": bill.updated_at },
      body: JSON.stringify(buildPayload(values)),
    });
    await fetchBill();
  }

  async function handlePost(values: BillSubmitValues) {
    if (!bill) return;
    await apiReq(`/api/v1/bills/${id}`, {
      method: "PATCH",
      headers: { "If-Match": bill.updated_at },
      body: JSON.stringify(buildPayload(values)),
    });
    await apiReq(`/api/v1/bills/${id}/post`, { method: "POST", body: JSON.stringify({}) });
    await fetchBill();
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div>
        <div style={{ padding: "12px 16px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 5, fontSize: 13, color: "var(--error)", marginBottom: 12 }}>
          {error ?? "Bill not found"}
        </div>
        <button
          onClick={() => router.push("/ap/bills")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          <ArrowLeft size={12} />
          Back to Bills
        </button>
      </div>
    );
  }

  if (bill.status === "DRAFT") {
    return (
      <>
        <span data-testid="status-badge" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>DRAFT</span>
        <BillForm
          key={bill.updated_at}
          defaultValues={{
          vendor_id: bill.vendor_id,
          vendor_invoice_no: bill.vendor_invoice_no ?? "",
          branch_code: bill.branch_code,
          issue_date: toDateInput(bill.issue_date),
          due_date: toDateInput(bill.due_date),
          vat_inclusive: bill.vat_inclusive,
          notes: bill.notes ?? "",
          lines: bill.lines.map((l) => ({
            description: l.description,
            expense_account_code: l.expense_account_code,
            qty: l.qty,
            unit_price: l.unit_price,
            vat_rate: new Decimal(l.vat_rate).eq(7) ? "7" : new Decimal(l.vat_rate).eq(0) ? "0" : "EXEMPT",
            withholding_type: (l.withholding_type as "services" | "goods" | "rent" | "transportation" | "professional" | "interest" | "royalties" | "advertising" | "") ?? "",
            withholding_rate: l.withholding_rate,
          })),
        }}
        onSaveDraft={handleSaveDraft}
        onPost={handlePost}
        onCancel={() => router.push("/ap/bills")}
      />
      </>
    );
  }

  return <BillReadOnly bill={bill} onRefresh={fetchBill} />;
}

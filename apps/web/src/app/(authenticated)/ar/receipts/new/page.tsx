"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { CustomerPicker, type CustomerOption } from "@/components/ui/customer-picker";
import { SlipVerifyWidget, type SlipVerifyStatus } from "@/components/ar/receipt-form";
import { ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";
import { format } from "date-fns";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "PROMPTPAY" | "CHEQUE" | "OTHER";

interface Invoice {
  id: string;
  invoice_no: string;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
}

interface BankAccount {
  id: string;
  code: string;
  name: string;
  bank_name: string;
}

async function apiReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 204) return undefined as T;
  const body: { success: boolean; data?: T; error?: { code: string; message: string } } = await res.json();
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

function today(): string {
  return new Date().toISOString().split("T")[0]!;
}

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 4,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

const SELECT: React.CSSProperties = {
  ...INPUT,
  cursor: "pointer",
  appearance: "none" as const,
};

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 16,
  marginBottom: 14,
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

const BRANCH_OPTIONS = ["TL", "EK", "RAMA9"] as const;
const PM_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "CASH", label: "เงินสด (Cash)" },
  { value: "TRANSFER", label: "โอนเงิน (Transfer)" },
  { value: "CARD", label: "บัตรเครดิต/เดบิต (Card)" },
  { value: "PROMPTPAY", label: "พร้อมเพย์ (PromptPay)" },
  { value: "CHEQUE", label: "เช็ค (Cheque)" },
  { value: "OTHER", label: "อื่นๆ (Other)" },
];

function NewReceiptForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefillCustomerId = searchParams.get("customer_id");
  const prefillInvoiceId = searchParams.get("invoice_id");

  const [customerId, setCustomerId] = useState<string | null>(prefillCustomerId);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, string>>({});

  const [receiptDate, setReceiptDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [bankAccountId, setBankAccountId] = useState("");
  const [cardFee, setCardFee] = useState("0");
  const [slipRef, setSlipRef] = useState("");
  const [branchCode, setBranchCode] = useState<string>("TL");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("0.00");
  const [totalOverride, setTotalOverride] = useState(false);

  const [slipVerifyStatus, setSlipVerifyStatus] = useState<SlipVerifyStatus>("idle");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load bank accounts once
  useEffect(() => {
    apiReq<BankAccount[]>("/api/v1/bank-accounts")
      .then((data) => setBankAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadInvoices = useCallback(async (cid: string) => {
    setInvoicesLoading(true);
    setInvoices([]);
    setSelectedInvoices({});
    try {
      const [posted, partial] = await Promise.all([
        apiReq<{ data: Invoice[] }>(`/api/v1/sales-invoices?customer_id=${cid}&status=POSTED&page_size=100`),
        apiReq<{ data: Invoice[] }>(`/api/v1/sales-invoices?customer_id=${cid}&status=PARTIAL_PAID&page_size=100`),
      ]);
      const all = [...(posted.data ?? []), ...(partial.data ?? [])];
      setInvoices(all);

      // Pre-select the invoice from query param
      if (prefillInvoiceId) {
        const found = all.find((inv) => inv.id === prefillInvoiceId);
        if (found) {
          const bal = new Decimal(found.total).minus(new Decimal(found.paid_amount)).toFixed(2);
          setSelectedInvoices({ [found.id]: bal });
        }
      }
    } catch {
      // ignore
    } finally {
      setInvoicesLoading(false);
    }
  }, [prefillInvoiceId]);

  useEffect(() => {
    if (customerId) {
      loadInvoices(customerId);
    } else {
      setInvoices([]);
      setSelectedInvoices({});
    }
  }, [customerId, loadInvoices]);

  // Recompute total when selection changes (unless user overrode it)
  useEffect(() => {
    if (!totalOverride) {
      const sum = Object.values(selectedInvoices).reduce(
        (s, v) => s.plus(new Decimal(v || "0")),
        new Decimal(0)
      );
      setTotalAmount(sum.toFixed(2));
    }
  }, [selectedInvoices, totalOverride]);

  function toggleInvoice(inv: Invoice, checked: boolean) {
    if (checked) {
      const bal = new Decimal(inv.total).minus(new Decimal(inv.paid_amount)).toFixed(2);
      setSelectedInvoices((prev) => ({ ...prev, [inv.id]: bal }));
    } else {
      setSelectedInvoices((prev) => {
        const next = { ...prev };
        delete next[inv.id];
        return next;
      });
    }
    setTotalOverride(false);
  }

  function setInvoiceAmount(invId: string, val: string) {
    setSelectedInvoices((prev) => ({ ...prev, [invId]: val }));
    setTotalOverride(false);
  }

  function handleTotalChange(val: string) {
    setTotalAmount(val);
    setTotalOverride(true);
  }

  function buildPayload() {
    const applications = Object.entries(selectedInvoices)
      .filter(([, amt]) => new Decimal(amt || "0").gt(0))
      .map(([invoice_id, applied_amount]) => ({ invoice_id, applied_amount }));

    return {
      customer_id: customerId!,
      branch_code: branchCode,
      receipt_date: receiptDate,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      bank_account_id: paymentMethod !== "CASH" && bankAccountId ? bankAccountId : undefined,
      card_fee: paymentMethod === "CARD" ? cardFee : "0",
      slip_ref: slipRef || undefined,
      notes: notes || undefined,
      applications,
    };
  }

  async function handleSaveDraft() {
    if (!customerId) { setError("กรุณาเลือกลูกค้า"); return; }
    setSaving(true);
    setError(null);
    try {
      const receipt = await apiReq<{ id: string }>("/api/v1/receipts", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      router.push(`/ar/receipts/${receipt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  const needsSlipVerify = paymentMethod === "TRANSFER" || paymentMethod === "PROMPTPAY";

  async function handlePost() {
    if (!customerId) { setError("กรุณาเลือกลูกค้า"); return; }
    if (needsSlipVerify && slipVerifyStatus !== "ok") {
      setError("กรุณาตรวจสอบสลิปก่อนบันทึก (Verify the payment slip first)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const receipt = await apiReq<{ id: string }>("/api/v1/receipts", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      await apiReq(`/api/v1/receipts/${receipt.id}/post`, { method: "POST", body: JSON.stringify({}) });
      router.push(`/ar/receipts/${receipt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Page header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div>
          <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <a href="/ar/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AR</a>
            {" / "}
            <a href="/ar/receipts" style={{ color: "inherit", textDecoration: "none" }}>Receipts</a>
            {" / "}
            <span>New</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            ใบเสร็จรับเงิน · New Receipt
          </h1>
        </div>
        <button
          onClick={() => router.push("/ar/receipts")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--text-muted)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            marginTop: 4,
          }}
        >
          <ArrowLeft size={12} />
          Back
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div>
          {/* Customer */}
          <div style={CARD}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              ลูกค้า · Customer
            </div>
            <CustomerPicker
              value={customerId}
              onChange={(id: string | null, _customer: CustomerOption | null) => {
                setCustomerId(id);
              }}
              disabled={saving}
            />
          </div>

          {/* Unpaid invoices */}
          {customerId && (
            <div style={CARD}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                ใบแจ้งหนี้ที่ค้างชำระ · Unpaid Invoices
              </div>
              {invoicesLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
                </div>
              ) : invoices.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
                  ไม่มีใบแจ้งหนี้ที่ค้างชำระ
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 32 }}></th>
                        <th style={TH}>Invoice #</th>
                        <th style={{ ...TH, textAlign: "right" }}>Issue Date</th>
                        <th style={{ ...TH, textAlign: "right" }}>Due Date</th>
                        <th style={{ ...TH, textAlign: "right" }}>Total</th>
                        <th style={{ ...TH, textAlign: "right" }}>Balance</th>
                        <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => {
                        const bal = new Decimal(inv.total).minus(new Decimal(inv.paid_amount));
                        const checked = inv.id in selectedInvoices;
                        return (
                          <tr key={inv.id} style={{ background: checked ? "rgba(100,140,220,0.05)" : "transparent" }}>
                            <td style={TD}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleInvoice(inv, e.target.checked)}
                                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                              />
                            </td>
                            <td style={TD}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                                {inv.invoice_no}
                              </span>
                            </td>
                            <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                              {fmtDate(inv.issue_date)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", color: new Date(inv.due_date) < new Date() ? "var(--error)" : "var(--text-muted)" }}>
                              {fmtDate(inv.due_date)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {fmtMoney(inv.total)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 500 }}>
                              {fmtMoney(bal)}
                            </td>
                            <td style={{ ...TD, textAlign: "right" }}>
                              {checked && (
                                <input
                                  type="number"
                                  value={selectedInvoices[inv.id] ?? ""}
                                  onChange={(e) => setInvoiceAmount(inv.id, e.target.value)}
                                  min={0}
                                  max={bal.toNumber()}
                                  step="0.01"
                                  style={{
                                    width: 90,
                                    height: 26,
                                    padding: "0 6px",
                                    fontSize: 12,
                                    borderRadius: 3,
                                    border: "1px solid var(--border-strong)",
                                    background: "var(--surface)",
                                    color: "var(--text-primary)",
                                    fontFamily: "var(--font-mono)",
                                    outline: "none",
                                    textAlign: "right",
                                  }}
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div>
          {/* Payment details */}
          <div style={CARD}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              รายละเอียดการชำระ · Payment
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={LABEL}>วันที่รับเงิน *</label>
                <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} style={INPUT} required />
              </div>

              <div>
                <label style={LABEL}>Branch</label>
                <select value={branchCode} onChange={(e) => setBranchCode(e.target.value)} style={SELECT}>
                  {BRANCH_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={LABEL}>วิธีชำระเงิน *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    setPaymentMethod(e.target.value as PaymentMethod);
                    setBankAccountId("");
                    setCardFee("0");
                    setSlipVerifyStatus("idle");
                  }}
                  style={SELECT}
                >
                  {PM_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {paymentMethod !== "CASH" && (
                <div>
                  <label style={LABEL}>บัญชีธนาคาร *</label>
                  <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} style={SELECT}>
                    <option value="">เลือกบัญชี...</option>
                    {bankAccounts.map((ba) => (
                      <option key={ba.id} value={ba.id}>{ba.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {paymentMethod === "CARD" && (
                <div>
                  <label style={LABEL}>ค่าธรรมเนียมบัตร (Card Fee)</label>
                  <input
                    type="number"
                    value={cardFee}
                    onChange={(e) => setCardFee(e.target.value)}
                    min={0}
                    step="0.01"
                    style={{ ...INPUT, fontFamily: "var(--font-mono)" }}
                  />
                </div>
              )}

              {(paymentMethod === "TRANSFER" || paymentMethod === "PROMPTPAY") && (
                <SlipVerifyWidget
                  slipRef={slipRef}
                  onSlipRefChange={setSlipRef}
                  expectedAmount={totalAmount}
                  receiptDate={receiptDate}
                  onStatusChange={setSlipVerifyStatus}
                />
              )}

              {paymentMethod !== "CASH" && paymentMethod !== "TRANSFER" && paymentMethod !== "PROMPTPAY" && (
                <div>
                  <label style={LABEL}>Slip Ref</label>
                  <input type="text" value={slipRef} onChange={(e) => setSlipRef(e.target.value)} style={INPUT} placeholder="เลขที่อ้างอิงการโอน" />
                </div>
              )}

              <div>
                <label style={LABEL}>ยอดรับชำระรวม *</label>
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => handleTotalChange(e.target.value)}
                  min={0}
                  step="0.01"
                  style={{ ...INPUT, fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 14 }}
                />
              </div>

              <div>
                <label style={LABEL}>หมายเหตุ</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  style={{ ...INPUT, height: "auto", padding: "6px 10px", resize: "vertical" }}
                  placeholder="หมายเหตุ (ถ้ามี)"
                />
              </div>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--error)",
                marginBottom: 10,
              }}
            >
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              style={{
                flex: 1,
                padding: "8px 0",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? <Loader2 size={12} className="animate-spin" style={{ display: "inline" }} /> : null}
              {" "}Save Draft
            </button>
            <button
              onClick={handlePost}
              disabled={saving}
              style={{
                flex: 1,
                padding: "8px 0",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: saving ? 0.6 : 1,
              }}
            >
              Post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewReceiptPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    }>
      <NewReceiptForm />
    </Suspense>
  );
}

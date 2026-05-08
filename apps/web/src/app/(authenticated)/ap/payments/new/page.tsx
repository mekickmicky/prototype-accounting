"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { VendorPicker, type VendorOption } from "@/components/ui/vendor-picker";
import { ApiError } from "@/lib/api-client";
import { format } from "date-fns";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type PaymentMethod = "CASH" | "TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "QR" | "CHEQUE" | "OTHER";

interface Bill {
  id: string;
  bill_no: string | null;
  vendor_invoice_no: string | null;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  withholding_total: string;
  net_payable: string;
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

function fmtMoney(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
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
  { value: "CREDIT_CARD", label: "บัตรเครดิต (Credit Card)" },
  { value: "DEBIT_CARD", label: "บัตรเดบิต (Debit Card)" },
  { value: "QR", label: "QR Code" },
  { value: "CHEQUE", label: "เช็ค (Cheque)" },
  { value: "OTHER", label: "อื่นๆ (Other)" },
];

function NewPaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const prefillVendorId = searchParams.get("vendor_id");
  const prefillBillId = searchParams.get("bill_id");

  const [vendorId, setVendorId] = useState<string | null>(prefillVendorId);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [selectedBills, setSelectedBills] = useState<Record<string, string>>({});

  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("TRANSFER");
  const [bankAccountId, setBankAccountId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [branchCode, setBranchCode] = useState<string>("TL");
  const [notes, setNotes] = useState("");
  const [totalAmount, setTotalAmount] = useState("0.00");
  const [totalOverride, setTotalOverride] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiReq<BankAccount[]>("/api/v1/bank-accounts")
      .then((data) => setBankAccounts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const loadBills = useCallback(async (vid: string) => {
    setBillsLoading(true);
    setBills([]);
    setSelectedBills({});
    try {
      const [posted, partial] = await Promise.all([
        apiReq<{ data: Bill[] }>(`/api/v1/bills?vendor_id=${vid}&status=POSTED&page_size=100`),
        apiReq<{ data: Bill[] }>(`/api/v1/bills?vendor_id=${vid}&status=PARTIAL_PAID&page_size=100`),
      ]);
      const all = [...(posted.data ?? []), ...(partial.data ?? [])];
      setBills(all);

      if (prefillBillId) {
        const found = all.find((b) => b.id === prefillBillId);
        if (found) {
          const bal = (parseFloat(found.net_payable) - parseFloat(found.paid_amount)).toFixed(2);
          setSelectedBills({ [found.id]: bal });
        }
      }
    } catch {
      // ignore
    } finally {
      setBillsLoading(false);
    }
  }, [prefillBillId]);

  useEffect(() => {
    if (vendorId) {
      loadBills(vendorId);
    } else {
      setBills([]);
      setSelectedBills({});
    }
  }, [vendorId, loadBills]);

  useEffect(() => {
    if (!totalOverride) {
      const sum = Object.values(selectedBills).reduce((s, v) => s + parseFloat(v || "0"), 0);
      setTotalAmount(sum.toFixed(2));
    }
  }, [selectedBills, totalOverride]);

  function toggleBill(bill: Bill, checked: boolean) {
    if (checked) {
      const netPaid = parseFloat(bill.net_payable) - parseFloat(bill.paid_amount);
      setSelectedBills((prev) => ({ ...prev, [bill.id]: netPaid.toFixed(2) }));
    } else {
      setSelectedBills((prev) => {
        const next = { ...prev };
        delete next[bill.id];
        return next;
      });
    }
    setTotalOverride(false);
  }

  function setBillAmount(billId: string, val: string) {
    setSelectedBills((prev) => ({ ...prev, [billId]: val }));
    setTotalOverride(false);
  }

  function handleTotalChange(val: string) {
    setTotalAmount(val);
    setTotalOverride(true);
  }

  function buildPayload() {
    const applications = Object.entries(selectedBills)
      .filter(([, amt]) => parseFloat(amt || "0") > 0)
      .map(([bill_id, applied_amount]) => ({ bill_id, applied_amount }));

    return {
      vendor_id: vendorId!,
      branch_code: branchCode,
      payment_date: paymentDate,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      bank_account_id: paymentMethod !== "CASH" && bankAccountId ? bankAccountId : undefined,
      cheque_no: paymentMethod === "CHEQUE" && chequeNo ? chequeNo : undefined,
      notes: notes || undefined,
      applications,
    };
  }

  async function handleSaveDraft() {
    if (!vendorId) { setError("กรุณาเลือกเจ้าหนี้"); return; }
    setSaving(true);
    setError(null);
    try {
      const payment = await apiReq<{ id: string }>("/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      router.push(`/ap/payments/${payment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  async function handlePost() {
    if (!vendorId) { setError("กรุณาเลือกเจ้าหนี้"); return; }
    setSaving(true);
    setError(null);
    try {
      const payment = await apiReq<{ id: string }>("/api/v1/payments", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      await apiReq(`/api/v1/payments/${payment.id}/post`, { method: "POST", body: JSON.stringify({}) });
      router.push(`/ap/payments/${payment.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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
            <a href="/ap/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AP</a>
            {" / "}
            <a href="/ap/payments" style={{ color: "inherit", textDecoration: "none" }}>Payments</a>
            {" / "}
            <span>New</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            ใบสั่งจ่ายเงิน · New Payment
          </h1>
        </div>
        <button
          onClick={() => router.push("/ap/payments")}
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
          {/* Vendor */}
          <div style={CARD}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              เจ้าหนี้ · Vendor
            </div>
            <VendorPicker
              value={vendorId}
              onChange={(id: string | null, _vendor: VendorOption | null) => {
                setVendorId(id);
              }}
              disabled={saving}
            />
          </div>

          {/* Unpaid bills */}
          {vendorId && (
            <div style={CARD}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                บิลที่ค้างชำระ · Unpaid Bills
              </div>
              {billsLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 0", color: "var(--text-muted)", fontSize: 12 }}>
                  <Loader2 size={13} className="animate-spin" /> กำลังโหลด...
                </div>
              ) : bills.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
                  ไม่มีบิลที่ค้างชำระ
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 32 }}></th>
                        <th style={TH}>Bill #</th>
                        <th style={TH}>Vendor Ref</th>
                        <th style={{ ...TH, textAlign: "right" }}>Issue</th>
                        <th style={{ ...TH, textAlign: "right" }}>Due</th>
                        <th style={{ ...TH, textAlign: "right" }}>Total</th>
                        <th style={{ ...TH, textAlign: "right" }}>WHT</th>
                        <th style={{ ...TH, textAlign: "right" }}>Net Payable</th>
                        <th style={{ ...TH, textAlign: "right" }}>Balance</th>
                        <th style={{ ...TH, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((bill) => {
                        const netPayable = parseFloat(bill.net_payable);
                        const paid = parseFloat(bill.paid_amount);
                        const bal = netPayable - paid;
                        const checked = bill.id in selectedBills;
                        return (
                          <tr key={bill.id} style={{ background: checked ? "rgba(100,140,220,0.05)" : "transparent" }}>
                            <td style={TD}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleBill(bill, e.target.checked)}
                                style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                              />
                            </td>
                            <td style={TD}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                                {bill.bill_no ?? "—"}
                              </span>
                            </td>
                            <td style={TD}>
                              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                {bill.vendor_invoice_no ?? "—"}
                              </span>
                            </td>
                            <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                              {fmtDate(bill.issue_date)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", color: new Date(bill.due_date) < new Date() ? "var(--error)" : "var(--text-muted)" }}>
                              {fmtDate(bill.due_date)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                              {fmtMoney(bill.total)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "#C8A03C" }}>
                              {parseFloat(bill.withholding_total) > 0 ? `(${fmtMoney(bill.withholding_total)})` : "—"}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                              {fmtMoney(bill.net_payable)}
                            </td>
                            <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 500 }}>
                              {fmtMoney(bal)}
                            </td>
                            <td style={{ ...TD, textAlign: "right" }}>
                              {checked && (
                                <input
                                  type="number"
                                  value={selectedBills[bill.id] ?? ""}
                                  onChange={(e) => setBillAmount(bill.id, e.target.value)}
                                  min={0}
                                  max={bal}
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
          <div style={CARD}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 12, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              รายละเอียดการจ่าย · Payment
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={LABEL}>วันที่จ่ายเงิน *</label>
                <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} style={INPUT} required />
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
                    setChequeNo("");
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

              {paymentMethod === "CHEQUE" && (
                <div>
                  <label style={LABEL}>เลขที่เช็ค (Cheque No)</label>
                  <input
                    type="text"
                    value={chequeNo}
                    onChange={(e) => setChequeNo(e.target.value)}
                    style={INPUT}
                    placeholder="เลขที่เช็ค"
                  />
                </div>
              )}

              <div>
                <label style={LABEL}>ยอดจ่ายรวม *</label>
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

export default function NewPaymentPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    }>
      <NewPaymentForm />
    </Suspense>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, ArrowLeft, FileDown, XCircle, X, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ReceiptStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "PROMPTPAY" | "CHEQUE" | "OTHER";

interface ReceiptApplication {
  id: string;
  invoice_id: string;
  applied_amount: string;
  applied_at: string;
}

interface Receipt {
  id: string;
  receipt_no: string;
  customer_id: string;
  customer: {
    id: string;
    code: string;
    name: string;
    name_th: string | null;
    tax_id: string | null;
    phone: string | null;
    email: string | null;
  };
  branch_code: string;
  receipt_date: string;
  total_amount: string;
  payment_method: PaymentMethod;
  bank_account_id: string | null;
  bank_account: { id: string; code: string; account_name: string; bank_name: string } | null;
  card_fee: string;
  slip_ref: string | null;
  status: ReceiptStatus;
  je_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  applications: ReceiptApplication[];
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

const PM_LABELS: Record<PaymentMethod, string> = {
  CASH: "เงินสด (Cash)",
  TRANSFER: "โอนเงิน (Transfer)",
  CARD: "บัตรเครดิต/เดบิต (Card)",
  PROMPTPAY: "พร้อมเพย์ (PromptPay)",
  CHEQUE: "เช็ค (Cheque)",
  OTHER: "อื่นๆ (Other)",
};

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOID: "Void",
};

const STATUS_COLORS: Record<ReceiptStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
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
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: 2,
        }}
      >
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

export default function ReceiptDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // invoice_no lookup: map from invoice_id → invoice_no
  const [invoiceNos, setInvoiceNos] = useState<Record<string, string>>({});

  const [posting, setPosting] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchReceipt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiReq<Receipt>(`/api/v1/receipts/${id}`);
      setReceipt(data);
      // Fetch invoice numbers for applications
      if (data.applications.length > 0) {
        const results = await Promise.allSettled(
          data.applications.map((app) =>
            apiReq<{ invoice_no: string }>(`/api/v1/sales-invoices/${app.invoice_id}`).then((inv) => ({
              invoice_id: app.invoice_id,
              invoice_no: inv.invoice_no,
            }))
          )
        );
        const map: Record<string, string> = {};
        for (const r of results) {
          if (r.status === "fulfilled") {
            map[r.value.invoice_id] = r.value.invoice_no;
          }
        }
        setInvoiceNos(map);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  async function handlePost() {
    if (!receipt) return;
    setPosting(true);
    setActionError(null);
    try {
      await apiReq(`/api/v1/receipts/${id}/post`, { method: "POST", body: JSON.stringify({}) });
      await fetchReceipt();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setPosting(false);
    }
  }

  async function handleVoid() {
    if (!voidReason.trim()) {
      setVoidError("กรุณาระบุเหตุผล");
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      await apiReq(`/api/v1/receipts/${id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason.trim() }),
      });
      setShowVoid(false);
      await fetchReceipt();
    } catch (err) {
      setVoidError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setVoiding(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (error || !receipt) {
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
          {error ?? "Receipt not found"}
        </div>
        <button
          onClick={() => router.push("/ar/receipts")}
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
          Back to Receipts
        </button>
      </div>
    );
  }

  const isVoid = receipt.status === "VOID";
  const isDraft = receipt.status === "DRAFT";
  const isPosted = receipt.status === "POSTED";
  const canPost = isDraft;
  const canVoid = isPosted;
  const pdfUrl = `${API_BASE}/api/v1/receipts/${id}/pdf`;

  const { bg: statusBg, color: statusColor } = STATUS_COLORS[receipt.status];
  const totalApplied = receipt.applications.reduce(
    (s, a) => s.plus(new Decimal(a.applied_amount)),
    new Decimal(0)
  );
  const advance = new Decimal(receipt.total_amount).minus(totalApplied);

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
            <a href="/ar/receipts" style={{ color: "inherit", textDecoration: "none" }}>Receipts</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {receipt.receipt_no.startsWith("DRAFT-") ? "(Draft)" : receipt.receipt_no}
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
              {receipt.receipt_no.startsWith("DRAFT-") ? "ใบเสร็จ (Draft)" : receipt.receipt_no}
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
              {STATUS_LABELS[receipt.status]}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 4 }}>
          {isPosted && (
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
          {canPost && (
            <button
              onClick={handlePost}
              disabled={posting}
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
                cursor: posting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: posting ? 0.7 : 1,
              }}
            >
              {posting && <Loader2 size={12} className="animate-spin" />}
              Post Receipt
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
            }}
          >
            <ArrowLeft size={12} />
            Back
          </button>
        </div>
      </div>

      {actionError && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
            marginBottom: 14,
          }}
        >
          {actionError}
        </div>
      )}

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
              ใบเสร็จถูกยกเลิก (Void)
              {receipt.voided_at && (
                <span style={{ fontWeight: 400, marginLeft: 8, color: "var(--text-muted)" }}>
                  · {fmtDate(receipt.voided_at)}
                </span>
              )}
              {receipt.je_id && (
                <a
                  href={`/gl/journal-entries/${receipt.je_id}`}
                  style={{
                    marginLeft: 12,
                    fontSize: 11,
                    color: "var(--accent)",
                    textDecoration: "none",
                    fontWeight: 400,
                  }}
                >
                  Reversal JE →
                </a>
              )}
            </div>
            {receipt.void_reason && (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{receipt.void_reason}</div>
            )}
          </div>
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Receipt info */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ข้อมูลใบเสร็จ · Receipt Info</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              <Field label="ลูกค้า" value={receipt.customer.name_th ?? receipt.customer.name} />
              <Field label="Branch" value={receipt.branch_code} mono />
              <Field label="Receipt Date" value={fmtDate(receipt.receipt_date)} />
              <Field label="วิธีชำระ" value={PM_LABELS[receipt.payment_method]} />
              <Field
                label="Bank Account"
                value={
                  receipt.bank_account
                    ? `${receipt.bank_account.bank_name} — ${receipt.bank_account.account_name}`
                    : null
                }
              />
              <Field label="Slip Ref" value={receipt.slip_ref} mono />
            </div>
            {receipt.notes && (
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
                {receipt.notes}
              </div>
            )}
          </div>

          {/* Applications table */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>การจัดสรรชำระ · Invoice Applications</div>
            {receipt.applications.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>
                ไม่มีการจัดสรร — ยอดชำระทั้งหมดเป็น Advance Payment
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={TH}>Invoice #</th>
                      <th style={{ ...TH, textAlign: "right" }}>Applied Amount</th>
                      <th style={{ ...TH, textAlign: "right" }}>Applied At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.applications.map((app) => (
                      <tr key={app.id}>
                        <td style={TD}>
                          <a
                            href={`/ar/invoices/${app.invoice_id}`}
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            {invoiceNos[app.invoice_id] ?? app.invoice_id}
                          </a>
                        </td>
                        <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {fmtMoney(app.applied_amount)}
                        </td>
                        <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                          {fmtDate(app.applied_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          padding: "8px 6px 4px",
                          fontSize: 12,
                          fontWeight: 600,
                          textAlign: "right",
                          borderTop: "1px solid var(--border)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {fmtMoney(totalApplied)}
                      </td>
                      <td
                        style={{
                          padding: "8px 6px 4px",
                          fontSize: 10,
                          color: "var(--text-dim)",
                          borderTop: "1px solid var(--border)",
                          textAlign: "right",
                        }}
                      >
                        total applied
                      </td>
                    </tr>
                    {advance.gt(new Decimal("0.005")) && (
                      <tr>
                        <td
                          colSpan={2}
                          style={{
                            padding: "2px 6px 4px",
                            fontSize: 12,
                            textAlign: "right",
                            fontFamily: "var(--font-mono)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {fmtMoney(advance)}
                        </td>
                        <td
                          style={{
                            padding: "2px 6px 4px",
                            fontSize: 10,
                            color: "var(--text-dim)",
                            textAlign: "right",
                          }}
                        >
                          advance (unapplied)
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Amount summary */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ยอดรับชำระ · Amount</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>ยอดรับชำระรวม</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--accent)" }}>
                  {fmtMoney(receipt.total_amount)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>จัดสรรแล้ว</span>
                <span style={{ fontFamily: "var(--font-mono)" }}>({fmtMoney(totalApplied)})</span>
              </div>
              {new Decimal(receipt.card_fee).gt(0) && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>ค่าธรรมเนียมบัตร</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--error)" }}>
                    ({fmtMoney(receipt.card_fee)})
                  </span>
                </div>
              )}
              {advance.gt(new Decimal("0.005")) && (
                <>
                  <div style={{ borderTop: "1px solid var(--border)", margin: "2px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-muted)" }}>Advance (คงค้าง)</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "#C8A03C" }}>
                      {fmtMoney(advance)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* JE link */}
          {receipt.je_id && !isVoid && (
            <div style={CARD}>
              <div style={SECTION_TITLE}>Journal Entry</div>
              <a
                href={`/gl/journal-entries/${receipt.je_id}`}
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent)",
                  textDecoration: "none",
                }}
              >
                View JE →
              </a>
            </div>
          )}

          {/* Customer quick-view */}
          <div style={CARD}>
            <div style={SECTION_TITLE}>ลูกค้า · Customer</div>
            <a
              href={`/ar/customers/${receipt.customer_id}`}
              style={{
                fontSize: 13,
                color: "var(--accent)",
                textDecoration: "none",
                display: "block",
                marginBottom: 4,
              }}
            >
              {receipt.customer.name_th ?? receipt.customer.name}
            </a>
            {receipt.customer.name_th && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                {receipt.customer.name}
              </div>
            )}
            {receipt.customer.tax_id && (
              <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", marginBottom: 2 }}>
                Tax ID: {receipt.customer.tax_id}
              </div>
            )}
            {receipt.customer.phone && (
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{receipt.customer.phone}</div>
            )}
          </div>
        </div>
      </div>

      {/* Void dialog */}
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
                ยืนยันการยกเลิก (Void Receipt)
              </h2>
              <button
                onClick={() => setShowVoid(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-dim)",
                  padding: 2,
                  display: "flex",
                }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: "14px 18px" }}>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
                ใบเสร็จ{" "}
                <strong style={{ color: "var(--text-primary)" }}>{receipt.receipt_no}</strong>{" "}
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
                onClick={handleVoid}
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

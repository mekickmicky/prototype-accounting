"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, FileText, Download } from "lucide-react";
import Link from "next/link";
import Decimal from "decimal.js";
import { ApiError } from "@/lib/api-client";
import { format } from "date-fns";

const API_BASE = "";

type PaymentStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentMethod = "CASH" | "TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "QR" | "CHEQUE" | "OTHER";

interface PaymentApplication {
  id: string;
  applied_amount: string;
  bill: {
    id: string;
    bill_no: string | null;
    issue_date: string;
    total: string;
  };
}

interface WithholdingRecord {
  id: string;
  cert_no: string;
  wht_type: string;
  wht_rate: string;
  gross_amount: string;
  wht_amount: string;
  payment_date: string;
  period_code: string;
}

interface Payment {
  id: string;
  payment_no: string;
  vendor: {
    id: string;
    code: string;
    name: string;
    name_th: string | null;
    tax_id: string | null;
  };
  bank_account: { id: string; name: string; account_number: string | null } | null;
  branch_code: string;
  payment_date: string;
  total_amount: string;
  payment_method: PaymentMethod;
  cheque_no: string | null;
  notes: string | null;
  status: PaymentStatus;
  journal_entry_id: string | null;
  applications: PaymentApplication[];
  withholding: WithholdingRecord[];
  created_at: string;
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
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOID: "Void",
};

const STATUS_COLORS: Record<PaymentStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const PM_LABELS: Record<PaymentMethod, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอนเงิน",
  CREDIT_CARD: "บัตรเครดิต",
  DEBIT_CARD: "บัตรเดบิต",
  QR: "QR Code",
  CHEQUE: "เช็ค",
  OTHER: "อื่นๆ",
};

const TH: React.CSSProperties = {
  textAlign: "left",
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 500,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
  background: "var(--bg-elevated)",
};

const TD: React.CSSProperties = {
  padding: "8px",
  fontSize: 12,
  borderBottom: "1px solid rgba(255,255,255,0.04)",
  verticalAlign: "middle",
};

const SECTION_HEAD: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 10,
  paddingBottom: 6,
  borderBottom: "1px solid var(--border)",
};

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 16,
  marginBottom: 16,
};

const META_ROW: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "5px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};

const META_LABEL: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
};

const META_VALUE: React.CSSProperties = {
  fontSize: 12,
  color: "var(--text-primary)",
  textAlign: "right",
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [showVoidForm, setShowVoidForm] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiReq<Payment>(`/api/v1/payments/${id}`)
      .then((data) => setPayment(data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load payment"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handlePost() {
    if (!payment) return;
    setActing(true);
    setActionError(null);
    try {
      const updated = await apiReq<Payment>(`/api/v1/payments/${id}/post`, { method: "POST", body: JSON.stringify({}) });
      setPayment(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActing(false);
    }
  }

  async function handleVoid() {
    if (!payment || !voidReason.trim()) return;
    setActing(true);
    setActionError(null);
    try {
      const updated = await apiReq<Payment>(`/api/v1/payments/${id}/void`, {
        method: "POST",
        body: JSON.stringify({ reason: voidReason }),
      });
      setPayment(updated);
      setShowVoidForm(false);
      setVoidReason("");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setActing(false);
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

  if (error || !payment) {
    return (
      <div style={{ padding: "40px 0" }}>
        <div style={{ fontSize: 13, color: "var(--error)", marginBottom: 12 }}>
          {error ?? "ไม่พบข้อมูล"}
        </div>
        <Link
          href="/ap/payments"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
        >
          <ArrowLeft size={12} />
          Back to payments
        </Link>
      </div>
    );
  }

  const { bg: statusBg, color: statusColor } = STATUS_COLORS[payment.status] ?? STATUS_COLORS.DRAFT;
  const totalWht = payment.withholding.reduce((acc, w) => acc.plus(w.wht_amount), new Decimal(0)).toNumber();
  const netPaid = new Decimal(payment.total_amount).minus(totalWht).toNumber();

  return (
    <div>
      {/* Header */}
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
            <span style={{ fontFamily: "var(--font-mono)" }}>{payment.payment_no}</span>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              {payment.payment_no}
            </h1>
            <span
              data-testid="status-badge"
              style={{
                display: "inline-block",
                padding: "2px 9px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                background: statusBg,
                color: statusColor,
              }}
            >
              {STATUS_LABELS[payment.status]}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          {payment.status === "POSTED" && (
            <a
              data-testid="action-export-pdf"
              href={`${API_BASE}/api/v1/payments/${id}/pdf`}
              download
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <Download size={12} />
              Payment Voucher PDF
            </a>
          )}
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
            }}
          >
            <ArrowLeft size={12} />
            Back
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {/* Left column */}
        <div>
          {/* Bill applications */}
          <div style={CARD}>
            <div style={SECTION_HEAD}>บิลที่ใช้ชำระ · Bill Applications</div>
            {payment.applications.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>ไม่มีบิลที่ผูกกับการชำระนี้</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Bill #</th>
                    <th style={{ ...TH, textAlign: "right" }}>Issue Date</th>
                    <th style={{ ...TH, textAlign: "right" }}>Bill Total</th>
                    <th style={{ ...TH, textAlign: "right" }}>Applied</th>
                    <th style={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {payment.applications.map((app) => (
                    <tr key={app.id}>
                      <td style={TD}>
                        <a
                          href={`/ap/bills/${app.bill.id}`}
                          style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
                        >
                          {app.bill.bill_no ?? app.bill.id.slice(0, 8)}
                        </a>
                      </td>
                      <td style={{ ...TD, textAlign: "right", color: "var(--text-muted)" }}>
                        {fmtDate(app.bill.issue_date)}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {fmtMoney(app.bill.total)}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "#6CB278", fontWeight: 500 }}>
                        {fmtMoney(app.applied_amount)}
                      </td>
                      <td style={TD}></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ ...TD, fontSize: 11, color: "var(--text-muted)", borderBottom: "none" }}>Total Applied</td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 13, borderBottom: "none" }}>
                      {fmtMoney(payment.applications.reduce((acc, a) => acc.plus(a.applied_amount), new Decimal(0)).toNumber())}
                    </td>
                    <td style={{ ...TD, borderBottom: "none" }}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* WHT certificates */}
          <div style={CARD}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              <div style={{ ...SECTION_HEAD, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
                หนังสือรับรองการหักภาษี ณ ที่จ่าย · WHT Certificates
              </div>
              {payment.withholding.length > 1 && payment.status === "POSTED" && (
                <button
                  onClick={() => {
                    payment.withholding.forEach((w) => {
                      window.open(`${API_BASE}/api/v1/payments/${id}/wht-certs/${w.id}/pdf`, "_blank");
                    });
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 8px",
                    fontSize: 11,
                    borderRadius: 3,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <Download size={11} />
                  Download All
                </button>
              )}
            </div>

            {payment.withholding.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
                {payment.status === "POSTED" ? "ไม่มี WHT สำหรับการชำระนี้" : "WHT certificates จะสร้างเมื่อ Post"}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={TH}>Cert #</th>
                    <th style={TH}>Type</th>
                    <th style={{ ...TH, textAlign: "right" }}>Rate</th>
                    <th style={{ ...TH, textAlign: "right" }}>Gross</th>
                    <th style={{ ...TH, textAlign: "right" }}>WHT</th>
                    <th style={TH}>Period</th>
                    <th style={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {payment.withholding.map((w) => (
                    <tr key={w.id}>
                      <td style={TD}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                          {w.cert_no}
                        </span>
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: "var(--text-muted)", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.wht_type}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "#C8A03C" }}>
                        {new Decimal(w.wht_rate).toNumber()}%
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {fmtMoney(w.gross_amount)}
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", color: "#C8A03C", fontWeight: 500 }}>
                        {fmtMoney(w.wht_amount)}
                      </td>
                      <td style={{ ...TD, fontSize: 11, color: "var(--text-dim)" }}>
                        {w.period_code}
                      </td>
                      <td style={TD}>
                        {payment.status === "POSTED" && (
                          <a
                            href={`${API_BASE}/api/v1/payments/${id}/wht-certs/${w.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              fontSize: 11,
                              color: "var(--accent)",
                              textDecoration: "none",
                            }}
                          >
                            <FileText size={11} />
                            PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{ ...TD, fontSize: 11, color: "var(--text-muted)", borderBottom: "none" }}>Total WHT</td>
                    <td style={{ ...TD, textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600, color: "#C8A03C", fontSize: 13, borderBottom: "none" }}>
                      ({fmtMoney(totalWht)})
                    </td>
                    <td colSpan={2} style={{ ...TD, borderBottom: "none" }}></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* JE link */}
          {payment.journal_entry_id && (
            <div style={{ ...CARD, padding: "10px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Journal Entry</span>
                <a
                  href={`/gl/journal-entries/${payment.journal_entry_id}`}
                  style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}
                >
                  View JE →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div>
          <div style={CARD}>
            <div style={SECTION_HEAD}>รายละเอียด · Details</div>
            <div>
              {[
                { label: "วันที่", value: fmtDate(payment.payment_date) },
                { label: "Branch", value: payment.branch_code },
                {
                  label: "เจ้าหนี้",
                  value: (
                    <a href={`/ap/vendors/${payment.vendor.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
                      {payment.vendor.name_th ?? payment.vendor.name}
                    </a>
                  ),
                },
                payment.vendor.tax_id ? { label: "Tax ID", value: <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{payment.vendor.tax_id}</span> } : null,
                { label: "วิธีชำระ", value: PM_LABELS[payment.payment_method] ?? payment.payment_method },
                payment.bank_account
                  ? { label: "บัญชีธนาคาร", value: `${payment.bank_account.name} (${payment.bank_account.account_number ?? '—'})` }
                  : null,
                payment.cheque_no ? { label: "เลขที่เช็ค", value: <span style={{ fontFamily: "var(--font-mono)" }}>{payment.cheque_no}</span> } : null,
              ]
                .filter(Boolean)
                .map((row, i) => (
                  <div key={i} style={META_ROW}>
                    <span style={META_LABEL}>{(row as { label: string; value: React.ReactNode }).label}</span>
                    <span style={META_VALUE}>{(row as { label: string; value: React.ReactNode }).value}</span>
                  </div>
                ))}
            </div>
          </div>

          <div style={CARD}>
            <div style={SECTION_HEAD}>สรุปยอด · Summary</div>
            <div>
              {[
                { label: "ยอดจ่ายรวม", value: fmtMoney(payment.total_amount), mono: true },
                totalWht > 0 ? { label: "หัก WHT", value: `(${fmtMoney(totalWht)})`, mono: true, highlight: "#C8A03C" } : null,
                { label: "สุทธิจ่าย", value: fmtMoney(netPaid), mono: true, bold: true, highlight: "#6CB278" },
              ]
                .filter(Boolean)
                .map((row, i) => {
                  const r = row as { label: string; value: string; mono?: boolean; bold?: boolean; highlight?: string };
                  return (
                    <div key={i} style={META_ROW}>
                      <span style={META_LABEL}>{r.label}</span>
                      <span
                        style={{
                          ...META_VALUE,
                          fontFamily: r.mono ? "var(--font-mono)" : undefined,
                          fontWeight: r.bold ? 600 : undefined,
                          fontSize: r.bold ? 14 : 12,
                          color: r.highlight ?? "var(--text-primary)",
                        }}
                      >
                        {r.value}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {payment.notes && (
            <div style={{ ...CARD, padding: "10px 16px" }}>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>หมายเหตุ</div>
              <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>{payment.notes}</div>
            </div>
          )}

          {/* Actions */}
          {payment.status === "DRAFT" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                onClick={handlePost}
                disabled={acting}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: acting ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: acting ? 0.6 : 1,
                }}
              >
                {acting ? <Loader2 size={12} className="animate-spin" style={{ display: "inline" }} /> : null} Post
              </button>
            </div>
          )}

          {payment.status === "POSTED" && !showVoidForm && (
            <button
              onClick={() => setShowVoidForm(true)}
              style={{
                width: "100%",
                padding: "7px 0",
                fontSize: 11,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--error)",
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: 8,
              }}
            >
              Void Payment
            </button>
          )}

          {showVoidForm && (
            <div style={{ ...CARD, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--error)", marginBottom: 8 }}>
                Void Reason *
              </div>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={2}
                placeholder="เหตุผลที่ยกเลิก..."
                style={{
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface)",
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                  resize: "vertical",
                  outline: "none",
                  marginBottom: 8,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => { setShowVoidForm(false); setVoidReason(""); }}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    fontSize: 11,
                    borderRadius: 3,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleVoid}
                  disabled={acting || !voidReason.trim()}
                  style={{
                    flex: 1,
                    padding: "6px 0",
                    fontSize: 11,
                    borderRadius: 3,
                    border: "none",
                    background: "var(--error)",
                    color: "#fff",
                    cursor: acting || !voidReason.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: acting || !voidReason.trim() ? 0.6 : 1,
                  }}
                >
                  Confirm Void
                </button>
              </div>
            </div>
          )}

          {actionError && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--error)",
                marginTop: 8,
              }}
            >
              {actionError}
            </div>
          )}

          <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 12, textAlign: "right" }}>
            Created {fmtDate(payment.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

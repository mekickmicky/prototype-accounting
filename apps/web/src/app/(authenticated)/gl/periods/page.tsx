"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Lock, Loader2, X } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useUser } from "@/lib/use-user";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, type DocumentStatus } from "@/components/ui/status-badge";
import { CloseChecklistModal } from "@/components/gl/close-checklist-modal";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Period {
  code: string;
  start_date: string;
  end_date: string;
  status: "OPEN" | "CLOSED" | "LOCKED";
  closed_at: string | null;
  closed_by_id: string | null;
  je_count: number;
  draft_je_count: number;
  posted_je_count: number;
}

// ─── Date / period helpers ───────────────────────────────────────────────────

const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function formatPeriodRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  const sDay = s.getUTCDate();
  const eDay = e.getUTCDate();
  const sMon = THAI_MONTHS_SHORT[s.getUTCMonth()];
  const eMon = THAI_MONTHS_SHORT[e.getUTCMonth()];
  const eYear = e.getUTCFullYear() + 543; // Buddhist Era

  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${sDay}–${eDay} ${eMon} ${eYear}`;
  }
  return `${sDay} ${sMon} – ${eDay} ${eMon} ${eYear}`;
}

function daysUntilEnd(endIso: string): number {
  const end = new Date(endIso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);
  return Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDaysLabel(days: number, status: string): React.ReactNode {
  if (status !== "OPEN") return <span style={{ color: "var(--text-dim)" }}>—</span>;
  if (days < 0) {
    return (
      <span style={{ color: "var(--error)", fontSize: 11 }}>
        เกินกำหนด {Math.abs(days)} วัน
      </span>
    );
  }
  if (days === 0) {
    return <span style={{ color: "var(--warning)", fontWeight: 500 }}>วันนี้</span>;
  }
  return (
    <span style={{ color: days <= 7 ? "var(--warning)" : "var(--text-muted)" }}>
      {days} วัน
    </span>
  );
}

// ─── Reopen modal (inline — no separate file needed) ────────────────────────

interface ReopenModalProps {
  periodCode: string;
  onClose: () => void;
  onReopened: () => void;
}

function ReopenModal({ periodCode, onClose, onReopened }: ReopenModalProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError("กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/periods/${periodCode}/reopen`, {
        reason: reason.trim(),
      });
      onClose();
      onReopened();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "เปิดงวดไม่สำเร็จ กรุณาลองใหม่"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--modal-bg, rgba(0,0,0,0.5))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 440,
          maxWidth: "95vw",
          borderRadius: 6,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              เปิดงวดบัญชีอีกครั้ง
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Period {periodCode}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              padding: 4,
              borderRadius: 4,
              lineHeight: 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(200,163,82,0.08)",
                border: "1px solid rgba(200,163,82,0.3)",
                borderRadius: 4,
                fontSize: 12,
                color: "var(--warning)",
                lineHeight: 1.5,
              }}
            >
              การเปิดงวดที่ปิดแล้วจะให้สิทธิ์ในการบันทึกรายการย้อนหลัง
              ดำเนินการนี้ต้องได้รับการอนุมัติจาก Admin เท่านั้น
            </div>

            <div>
              <label
                htmlFor="reopen-reason"
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
                เหตุผลในการเปิดงวดอีกครั้ง *
              </label>
              <textarea
                id="reopen-reason"
                required
                minLength={10}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ระบุเหตุผลอย่างน้อย 10 ตัวอักษร"
                style={{
                  width: "100%",
                  padding: "7px 10px",
                  fontSize: 13,
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
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-dim)" }}>
                {reason.trim().length}/10 ตัวอักษรขั้นต่ำ
              </p>
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
                }}
              >
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || reason.trim().length < 10}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background:
                  !submitting && reason.trim().length >= 10
                    ? "var(--accent)"
                    : "var(--surface)",
                color:
                  !submitting && reason.trim().length >= 10
                    ? "#fff"
                    : "var(--text-dim)",
                cursor:
                  !submitting && reason.trim().length >= 10
                    ? "pointer"
                    : "not-allowed",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              {submitting ? "กำลังเปิดงวด..." : "ยืนยันเปิดงวด"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

const TH = {
  label: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    color: "var(--text-dim)",
    padding: "0 12px 8px",
    whiteSpace: "nowrap" as const,
    textAlign: "left" as const,
  },
  td: {
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
    borderTop: "1px solid var(--border)",
    verticalAlign: "middle" as const,
    whiteSpace: "nowrap" as const,
  },
};

export default function PeriodsPage() {
  const { user, loading: userLoading } = useUser();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Close modal state
  const [closeModalCode, setCloseModalCode] = useState<string | null>(null);

  // Reopen modal state
  const [reopenModalCode, setReopenModalCode] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const fetchPeriods = useCallback(async () => {
    try {
      const data = await apiClient.get<Period[]>("/api/v1/periods");
      setPeriods(data);
    } catch (err) {
      setFetchError(
        err instanceof ApiError ? err.message : "Failed to load periods"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPeriods();
  }, [fetchPeriods]);

  const handleClosed = useCallback(async () => {
    setLoading(true);
    await fetchPeriods();
  }, [fetchPeriods]);

  const handleReopened = useCallback(async () => {
    setLoading(true);
    await fetchPeriods();
  }, [fetchPeriods]);

  if (userLoading || loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          gap: 8,
        }}
      >
        <Loader2
          size={16}
          className="animate-spin"
          style={{ color: "var(--text-dim)" }}
        />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          กำลังโหลด...
        </span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "rgba(184,92,80,0.1)",
          border: "1px solid var(--error)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--error)",
        }}
      >
        {fetchError}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="งวดบัญชี"
        description={`Fiscal Periods · ${periods.length} periods`}
        breadcrumbs={[{ label: "GL" }, { label: "Periods" }]}
      />

      <div style={{ marginTop: 20 }}>
        {periods.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-dim)",
              fontSize: 13,
            }}
          >
            ไม่พบงวดบัญชี
          </div>
        ) : (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr style={{ background: "var(--surface)" }}>
                  <th style={TH.label}>รหัสงวด</th>
                  <th style={TH.label}>ช่วงเวลา</th>
                  <th style={TH.label}>สถานะ</th>
                  <th style={{ ...TH.label, textAlign: "right" }}>วันที่เหลือ</th>
                  <th style={{ ...TH.label, textAlign: "right" }}>รายการ Posted</th>
                  <th style={{ ...TH.label, textAlign: "right" }}>รายการ Draft</th>
                  <th style={{ ...TH.label, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const days = daysUntilEnd(period.end_date);
                  const isCurrentPeriod =
                    period.status === "OPEN" && days >= 0 && days <= 31;

                  return (
                    <tr
                      key={period.code}
                      style={{
                        background: isCurrentPeriod
                          ? "rgba(180,140,120,0.04)"
                          : "transparent",
                      }}
                    >
                      {/* Period code */}
                      <td style={TH.td}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 12,
                            fontWeight: isCurrentPeriod ? 600 : 400,
                            color: isCurrentPeriod
                              ? "var(--accent)"
                              : "var(--text-primary)",
                          }}
                        >
                          {period.code}
                        </span>
                        {isCurrentPeriod && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9,
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                              color: "var(--accent)",
                              background: "rgba(180,140,120,0.15)",
                              padding: "1px 5px",
                              borderRadius: 2,
                            }}
                          >
                            ปัจจุบัน
                          </span>
                        )}
                      </td>

                      {/* Date range */}
                      <td style={{ ...TH.td, color: "var(--text-muted)" }}>
                        {formatPeriodRange(period.start_date, period.end_date)}
                      </td>

                      {/* Status */}
                      <td style={TH.td}>
                        <StatusBadge
                          status={period.status as DocumentStatus}
                        />
                      </td>

                      {/* Days remaining */}
                      <td style={{ ...TH.td, textAlign: "right", fontSize: 12 }}>
                        {formatDaysLabel(days, period.status)}
                      </td>

                      {/* Posted JEs */}
                      <td
                        style={{
                          ...TH.td,
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                        }}
                      >
                        {period.posted_je_count}
                      </td>

                      {/* Draft JEs */}
                      <td
                        style={{
                          ...TH.td,
                          textAlign: "right",
                          fontFamily: "var(--font-mono)",
                          fontSize: 12,
                          color:
                            period.draft_je_count > 0
                              ? "var(--warning)"
                              : "var(--text-dim)",
                        }}
                      >
                        {period.draft_je_count > 0 ? period.draft_je_count : "—"}
                      </td>

                      {/* Actions */}
                      <td style={{ ...TH.td, textAlign: "right" }}>
                        {period.status === "OPEN" && (
                          <button
                            onClick={() => setCloseModalCode(period.code)}
                            style={{
                              padding: "4px 12px",
                              fontSize: 11,
                              fontWeight: 500,
                              borderRadius: 3,
                              border: "1px solid var(--border-strong)",
                              background: "transparent",
                              color: "var(--text-primary)",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            ปิดงวด
                          </button>
                        )}
                        {period.status === "CLOSED" && isAdmin && (
                          <button
                            onClick={() => setReopenModalCode(period.code)}
                            style={{
                              padding: "4px 12px",
                              fontSize: 11,
                              fontWeight: 500,
                              borderRadius: 3,
                              border: "1px solid var(--border-strong)",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            เปิดอีกครั้ง
                          </button>
                        )}
                        {period.status === "LOCKED" && (
                          <Lock
                            size={13}
                            style={{ color: "var(--text-dim)" }}
                          />
                        )}
                        {period.status === "CLOSED" && !isAdmin && (
                          <span
                            style={{ fontSize: 11, color: "var(--text-dim)" }}
                          >
                            —
                          </span>
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

      {/* Close checklist modal */}
      {closeModalCode && (
        <CloseChecklistModal
          periodCode={closeModalCode}
          isOpen={true}
          onClose={() => setCloseModalCode(null)}
          onClosed={handleClosed}
        />
      )}

      {/* Reopen modal */}
      {reopenModalCode && (
        <ReopenModal
          periodCode={reopenModalCode}
          onClose={() => setReopenModalCode(null)}
          onReopened={handleReopened}
        />
      )}
    </div>
  );
}

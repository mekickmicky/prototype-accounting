"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, X, Loader2, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError } from "@/lib/api-client";

type ChecklistStatus = "pass" | "fail" | "manual";

export interface ChecklistItem {
  id: string;
  label_th: string;
  status: ChecklistStatus;
  count?: number;
  link?: string;
  confirmed_by_user?: boolean;
}

interface CloseChecklistModalProps {
  periodCode: string;
  isOpen: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export function CloseChecklistModal({
  periodCode,
  isOpen,
  onClose,
  onClosed,
}: CloseChecklistModalProps) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [agingConfirmed, setAgingConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchChecklist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await apiClient.get<ChecklistItem[]>(
        `/api/v1/periods/${periodCode}/close-checklist`
      );
      setChecklist(items);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load checklist"
      );
    } finally {
      setLoading(false);
    }
  }, [periodCode]);

  useEffect(() => {
    if (!isOpen) return;
    setAgingConfirmed(false);
    setError(null);
    setChecklist([]);
    fetchChecklist();
  }, [isOpen, fetchChecklist]);

  if (!isOpen) return null;

  const canClose =
    checklist.length > 0 &&
    checklist.every((item) => {
      if (item.status === "pass") return true;
      if (item.id === "aging_reviewed" && agingConfirmed) return true;
      return false;
    });

  const handleConfirmClose = async () => {
    setClosing(true);
    setError(null);
    try {
      await apiClient.post(`/api/v1/periods/${periodCode}/close`, {
        confirm: true,
      });
      onClose();
      onClosed();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "ปิดงวดไม่สำเร็จ กรุณาลองใหม่"
      );
      fetchChecklist();
    } finally {
      setClosing(false);
    }
  };

  const handleFixLink = (link: string) => {
    onClose();
    router.push(link);
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
          width: 540,
          maxWidth: "95vw",
          maxHeight: "90vh",
          overflowY: "auto",
          borderRadius: 6,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Modal header */}
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
              ปิดงวดบัญชี
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

        {/* Modal body */}
        <div style={{ padding: "16px 20px" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "32px 0",
              }}
            >
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: "var(--text-dim)" }}
              />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                กำลังตรวจสอบ...
              </span>
            </div>
          ) : (
            <>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 12,
                  color: "var(--text-muted)",
                  lineHeight: 1.5,
                }}
              >
                ตรวจสอบรายการด้านล่างก่อนปิดงวด
                รายการที่ไม่ผ่านต้องแก้ไขก่อนดำเนินการต่อ
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {checklist.map((item) => {
                  const isPass = item.status === "pass";
                  const isManual = item.status === "manual";
                  const isFail = item.status === "fail";
                  const manualOk =
                    isManual && item.id === "aging_reviewed" && agingConfirmed;
                  const rowOk = isPass || manualOk;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 4,
                        border: `1px solid ${
                          rowOk
                            ? "rgba(107,142,127,0.3)"
                            : isFail
                            ? "rgba(184,92,80,0.3)"
                            : "var(--border)"
                        }`,
                        background: rowOk
                          ? "rgba(107,142,127,0.06)"
                          : isFail
                          ? "rgba(184,92,80,0.05)"
                          : "var(--surface)",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                    >
                      {/* Status indicator */}
                      <div style={{ flexShrink: 0 }}>
                        {isManual ? (
                          <input
                            type="checkbox"
                            id={`cl-${item.id}`}
                            checked={
                              item.id === "aging_reviewed"
                                ? agingConfirmed
                                : false
                            }
                            onChange={(e) => {
                              if (item.id === "aging_reviewed") {
                                setAgingConfirmed(e.target.checked);
                              }
                            }}
                            style={{
                              width: 15,
                              height: 15,
                              accentColor: "var(--accent)",
                              cursor: "pointer",
                            }}
                          />
                        ) : isPass ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "rgba(107,142,127,0.2)",
                              flexShrink: 0,
                            }}
                          >
                            <Check
                              size={10}
                              strokeWidth={3}
                              style={{ color: "var(--status-posted)" }}
                            />
                          </span>
                        ) : (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "rgba(184,92,80,0.15)",
                              flexShrink: 0,
                            }}
                          >
                            <X
                              size={10}
                              strokeWidth={3}
                              style={{ color: "var(--error)" }}
                            />
                          </span>
                        )}
                      </div>

                      {/* Label + sub-count */}
                      <label
                        htmlFor={isManual ? `cl-${item.id}` : undefined}
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: rowOk
                            ? "var(--text-muted)"
                            : "var(--text-primary)",
                          cursor: isManual ? "pointer" : "default",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {item.label_th}
                        {isFail && item.count !== undefined && item.count > 0 && (
                          <span
                            style={{ fontSize: 11, color: "var(--error)" }}
                          >
                            {item.count} รายการที่ต้องแก้ไข
                          </span>
                        )}
                      </label>

                      {/* Fix button */}
                      {isFail && item.link && (
                        <button
                          onClick={() => handleFixLink(item.link!)}
                          style={{
                            flexShrink: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 500,
                            color: "var(--accent)",
                            background: "none",
                            border: "1px solid var(--accent)",
                            borderRadius: 3,
                            padding: "3px 8px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          ดูรายการ
                          <ArrowRight size={10} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div
                  style={{
                    marginTop: 12,
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
            </>
          )}
        </div>

        {/* Modal footer */}
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
            onClick={onClose}
            disabled={closing}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: closing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: closing ? 0.6 : 1,
            }}
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirmClose}
            disabled={!canClose || closing || loading}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "none",
              background:
                canClose && !closing && !loading
                  ? "var(--accent)"
                  : "var(--surface)",
              color:
                canClose && !closing && !loading ? "#fff" : "var(--text-dim)",
              cursor:
                canClose && !closing && !loading ? "pointer" : "not-allowed",
              fontFamily: "inherit",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {closing && (
              <Loader2 size={12} className="animate-spin" />
            )}
            {closing ? "กำลังปิดงวด..." : "ยืนยันปิดงวด"}
          </button>
        </div>
      </div>
    </div>
  );
}

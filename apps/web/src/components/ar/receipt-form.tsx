"use client";

import { useState } from "react";
import { Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

const API_BASE = "";

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

interface SlipVerifyDetails {
  transRef: string;
  transDate: string;
  sender: { name: string; bankShortName: string; accountTail: string };
  receiver: { name: string; bankShortName: string; accountTail: string };
  amount: string;
}

interface SlipVerifyApiResult {
  verified: boolean;
  reason?: string;
  details?: SlipVerifyDetails;
}

export type SlipVerifyStatus = "idle" | "ok" | "mismatch" | "failed";

interface SlipVerifyWidgetProps {
  slipRef: string;
  onSlipRefChange: (val: string) => void;
  expectedAmount: string;
  receiptDate: string;
  onStatusChange: (status: SlipVerifyStatus) => void;
}

export function SlipVerifyWidget({
  slipRef,
  onSlipRefChange,
  expectedAmount,
  receiptDate,
  onStatusChange,
}: SlipVerifyWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SlipVerifyStatus>("idle");
  const [result, setResult] = useState<SlipVerifyApiResult | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  function handleSlipRefChange(val: string) {
    onSlipRefChange(val);
    if (status !== "idle") {
      setStatus("idle");
      setResult(null);
      setOverrideNote("");
      onStatusChange("idle");
    }
  }

  async function handleVerify() {
    if (!slipRef.trim()) return;
    setLoading(true);
    setResult(null);
    setOverrideNote("");

    try {
      const res = await fetch(`${API_BASE}/api/v1/bank/verify-slip`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slip_ref: slipRef.trim(),
          expected_amount: expectedAmount || undefined,
          expected_date: receiptDate || undefined,
        }),
      });
      const body = await res.json();

      if (!body.success) {
        const newStatus: SlipVerifyStatus = "failed";
        setResult({ verified: false, reason: body.error?.message ?? "Verification failed" });
        setStatus(newStatus);
        onStatusChange(newStatus);
        return;
      }

      const data: SlipVerifyApiResult = body.data;
      setResult(data);

      if (!data.verified) {
        setStatus("failed");
        onStatusChange("failed");
        return;
      }

      if (data.details && expectedAmount) {
        const verifiedAmt = parseFloat(data.details.amount);
        const expected = parseFloat(expectedAmount);
        if (Math.abs(verifiedAmt - expected) > 0.01) {
          setStatus("mismatch");
          onStatusChange("mismatch");
          return;
        }
      }

      setStatus("ok");
      onStatusChange("ok");
    } catch {
      setResult({ verified: false, reason: "Network error" });
      setStatus("failed");
      onStatusChange("failed");
    } finally {
      setLoading(false);
    }
  }

  function handleOverrideNoteChange(val: string) {
    setOverrideNote(val);
    onStatusChange(val.trim() ? "ok" : "mismatch");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <label style={LABEL}>Slip Ref *</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            value={slipRef}
            onChange={(e) => handleSlipRefChange(e.target.value)}
            style={{ ...INPUT, flex: 1 }}
            placeholder="เลขที่อ้างอิงการโอน"
          />
          <button
            type="button"
            onClick={handleVerify}
            disabled={loading || !slipRef.trim()}
            style={{
              padding: "0 12px",
              height: 32,
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text-primary)",
              cursor: loading || !slipRef.trim() ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: !slipRef.trim() ? 0.5 : 1,
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : null}
            ตรวจสอบ Slip
          </button>
        </div>
      </div>

      {status === "ok" && result?.details && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(108,178,120,0.1)",
            border: "1px solid #6CB278",
            borderRadius: 4,
            fontSize: 11,
            color: "#6CB278",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <CheckCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>Slip verified</div>
            <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
              {result.details.sender.name} → {result.details.receiver.name}
              {" · "}฿
              {parseFloat(result.details.amount).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>
      )}

      {status === "mismatch" && result?.details && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(200,160,60,0.1)",
            border: "1px solid #C8A03C",
            borderRadius: 4,
            fontSize: 11,
            color: "#C8A03C",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>ยอดเงินไม่ตรง (Amount mismatch)</div>
              <div style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
                Slip: ฿
                {parseFloat(result.details.amount).toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                })}
                {" · "}Expected: ฿
                {parseFloat(expectedAmount || "0").toLocaleString("th-TH", {
                  minimumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>
          <div>
            <label
              style={{
                ...LABEL,
                color: "#C8A03C",
              }}
            >
              Override reason *
            </label>
            <input
              type="text"
              value={overrideNote}
              onChange={(e) => handleOverrideNoteChange(e.target.value)}
              style={{ ...INPUT, borderColor: "#C8A03C" }}
              placeholder="ระบุเหตุผลที่ยอดต่างกัน..."
            />
          </div>
        </div>
      )}

      {status === "failed" && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 4,
            fontSize: 11,
            color: "var(--error)",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <XCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>ตรวจสอบไม่ผ่าน (Verification failed)</div>
            <div style={{ color: "var(--text-muted)" }}>
              {result?.reason ?? "Slip reference not found"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

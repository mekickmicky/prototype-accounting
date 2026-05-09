"use client";

import React, { useState } from "react";
import { Loader2, AlertCircle, CheckCircle2, Send, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";

// ── Shared styles ─────────────────────────────────────────────────────────

const SECTION: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "18px 20px",
  marginBottom: 20,
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 6,
};

const SELECT: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  cursor: "pointer",
  width: "100%",
  maxWidth: 360,
};

const TEXTAREA: React.CSSProperties = {
  width: "100%",
  minHeight: 280,
  padding: "10px 12px",
  fontSize: 12,
  fontFamily: "var(--font-mono, monospace)",
  lineHeight: 1.55,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  outline: "none",
  resize: "vertical",
  boxSizing: "border-box",
};

const BTN_PRIMARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 16px",
  borderRadius: 4,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  fontFamily: "inherit",
};

const BTN_GHOST: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 34,
  padding: "0 14px",
  borderRadius: 4,
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
  border: "1px solid var(--border-strong)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-mono, monospace)",
};

// ── Sample payload generators ─────────────────────────────────────────────

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function rndPatient() {
  const id = `P${Math.floor(Math.random() * 9000) + 1000}`;
  return { id, name: `Test Patient ${id}`, name_th: `ผู้ทดสอบ ${id}` };
}

function nowIso() {
  return new Date().toISOString();
}

const SAMPLES_VISIT: Record<string, () => object> = {
  "Cash visit (2 items)": () => {
    const p = rndPatient();
    return {
      event: "visit.completed",
      visit_id: `VIS-${uid()}`,
      patient_id: p.id,
      patient_name: p.name,
      patient_name_th: p.name_th,
      patient_phone: "0812345678",
      branch_code: "TL",
      visit_date: nowIso(),
      completed_at: nowIso(),
      request_full_tax_invoice: false,
      items: [
        { type: "service", code: "BOTOX_50U", name: "Botox 50 Units", name_th: "โบท็อกซ์ 50 ยูนิต", qty: 1, unit_price: "5000.00" },
        { type: "service", code: "FACIAL_HYDRA", name: "Hydra Facial", name_th: "ไฮดราฟาเชียล", qty: 1, unit_price: "2500.00" },
      ],
      payment: { method: "CASH", amount: "7500.00" },
    };
  },
  "Card visit (CREDIT_CARD + 2% fee)": () => {
    const p = rndPatient();
    return {
      event: "visit.completed",
      visit_id: `VIS-${uid()}`,
      patient_id: p.id,
      patient_name: p.name,
      patient_name_th: p.name_th,
      patient_phone: "0823456789",
      branch_code: "EK",
      visit_date: nowIso(),
      completed_at: nowIso(),
      request_full_tax_invoice: false,
      items: [
        { type: "service", code: "FILLER_HA", name: "HA Filler 1cc", name_th: "ฟิลเลอร์ HA 1 ซีซี", qty: 1, unit_price: "8000.00" },
      ],
      payment: { method: "CREDIT_CARD", amount: "8160.00", bank_account_code: "KBANK-001", card_fee: "160.00" },
    };
  },
  "Transfer + slip": () => {
    const p = rndPatient();
    return {
      event: "visit.completed",
      visit_id: `VIS-${uid()}`,
      patient_id: p.id,
      patient_name: p.name,
      patient_name_th: p.name_th,
      patient_phone: "0834567890",
      branch_code: "TL",
      visit_date: nowIso(),
      completed_at: nowIso(),
      request_full_tax_invoice: false,
      items: [
        { type: "service", code: "LASER_IPL", name: "IPL Photofacial", name_th: "เลเซอร์ IPL โฟโตเฟเชียล", qty: 1, unit_price: "3500.00" },
      ],
      payment: { method: "TRANSFER", amount: "3500.00", bank_account_code: "KBANK-001", slip_ref: `SLP-${uid()}` },
    };
  },
  "Multi-doctor (commissions)": () => {
    const p = rndPatient();
    return {
      event: "visit.completed",
      visit_id: `VIS-${uid()}`,
      patient_id: p.id,
      patient_name: p.name,
      patient_name_th: p.name_th,
      patient_phone: "0845678901",
      branch_code: "TL",
      visit_date: nowIso(),
      completed_at: nowIso(),
      request_full_tax_invoice: false,
      items: [
        { type: "service", code: "BOTOX_100U", name: "Botox 100 Units", name_th: "โบท็อกซ์ 100 ยูนิต", qty: 1, unit_price: "9000.00", doctor_id: "DR001", doctor_commission_pct: 30 },
        { type: "service", code: "FILLER_HA", name: "HA Filler 1cc", name_th: "ฟิลเลอร์ HA 1 ซีซี", qty: 1, unit_price: "8000.00", doctor_id: "DR002", doctor_commission_pct: 25 },
      ],
      payment: { method: "CASH", amount: "17000.00" },
    };
  },
  "Full tax invoice (with tax ID)": () => {
    const p = rndPatient();
    return {
      event: "visit.completed",
      visit_id: `VIS-${uid()}`,
      patient_id: p.id,
      patient_name: `บริษัท ทดสอบ ${p.id} จำกัด`,
      patient_name_th: `บริษัท ทดสอบ ${p.id} จำกัด`,
      patient_tax_id: "1234567890123",
      patient_address: "123 Sukhumvit Rd, Watthana, Bangkok 10110",
      patient_phone: "0234567890",
      branch_code: "RAMA9",
      visit_date: nowIso(),
      completed_at: nowIso(),
      request_full_tax_invoice: true,
      items: [
        { type: "service", code: "THREAD_LIFT", name: "Thread Lift", name_th: "ร้อยไหมกระชับผิว", qty: 1, unit_price: "15000.00" },
      ],
      payment: { method: "CASH", amount: "15000.00" },
    };
  },
};

function makeStockSample(): object {
  const period = new Date().toISOString().slice(0, 7);
  const now = nowIso();
  return {
    event: "stock.period_export",
    export_id: `EXP-${period}-${uid()}`,
    period_code: period,
    branch_code: "TL",
    exported_at: now,
    source_summary: { receipts: 2, issues: 1, transfers: 0, adjustments: 0, counts: 0 },
    entries: [
      {
        type: "RECEIPT",
        date: now,
        description: "GR from supplier — skincare products",
        source_doc_no: `GR-${period}-0001`,
        source_doc_id: uid(),
        lines: [
          { account_code: "16010", debit: "5200.00", credit: "0.00", description: "Inventory — Skincare" },
          { account_code: "21010", debit: "0.00", credit: "5200.00", description: "AP — Supplier" },
        ],
      },
      {
        type: "RECEIPT",
        date: now,
        description: "GR from supplier — injectables",
        source_doc_no: `GR-${period}-0002`,
        source_doc_id: uid(),
        lines: [
          { account_code: "16010", debit: "12000.00", credit: "0.00", description: "Inventory — Injectables" },
          { account_code: "21010", debit: "0.00", credit: "12000.00", description: "AP — Supplier" },
        ],
      },
      {
        type: "ISSUE",
        date: now,
        description: "Consumption for service delivery",
        source_doc_no: `IS-${period}-0001`,
        source_doc_id: uid(),
        lines: [
          { account_code: "51010", debit: "3800.00", credit: "0.00", description: "COGS" },
          { account_code: "16010", debit: "0.00", credit: "3800.00", description: "Inventory" },
        ],
      },
    ],
  };
}

// ── Result display ────────────────────────────────────────────────────────

interface SendResult {
  status: number;
  ok: boolean;
  body: unknown;
}

function VisitResultLinks({ body }: { body: unknown }) {
  const router = useRouter();
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data) return null;

  const links: Array<{ label: string; href: string }> = [];
  if (data.invoice_no) links.push({ label: `Invoice: ${data.invoice_no}`, href: `/ar/invoices?q=${data.invoice_no}` });
  if (data.tax_invoice_no) links.push({ label: `Tax Invoice: ${data.tax_invoice_no}`, href: `/ar/invoices?q=${data.tax_invoice_no}` });
  if (data.receipt_no) links.push({ label: `Receipt: ${data.receipt_no}`, href: `/ar/receipts?q=${data.receipt_no}` });
  if (data.je_no) links.push({ label: `JE: ${data.je_no}`, href: `/gl/journal-entries?q=${data.je_no}` });

  if (!links.length) return null;

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {links.map((l) => (
        <button
          key={l.href}
          type="button"
          onClick={() => router.push(l.href)}
          style={{
            ...MONO,
            fontSize: 12,
            color: "var(--accent)",
            background: "rgba(var(--accent-rgb, 184,134,100), 0.1)",
            border: "1px solid rgba(var(--accent-rgb, 184,134,100), 0.3)",
            borderRadius: 4,
            padding: "3px 9px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {l.label} →
        </button>
      ))}
    </div>
  );
}

function StockResultLinks({ body }: { body: unknown }) {
  const router = useRouter();
  const data = (body as { data?: Record<string, unknown> })?.data;
  if (!data?.first_je) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => router.push(`/gl/journal-entries?q=${data.first_je}`)}
        style={{
          ...MONO,
          fontSize: 12,
          color: "var(--accent)",
          background: "rgba(var(--accent-rgb, 184,134,100), 0.1)",
          border: "1px solid rgba(var(--accent-rgb, 184,134,100), 0.3)",
          borderRadius: 4,
          padding: "3px 9px",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        JE {String(data.first_je)}..{String(data.last_je)} ({data.created_count as number} entries) →
      </button>
    </div>
  );
}

function ResultPanel({ result, type }: { result: SendResult | null; type: "visit" | "stock" }) {
  if (!result) return null;
  const isOk = result.ok;
  return (
    <div
      style={{
        marginTop: 14,
        border: `1px solid ${isOk ? "rgba(108,178,120,0.35)" : "rgba(239,68,68,0.35)"}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: isOk ? "rgba(108,178,120,0.08)" : "rgba(239,68,68,0.08)",
          borderBottom: `1px solid ${isOk ? "rgba(108,178,120,0.2)" : "rgba(239,68,68,0.2)"}`,
        }}
      >
        {isOk ? (
          <CheckCircle2 size={14} style={{ color: "#6CB278", flexShrink: 0 }} />
        ) : (
          <AlertCircle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: isOk ? "#6CB278" : "#ef4444",
            ...MONO,
          }}
        >
          HTTP {result.status}
        </span>
        {isOk && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>— Success</span>}
      </div>

      <div style={{ padding: "10px 14px" }}>
        {isOk && type === "visit" && <VisitResultLinks body={result.body} />}
        {isOk && type === "stock" && <StockResultLinks body={result.body} />}
        <details style={{ marginTop: isOk ? 10 : 0 }}>
          <summary
            style={{
              fontSize: 11,
              color: "var(--text-dim)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            Raw response
          </summary>
          <pre
            style={{
              marginTop: 8,
              fontSize: 11,
              ...MONO,
              color: "var(--text-muted)",
              background: "var(--bg-base)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "10px 12px",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {JSON.stringify(result.body, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

// ── Visit-Completed section ───────────────────────────────────────────────

function VisitSection() {
  const sampleKeys = Object.keys(SAMPLES_VISIT);
  const [selectedSample, setSelectedSample] = useState(sampleKeys[0]);
  const [json, setJson] = useState(() => JSON.stringify(SAMPLES_VISIT[sampleKeys[0]](), null, 2));
  const [sending, setSending] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  function loadSample(key: string) {
    setSelectedSample(key);
    setJson(JSON.stringify(SAMPLES_VISIT[key](), null, 2));
    setParseError(null);
    setResult(null);
  }

  async function send() {
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setParseError("Invalid JSON — please fix before sending");
      return;
    }
    setParseError(null);
    setSending(true);
    setResult(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${apiBase}/api/v1/settings/integrations/test-webhook`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "visit-completed", payload }),
      });
      let body: unknown;
      try { body = await res.json(); } catch { body = null; }
      const outerBody = body as { success?: boolean; data?: { status: number; ok: boolean; body: unknown }; error?: { message: string } };
      if (outerBody?.success && outerBody?.data) {
        setResult(outerBody.data);
      } else {
        setResult({ status: res.status, ok: false, body });
      }
    } catch (err) {
      setResult({ status: 0, ok: false, body: { error: err instanceof Error ? err.message : String(err) } });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={SECTION}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
        Visit Completed (wind-clinic)
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LABEL}>Sample Payload</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            style={SELECT}
            value={selectedSample}
            onChange={(e) => loadSample(e.target.value)}
          >
            {sampleKeys.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <button
            type="button"
            style={BTN_GHOST}
            onClick={() => loadSample(selectedSample)}
          >
            Regenerate
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={LABEL}>Payload JSON</label>
        <textarea
          style={{
            ...TEXTAREA,
            borderColor: parseError ? "rgba(239,68,68,0.5)" : "var(--border-strong)",
          }}
          value={json}
          onChange={(e) => { setJson(e.target.value); setParseError(null); }}
          spellCheck={false}
        />
        {parseError && (
          <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={12} /> {parseError}
          </div>
        )}
      </div>

      <button
        type="button"
        style={{ ...BTN_PRIMARY, opacity: sending ? 0.7 : 1, cursor: sending ? "not-allowed" : "pointer" }}
        onClick={send}
        disabled={sending}
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {sending ? "Sending…" : "Send Webhook"}
      </button>

      <ResultPanel result={result} type="visit" />
    </div>
  );
}

// ── Stock Export section ───────────────────────────────────────────────────

function StockSection() {
  const [json, setJson] = useState(() => JSON.stringify(makeStockSample(), null, 2));
  const [sending, setSending] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  async function send() {
    let payload: unknown;
    try {
      payload = JSON.parse(json);
    } catch {
      setParseError("Invalid JSON — please fix before sending");
      return;
    }
    setParseError(null);
    setSending(true);
    setResult(null);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
      const res = await fetch(`${apiBase}/api/v1/settings/integrations/test-webhook`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "stock-export", payload }),
      });
      let body: unknown;
      try { body = await res.json(); } catch { body = null; }
      const outerBody = body as { success?: boolean; data?: { status: number; ok: boolean; body: unknown }; error?: { message: string } };
      if (outerBody?.success && outerBody?.data) {
        setResult(outerBody.data);
      } else {
        setResult({ status: res.status, ok: false, body });
      }
    } catch (err) {
      setResult({ status: 0, ok: false, body: { error: err instanceof Error ? err.message : String(err) } });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={SECTION}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
        Stock Period Export (wind-stock)
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ ...LABEL, marginBottom: 0 }}>Payload JSON</label>
          <button
            type="button"
            style={BTN_GHOST}
            onClick={() => { setJson(JSON.stringify(makeStockSample(), null, 2)); setParseError(null); setResult(null); }}
          >
            <FlaskConical size={12} />
            Load sample
          </button>
        </div>
        <textarea
          style={{
            ...TEXTAREA,
            borderColor: parseError ? "rgba(239,68,68,0.5)" : "var(--border-strong)",
          }}
          value={json}
          onChange={(e) => { setJson(e.target.value); setParseError(null); }}
          spellCheck={false}
        />
        {parseError && (
          <div style={{ fontSize: 12, color: "#ef4444", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertCircle size={12} /> {parseError}
          </div>
        )}
      </div>

      <button
        type="button"
        style={{ ...BTN_PRIMARY, opacity: sending ? 0.7 : 1, cursor: sending ? "not-allowed" : "pointer" }}
        onClick={send}
        disabled={sending}
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {sending ? "Sending…" : "Send Webhook"}
      </button>

      <ResultPanel result={result} type="stock" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function TestWebhookPage() {
  return (
    <div style={{ maxWidth: 800 }}>
      <PageHeader
        title="Test Webhooks"
        description="ส่ง webhook ทดสอบพร้อม HMAC signature — ระบบจะสร้างเอกสารจริงในฐานข้อมูล"
        breadcrumbs={[
          { label: "Settings" },
          { label: "Integrations" },
          { label: "Test Webhooks" },
        ]}
      />
      <VisitSection />
      <StockSection />
    </div>
  );
}

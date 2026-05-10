"use client";

import * as React from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import {
  D,
  formatTHB,
  invoiceTotals,
  lineNet as calcLineNet,
  lineVat as calcLineVat,
} from "@wind-acc/shared";
import { CustomerPicker, type CustomerOption } from "@/components/ui/customer-picker";
import { ServicePicker, type CatalogService } from "@/components/ui/service-picker";
import { PageHeader } from "@/components/ui/page-header";

const BRANCHES = ["TL", "EK", "RAMA9"] as const;
type VatRate = "7" | "0" | "EXEMPT";

interface FormLine {
  _key: string;
  description: string;
  service_code?: string;
  qty: string;
  unit_price: string;
  discount: string;
  vat_rate: VatRate;
  revenue_account_code: string;
  wht_rate: string;
}

function newLine(): FormLine {
  return {
    _key: crypto.randomUUID(),
    description: "",
    qty: "1",
    unit_price: "0.00",
    discount: "0.00",
    vat_rate: "7",
    revenue_account_code: "41010",
    wht_rate: "0",
  };
}

export interface InvoiceSubmitValues {
  customer_id: string;
  branch_code: string;
  issue_date: string;
  due_date: string;
  is_tax_invoice: boolean;
  vat_inclusive: boolean;
  notes: string;
  source_ref: string;
  lines: Array<{
    description: string;
    service_code?: string;
    qty: string;
    unit_price: string;
    discount: string;
    vat_rate: string;
    revenue_account_code: string;
  }>;
}

export interface InvoiceFormProps {
  defaultValues?: {
    customer_id?: string | null;
    branch_code?: string;
    issue_date?: string;
    due_date?: string;
    is_tax_invoice?: boolean;
    vat_inclusive?: boolean;
    notes?: string;
    source_ref?: string;
    lines?: Partial<FormLine>[];
  };
  onSaveDraft: (values: InvoiceSubmitValues) => Promise<void>;
  onPost: (values: InvoiceSubmitValues) => Promise<void>;
  onCancel: () => void;
}

const INPUT: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-muted)",
  display: "block",
  marginBottom: 4,
};

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 16,
};

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: checked ? "var(--accent)" : "var(--text-primary)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
      />
      {label}
    </label>
  );
}

function TotalRow({
  label,
  value,
  bold,
  dimmed,
  testId,
}: {
  label: string;
  value: string;
  bold?: boolean;
  dimmed?: boolean;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        fontSize: bold ? 13 : 12,
        fontWeight: bold ? 600 : 400,
        color: dimmed ? "var(--text-muted)" : bold ? "var(--text-primary)" : "var(--text-muted)",
      }}
    >
      <span>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", color: dimmed ? "var(--text-dim)" : bold ? "var(--accent)" : "var(--text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

interface LineRowProps {
  index: number;
  line: FormLine;
  vatInclusive: boolean;
  onServiceSelect: (code: string | null, svc: CatalogService | null) => void;
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function LineRow({ index, line, vatInclusive, onServiceSelect, onChange, onRemove, canRemove }: LineRowProps) {
  const lineTotal = React.useMemo(() => {
    try {
      const net = calcLineNet({
        qty: line.qty || "0",
        unit_price: line.unit_price || "0",
        discount: line.discount || "0",
      });
      const { gross } = calcLineVat({ net, vat_rate: line.vat_rate, vat_inclusive: vatInclusive });
      return formatTHB(gross);
    } catch {
      return "—";
    }
  }, [line.qty, line.unit_price, line.discount, line.vat_rate, vatInclusive]);

  const cellStyle: React.CSSProperties = { padding: "4px 4px", verticalAlign: "middle" };
  const numInput: React.CSSProperties = { ...INPUT, textAlign: "right" };

  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {/* Service picker */}
      <td style={{ ...cellStyle, minWidth: 130 }}>
        <ServicePicker
          value={line.service_code}
          onChange={onServiceSelect}
        />
      </td>

      {/* Description */}
      <td style={{ ...cellStyle, minWidth: 140 }}>
        <input
          data-testid={`field-description-${index}`}
          type="text"
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="รายละเอียด"
          style={INPUT}
        />
      </td>

      {/* Qty */}
      <td style={{ ...cellStyle, width: 64 }}>
        <input
          data-testid={`field-qty-${index}`}
          type="number"
          value={line.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          min="0"
          step="0.01"
          style={{ ...numInput, width: 64 }}
        />
      </td>

      {/* Unit price */}
      <td style={{ ...cellStyle, width: 90 }}>
        <input
          data-testid={`field-unit-price-${index}`}
          type="number"
          value={line.unit_price}
          onChange={(e) => onChange({ unit_price: e.target.value })}
          min="0"
          step="0.01"
          style={{ ...numInput, width: 90 }}
        />
      </td>

      {/* Discount */}
      <td style={{ ...cellStyle, width: 80 }}>
        <input
          type="number"
          value={line.discount}
          onChange={(e) => onChange({ discount: e.target.value })}
          min="0"
          step="0.01"
          style={{ ...numInput, width: 80 }}
        />
      </td>

      {/* VAT rate */}
      <td style={{ ...cellStyle, width: 80 }}>
        <select
          data-testid={`field-vat-rate-${index}`}
          value={line.vat_rate}
          onChange={(e) => onChange({ vat_rate: e.target.value as VatRate })}
          style={{ ...INPUT, width: 80, cursor: "pointer", paddingLeft: 6 }}
        >
          <option value="7">7%</option>
          <option value="0">0%</option>
          <option value="EXEMPT">Exempt</option>
        </select>
      </td>

      {/* Revenue account code */}
      <td style={{ ...cellStyle, width: 80 }}>
        <input
          type="text"
          value={line.revenue_account_code}
          onChange={(e) => onChange({ revenue_account_code: e.target.value })}
          placeholder="4100"
          style={{ ...INPUT, width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }}
        />
      </td>

      {/* Line total */}
      <td style={{ ...cellStyle, width: 90, textAlign: "right" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
          {lineTotal}
        </span>
      </td>

      {/* Delete */}
      <td style={{ ...cellStyle, width: 28, textAlign: "center" }}>
        <button
          data-testid={`action-remove-line-${index}`}
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          style={{
            background: "none",
            border: "none",
            cursor: canRemove ? "pointer" : "default",
            color: canRemove ? "var(--error)" : "var(--text-dim)",
            padding: 2,
            display: "inline-flex",
            alignItems: "center",
          }}
          title="ลบรายการ"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  );
}

export function InvoiceForm({ defaultValues, onSaveDraft, onPost, onCancel }: InvoiceFormProps) {
  const today = new Date().toISOString().split("T")[0]!;
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]!;

  const [customerId, setCustomerId] = React.useState<string | null>(defaultValues?.customer_id ?? null);
  const [branchCode, setBranchCode] = React.useState(defaultValues?.branch_code ?? "TL");
  const [issueDate, setIssueDate] = React.useState(defaultValues?.issue_date ?? today);
  const [dueDate, setDueDate] = React.useState(defaultValues?.due_date ?? in30);
  const [isTaxInvoice, setIsTaxInvoice] = React.useState(defaultValues?.is_tax_invoice ?? false);
  const [vatInclusive, setVatInclusive] = React.useState(defaultValues?.vat_inclusive ?? false);
  const [notes, setNotes] = React.useState(defaultValues?.notes ?? "");
  const [sourceRef, setSourceRef] = React.useState(defaultValues?.source_ref ?? "");
  const [lines, setLines] = React.useState<FormLine[]>(
    defaultValues?.lines?.length
      ? defaultValues.lines.map((l) => ({ ...newLine(), ...l, _key: crypto.randomUUID() }))
      : [newLine()]
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showJe, setShowJe] = React.useState(true);

  // ── Live totals ────────────────────────────────────────────────────────────

  const totals = React.useMemo(() => {
    try {
      return invoiceTotals(
        lines.map((l) => ({
          qty: l.qty || "0",
          unit_price: l.unit_price || "0",
          discount: l.discount || "0",
          vat_rate: l.vat_rate,
          wht_rate: l.wht_rate || "0",
        })),
        { vat_inclusive: vatInclusive }
      );
    } catch {
      return null;
    }
  }, [lines, vatInclusive]);

  // ── JE preview ─────────────────────────────────────────────────────────────

  const jeEntries = React.useMemo(() => {
    if (!totals) return [];

    const entries: { account: string; label: string; dr: string; cr: string }[] = [];
    const revenueMap = new Map<string, ReturnType<typeof D>>();

    lines.forEach((l) => {
      try {
        const net = calcLineNet({
          qty: l.qty || "0",
          unit_price: l.unit_price || "0",
          discount: l.discount || "0",
        });
        const { net: lineNetAmt } = calcLineVat({
          net,
          vat_rate: l.vat_rate,
          vat_inclusive: vatInclusive,
        });
        const code = l.revenue_account_code || "41010";
        revenueMap.set(code, (revenueMap.get(code) ?? D(0)).plus(lineNetAmt));
      } catch {
        // skip malformed line
      }
    });

    // DR: Accounts Receivable
    if (!totals.total.isZero()) {
      entries.push({ account: "1100", label: "ลูกหนี้การค้า", dr: formatTHB(totals.total), cr: "" });
    }
    // CR: Revenue accounts
    revenueMap.forEach((amt, code) => {
      if (!amt.isZero()) {
        entries.push({ account: code, label: `รายได้ (${code})`, dr: "", cr: formatTHB(amt) });
      }
    });
    // CR: VAT Payable
    if (!totals.vat_total.isZero()) {
      entries.push({ account: "2210", label: "ภาษีขาย", dr: "", cr: formatTHB(totals.vat_total) });
    }
    return entries;
  }, [totals, lines, vatInclusive]);

  // ── Line handlers ──────────────────────────────────────────────────────────

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  function updateLine(key: string, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }

  function handleServiceSelect(key: string, _code: string | null, svc: CatalogService | null) {
    if (svc) {
      updateLine(key, {
        service_code: svc.code,
        description: svc.name_th,
        unit_price: svc.default_unit_price,
        vat_rate: svc.default_vat_rate as VatRate,
        revenue_account_code: svc.default_revenue_account_code,
      });
    } else {
      updateLine(key, { service_code: undefined });
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function buildPayload(): InvoiceSubmitValues | null {
    if (!customerId) {
      setError("กรุณาเลือกลูกค้า");
      return null;
    }
    if (!issueDate) {
      setError("กรุณาระบุวันที่ออกใบแจ้งหนี้");
      return null;
    }
    if (!dueDate) {
      setError("กรุณาระบุวันครบกำหนดชำระ");
      return null;
    }
    if (lines.length === 0) {
      setError("กรุณาเพิ่มรายการอย่างน้อย 1 รายการ");
      return null;
    }
    for (const l of lines) {
      if (!l.revenue_account_code.trim()) {
        setError("กรุณาระบุรหัสบัญชีรายได้ในทุกรายการ");
        return null;
      }
    }
    return {
      customer_id: customerId,
      branch_code: branchCode,
      issue_date: issueDate,
      due_date: dueDate,
      is_tax_invoice: isTaxInvoice,
      vat_inclusive: vatInclusive,
      notes: notes.trim(),
      source_ref: sourceRef.trim(),
      lines: lines.map((l) => ({
        description: l.description,
        service_code: l.service_code || undefined,
        qty: l.qty || "1",
        unit_price: l.unit_price || "0",
        discount: l.discount || "0",
        vat_rate: l.vat_rate,
        revenue_account_code: l.revenue_account_code,
      })),
    };
  }

  async function submit(fn: (v: InvoiceSubmitValues) => Promise<void>) {
    const payload = buildPayload();
    if (!payload) return;
    setError(null);
    setSaving(true);
    try {
      await fn(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TH_STYLE: React.CSSProperties = {
    textAlign: "left",
    padding: "4px 4px",
    fontWeight: 500,
    color: "var(--text-muted)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div>
      <PageHeader
        title="สร้างใบแจ้งหนี้"
        description="New Sales Invoice · Accounts Receivable"
        breadcrumbs={[
          { label: "AR", href: "/ar/dashboard" },
          { label: "Invoices", href: "/ar/invoices" },
          { label: "New" },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: 20,
          alignItems: "start",
          marginTop: 20,
        }}
      >
        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Header fields */}
          <div style={CARD}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LABEL}>ลูกค้า *</label>
                <div data-testid="field-customer">
                  <CustomerPicker
                    value={customerId}
                    onChange={(id) => setCustomerId(id)}
                  />
                </div>
              </div>

              <div>
                <label style={LABEL}>สาขา *</label>
                <select
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  style={{ ...INPUT, cursor: "pointer" }}
                >
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={LABEL}>เลขอ้างอิง</label>
                <input
                  type="text"
                  value={sourceRef}
                  onChange={(e) => setSourceRef(e.target.value)}
                  placeholder="e.g. SO-2026-001"
                  style={INPUT}
                />
              </div>

              <div>
                <label style={LABEL}>วันที่ออกใบแจ้งหนี้ *</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  style={INPUT}
                />
              </div>

              <div>
                <label style={LABEL}>วันครบกำหนดชำระ *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={INPUT}
                />
              </div>

              <div style={{ gridColumn: "1 / -1", display: "flex", gap: 24, alignItems: "center", paddingTop: 4 }}>
                <Toggle label="ใบกำกับภาษี (Tax Invoice)" checked={isTaxInvoice} onChange={setIsTaxInvoice} />
                <Toggle label="ราคารวม VAT แล้ว" checked={vatInclusive} onChange={setVatInclusive} />
              </div>
            </div>
          </div>

          {/* Lines table */}
          <div style={CARD}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: 0,
                }}
              >
                รายการสินค้า/บริการ
              </h3>
              <button
                data-testid="action-add-line"
                type="button"
                onClick={addLine}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                  background: "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Plus size={11} />
                เพิ่มรายการ
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={TH_STYLE}>บริการ</th>
                    <th style={TH_STYLE}>รายละเอียด</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>จำนวน</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>ราคา/หน่วย</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>ส่วนลด</th>
                    <th style={TH_STYLE}>VAT%</th>
                    <th style={TH_STYLE}>บัญชีรายได้</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>ยอดรวม</th>
                    <th style={TH_STYLE} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <LineRow
                      key={line._key}
                      index={index}
                      line={line}
                      vatInclusive={vatInclusive}
                      onServiceSelect={(code, svc) => handleServiceSelect(line._key, code, svc)}
                      onChange={(patch) => updateLine(line._key, patch)}
                      onRemove={() => removeLine(line._key)}
                      canRemove={lines.length > 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {lines.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "24px 0",
                  color: "var(--text-dim)",
                  fontSize: 12,
                }}
              >
                ยังไม่มีรายการ — กดปุ่ม "เพิ่มรายการ" เพื่อเพิ่ม
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={CARD}>
            <label style={LABEL}>หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="หมายเหตุเพิ่มเติม..."
              style={{
                ...INPUT,
                height: "auto",
                padding: "8px 10px",
                resize: "vertical",
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 5,
                fontSize: 12,
                color: "var(--error)",
              }}
            >
              {error}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              style={{
                padding: "7px 16px",
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
              data-testid="action-submit"
              type="button"
              onClick={() => submit(onSaveDraft)}
              disabled={saving}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                color: "var(--text-primary)",
                cursor: saving ? "default" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              บันทึกร่าง (Draft)
            </button>
            <button
              data-testid="action-post"
              type="button"
              onClick={() => submit(onPost)}
              disabled={saving}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                borderRadius: 4,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: saving ? "default" : "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              ออกใบแจ้งหนี้ (Post)
            </button>
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Totals */}
          <div style={CARD}>
            <h3
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: "0 0 12px",
              }}
            >
              สรุปยอด
            </h3>
            {totals ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <TotalRow
                  label="ราคาก่อนส่วนลด"
                  value={formatTHB(totals.subtotal.plus(totals.discount_total))}
                />
                {!totals.discount_total.isZero() && (
                  <TotalRow
                    label="ส่วนลด"
                    value={`(${formatTHB(totals.discount_total)})`}
                    dimmed
                  />
                )}
                <TotalRow testId="total-subtotal" label="ราคาหลังส่วนลด" value={formatTHB(totals.subtotal)} />
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <TotalRow testId="total-vat" label={`VAT${vatInclusive ? " (รวมแล้ว)" : " 7%"}`} value={formatTHB(totals.vat_total)} />
                {!totals.withholding_total.isZero() && (
                  <TotalRow
                    label="หัก ณ ที่จ่าย (WHT)"
                    value={`(${formatTHB(totals.withholding_total)})`}
                    dimmed
                  />
                )}
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <TotalRow testId="total-grand" label="ยอดรวมสุทธิ" value={formatTHB(totals.total)} bold />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
                เพิ่มรายการเพื่อดูยอด
              </p>
            )}
          </div>

          {/* JE Preview */}
          <div style={CARD}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h3
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  margin: 0,
                }}
              >
                Journal Entry Preview
              </h3>
              <button
                type="button"
                onClick={() => setShowJe((v) => !v)}
                style={{
                  fontSize: 10,
                  color: "var(--text-dim)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {showJe ? "ซ่อน" : "แสดง"}
              </button>
            </div>

            {showJe && (
              <>
                {jeEntries.length > 0 ? (
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        <th
                          style={{
                            textAlign: "left",
                            padding: "2px 0",
                            color: "var(--text-dim)",
                            fontWeight: 500,
                            fontSize: 10,
                          }}
                        >
                          บัญชี
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "2px 6px",
                            color: "var(--text-dim)",
                            fontWeight: 500,
                            fontSize: 10,
                          }}
                        >
                          DR
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: "2px 0",
                            color: "var(--text-dim)",
                            fontWeight: 500,
                            fontSize: 10,
                          }}
                        >
                          CR
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jeEntries.map((e, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: "1px solid rgba(255,255,255,0.04)",
                          }}
                        >
                          <td style={{ padding: "3px 0" }}>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: 10,
                                color: "var(--accent)",
                                marginRight: 4,
                              }}
                            >
                              {e.account}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                              {e.label}
                            </span>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "3px 6px",
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "var(--text-primary)",
                            }}
                          >
                            {e.dr}
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              padding: "3px 0",
                              fontFamily: "var(--font-mono)",
                              fontSize: 11,
                              color: "var(--text-muted)",
                            }}
                          >
                            {e.cr}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>
                    เพิ่มรายการเพื่อดูตัวอย่าง JE
                  </p>
                )}
                <p
                  style={{
                    fontSize: 10,
                    color: "var(--text-dim)",
                    marginTop: 8,
                    marginBottom: 0,
                    fontStyle: "italic",
                  }}
                >
                  * ตัวอย่างเท่านั้น — JE จริงสร้างเมื่อ Post
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

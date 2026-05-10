"use client";

import * as React from "react";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  D,
  formatTHB,
  billTotals,
  lineNet as calcLineNet,
  lineVat as calcLineVat,
  WHT_RATES,
  WHT_THRESHOLD,
  lookupRate,
  type WhtKey,
} from "@wind-acc/shared";
import { VendorPicker, type VendorOption } from "@/components/ui/vendor-picker";
import { PageHeader } from "@/components/ui/page-header";

const BRANCHES = ["TL", "EK", "RAMA9"] as const;
type VatRate = "7" | "0" | "EXEMPT";

const WHT_TYPE_OPTIONS = WHT_RATES.map((r) => ({
  key: r.key as WhtKey,
  label: r.label_th,
}));

interface FormLine {
  _key: string;
  description: string;
  expense_account_code: string;
  qty: string;
  unit_price: string;
  vat_rate: VatRate;
  withholding_type: WhtKey | "";
  withholding_rate: string;
}

function newLine(): FormLine {
  return {
    _key: crypto.randomUUID(),
    description: "",
    expense_account_code: "51010",
    qty: "1",
    unit_price: "0.00",
    vat_rate: "7",
    withholding_type: "services",
    withholding_rate: "3",
  };
}

export interface BillSubmitValues {
  vendor_id: string;
  vendor_invoice_no?: string;
  branch_code: string;
  issue_date: string;
  due_date: string;
  vat_inclusive: boolean;
  notes?: string;
  lines: Array<{
    description: string;
    expense_account_code: string;
    qty: string;
    unit_price: string;
    vat_rate: string;
    withholding_type?: string;
    withholding_rate: string;
  }>;
}

export interface BillFormProps {
  defaultValues?: {
    vendor_id?: string | null;
    branch_code?: string;
    vendor_invoice_no?: string;
    issue_date?: string;
    due_date?: string;
    vat_inclusive?: boolean;
    notes?: string;
    lines?: Partial<FormLine>[];
  };
  onSaveDraft: (values: BillSubmitValues) => Promise<void>;
  onPost: (values: BillSubmitValues) => Promise<void>;
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
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  dimmed?: boolean;
  accent?: boolean;
}) {
  return (
    <div
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
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: dimmed
            ? "var(--text-dim)"
            : accent
            ? "var(--accent)"
            : bold
            ? "var(--text-primary)"
            : "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}

interface LineRowProps {
  line: FormLine;
  idx: number;
  vatInclusive: boolean;
  vendorType: "INDIVIDUAL" | "JURISTIC" | null;
  onChange: (patch: Partial<FormLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function LineRow({ line, idx, vatInclusive, vendorType, onChange, onRemove, canRemove }: LineRowProps) {
  const lineTotal = React.useMemo(() => {
    try {
      const net = calcLineNet({
        qty: line.qty || "0",
        unit_price: line.unit_price || "0",
        discount: "0",
      });
      const { gross } = calcLineVat({ net, vat_rate: line.vat_rate, vat_inclusive: vatInclusive });
      return formatTHB(gross);
    } catch {
      return "—";
    }
  }, [line.qty, line.unit_price, line.vat_rate, vatInclusive]);

  function handleWhtTypeChange(key: WhtKey | "") {
    if (!key) {
      onChange({ withholding_type: "", withholding_rate: "0" });
      return;
    }
    let rate = "0";
    if (vendorType) {
      try {
        rate = lookupRate(key, vendorType).toString();
      } catch {
        rate = "0";
      }
    }
    onChange({ withholding_type: key, withholding_rate: rate });
  }

  const cellStyle: React.CSSProperties = { padding: "4px 4px", verticalAlign: "middle" };
  const numInput: React.CSSProperties = { ...INPUT, textAlign: "right" };

  return (
    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {/* Description */}
      <td style={{ ...cellStyle, minWidth: 160 }}>
        <input
          type="text"
          data-testid={`field-description-${idx}`}
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="รายละเอียด"
          style={INPUT}
        />
      </td>

      {/* Expense account */}
      <td style={{ ...cellStyle, width: 80 }}>
        <input
          type="text"
          value={line.expense_account_code}
          onChange={(e) => onChange({ expense_account_code: e.target.value })}
          placeholder="5000"
          style={{ ...INPUT, width: 80, fontFamily: "var(--font-mono)", fontSize: 11 }}
        />
      </td>

      {/* Qty */}
      <td style={{ ...cellStyle, width: 64 }}>
        <input
          type="number"
          data-testid={`field-qty-${idx}`}
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
          type="number"
          data-testid={`field-amount-${idx}`}
          value={line.unit_price}
          onChange={(e) => onChange({ unit_price: e.target.value })}
          min="0"
          step="0.01"
          style={{ ...numInput, width: 90 }}
        />
      </td>

      {/* VAT rate */}
      <td style={{ ...cellStyle, width: 80 }}>
        <select
          value={line.vat_rate}
          onChange={(e) => onChange({ vat_rate: e.target.value as VatRate })}
          style={{ ...INPUT, width: 80, cursor: "pointer", paddingLeft: 6 }}
        >
          <option value="7">7%</option>
          <option value="0">0%</option>
          <option value="EXEMPT">Exempt</option>
        </select>
      </td>

      {/* WHT type */}
      <td style={{ ...cellStyle, width: 150 }}>
        <select
          value={line.withholding_type}
          onChange={(e) => handleWhtTypeChange(e.target.value as WhtKey | "")}
          style={{ ...INPUT, width: 150, cursor: "pointer", paddingLeft: 6, fontSize: 11 }}
        >
          <option value="">— ไม่หัก —</option>
          {WHT_TYPE_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </td>

      {/* WHT rate % */}
      <td style={{ ...cellStyle, width: 60 }}>
        <input
          type="number"
          value={line.withholding_rate}
          onChange={(e) => onChange({ withholding_rate: e.target.value })}
          min="0"
          max="100"
          step="0.5"
          style={{ ...numInput, width: 60 }}
          disabled={!line.withholding_type}
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
          type="button"
          data-testid={`action-remove-line-${idx}`}
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

export function BillForm({ defaultValues, onSaveDraft, onPost, onCancel }: BillFormProps) {
  const today = new Date().toISOString().split("T")[0]!;
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0]!;

  const [vendorId, setVendorId] = React.useState<string | null>(defaultValues?.vendor_id ?? null);
  const [vendor, setVendor] = React.useState<VendorOption | null>(null);
  const [branchCode, setBranchCode] = React.useState(defaultValues?.branch_code ?? "TL");
  const [vendorInvoiceNo, setVendorInvoiceNo] = React.useState(defaultValues?.vendor_invoice_no ?? "");
  const [issueDate, setIssueDate] = React.useState(defaultValues?.issue_date ?? today);
  const [dueDate, setDueDate] = React.useState(defaultValues?.due_date ?? in30);
  const [vatInclusive, setVatInclusive] = React.useState(defaultValues?.vat_inclusive ?? false);
  const [notes, setNotes] = React.useState(defaultValues?.notes ?? "");
  const [lines, setLines] = React.useState<FormLine[]>(
    defaultValues?.lines?.length
      ? defaultValues.lines.map((l) => ({ ...newLine(), ...l, _key: crypto.randomUUID() }))
      : [newLine()]
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showJe, setShowJe] = React.useState(true);

  const vendorType = vendor?.vendor_type ?? null;

  // ── Live totals ────────────────────────────────────────────────────────────

  const totals = React.useMemo(() => {
    try {
      return billTotals(
        lines.map((l) => ({
          qty: l.qty || "0",
          unit_price: l.unit_price || "0",
          vat_rate: l.vat_rate,
          wht_rate: l.withholding_type ? (l.withholding_rate || "0") : null,
        })),
        { vat_inclusive: vatInclusive }
      );
    } catch {
      return null;
    }
  }, [lines, vatInclusive]);

  const belowThreshold = totals ? totals.total.lt(WHT_THRESHOLD) : false;

  // ── JE preview ─────────────────────────────────────────────────────────────

  const jeEntries = React.useMemo(() => {
    if (!totals) return [];
    const entries: { account: string; label: string; dr: string; cr: string }[] = [];
    const expenseMap = new Map<string, ReturnType<typeof D>>();

    lines.forEach((l) => {
      try {
        const net = calcLineNet({ qty: l.qty || "0", unit_price: l.unit_price || "0", discount: "0" });
        const { net: lineNetAmt } = calcLineVat({ net, vat_rate: l.vat_rate, vat_inclusive: vatInclusive });
        const code = l.expense_account_code || "51010";
        expenseMap.set(code, (expenseMap.get(code) ?? D(0)).plus(lineNetAmt));
      } catch {
        // skip malformed line
      }
    });

    expenseMap.forEach((amt, code) => {
      if (!amt.isZero()) {
        entries.push({ account: code, label: `ค่าใช้จ่าย (${code})`, dr: formatTHB(amt), cr: "" });
      }
    });
    if (!totals.vat_total.isZero()) {
      entries.push({ account: "14010", label: "ภาษีซื้อ", dr: formatTHB(totals.vat_total), cr: "" });
    }
    const apAmt = totals.total.minus(totals.withholding_total);
    if (!apAmt.isZero()) {
      entries.push({ account: "21010", label: "เจ้าหนี้การค้า", dr: "", cr: formatTHB(apAmt) });
    }
    if (!totals.withholding_total.isZero()) {
      entries.push({ account: "21120", label: "ภาษีหัก ณ ที่จ่าย ค้างจ่าย", dr: "", cr: formatTHB(totals.withholding_total) });
    }
    return entries;
  }, [totals, lines, vatInclusive]);

  // ── Line handlers ──────────────────────────────────────────────────────────

  function addLine() {
    const base = newLine();
    if (vendorType && base.withholding_type) {
      try {
        base.withholding_rate = lookupRate(base.withholding_type as WhtKey, vendorType).toString();
      } catch {
        // use default
      }
    }
    setLines((prev) => [...prev, base]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  function updateLine(key: string, patch: Partial<FormLine>) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, ...patch } : l)));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  function buildPayload(): BillSubmitValues | null {
    if (!vendorId) {
      setError("กรุณาเลือกเจ้าหนี้");
      return null;
    }
    if (!issueDate) {
      setError("กรุณาระบุวันที่ออกใบวางบิล");
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
      if (!l.expense_account_code.trim()) {
        setError("กรุณาระบุรหัสบัญชีค่าใช้จ่ายในทุกรายการ");
        return null;
      }
      if (!l.description.trim()) {
        setError("กรุณาระบุรายละเอียดในทุกรายการ");
        return null;
      }
    }
    return {
      vendor_id: vendorId,
      vendor_invoice_no: vendorInvoiceNo.trim() || undefined,
      branch_code: branchCode,
      issue_date: issueDate,
      due_date: dueDate,
      vat_inclusive: vatInclusive,
      notes: notes.trim() || undefined,
      lines: lines.map((l) => ({
        description: l.description,
        expense_account_code: l.expense_account_code,
        qty: l.qty || "1",
        unit_price: l.unit_price || "0",
        vat_rate: l.vat_rate,
        withholding_type: l.withholding_type || undefined,
        withholding_rate: l.withholding_type ? (l.withholding_rate || "0") : "0",
      })),
    };
  }

  async function submit(fn: (v: BillSubmitValues) => Promise<void>) {
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
        title="สร้างใบวางบิล"
        description="New Bill · Accounts Payable"
        breadcrumbs={[
          { label: "AP", href: "/ap/dashboard" },
          { label: "Bills", href: "/ap/bills" },
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
                <label style={LABEL}>เจ้าหนี้ *</label>
                <div data-testid="field-vendor">
                  <VendorPicker
                    value={vendorId}
                    onChange={(id, v) => {
                      setVendorId(id);
                      setVendor(v);
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={LABEL}>เลขที่ใบแจ้งหนี้ (เจ้าหนี้)</label>
                <input
                  type="text"
                  value={vendorInvoiceNo}
                  onChange={(e) => setVendorInvoiceNo(e.target.value)}
                  placeholder="เลขที่ใบแจ้งหนี้จากเจ้าหนี้"
                  style={INPUT}
                />
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
                <label style={LABEL}>วันที่รับใบแจ้งหนี้ *</label>
                <input
                  type="date"
                  data-testid="field-issue-date"
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
                รายการค่าใช้จ่าย
              </h3>
              <button
                type="button"
                data-testid="action-add-line"
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
                    <th style={TH_STYLE}>รายละเอียด</th>
                    <th style={TH_STYLE}>บัญชี</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>จำนวน</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>ราคา/หน่วย</th>
                    <th style={TH_STYLE}>VAT%</th>
                    <th style={TH_STYLE}>ประเภท WHT</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>WHT%</th>
                    <th style={{ ...TH_STYLE, textAlign: "right" }}>ยอดรวม</th>
                    <th style={TH_STYLE} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <LineRow
                      key={line._key}
                      line={line}
                      idx={idx}
                      vatInclusive={vatInclusive}
                      vendorType={vendorType}
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
              style={{ ...INPUT, height: "auto", padding: "8px 10px", resize: "vertical" }}
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
              type="button"
              data-testid="action-submit"
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
              type="button"
              data-testid="action-post"
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
              บันทึกใบวางบิล (Post)
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
                <TotalRow label="ราคาก่อน VAT" value={formatTHB(totals.subtotal)} />
                <TotalRow
                  label={`VAT${vatInclusive ? " (รวมแล้ว)" : " 7%"}`}
                  value={formatTHB(totals.vat_total)}
                />
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <div data-testid="total-grand"><TotalRow label="ยอดรวม" value={formatTHB(totals.total)} /></div>
                {!totals.withholding_total.isZero() && (
                  <div data-testid="total-wht">
                    <TotalRow
                      label="หัก ณ ที่จ่าย (WHT)"
                      value={`(${formatTHB(totals.withholding_total)})`}
                      dimmed
                    />
                  </div>
                )}
                <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }} />
                <div data-testid="total-net-payable"><TotalRow label="ยอดสุทธิที่ต้องชำระ" value={formatTHB(totals.net_payable)} bold accent /></div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
                เพิ่มรายการเพื่อดูยอด
              </p>
            )}

            {/* Threshold warning */}
            {belowThreshold && lines.some((l) => l.withholding_type) && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  marginTop: 10,
                  padding: "8px 10px",
                  background: "rgba(200,160,60,0.1)",
                  border: "1px solid rgba(200,160,60,0.4)",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#C8A03C",
                }}
              >
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>ยอดต่ำกว่า 1,000 บาท ไม่ต้องหักภาษี</span>
              </div>
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
                        <th style={{ textAlign: "left", padding: "2px 0", color: "var(--text-dim)", fontWeight: 500, fontSize: 10 }}>
                          บัญชี
                        </th>
                        <th style={{ textAlign: "right", padding: "2px 6px", color: "var(--text-dim)", fontWeight: 500, fontSize: 10 }}>
                          DR
                        </th>
                        <th style={{ textAlign: "right", padding: "2px 0", color: "var(--text-dim)", fontWeight: 500, fontSize: 10 }}>
                          CR
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {jeEntries.map((e, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td style={{ padding: "3px 0" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", marginRight: 4 }}>
                              {e.account}
                            </span>
                            <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{e.label}</span>
                          </td>
                          <td style={{ textAlign: "right", padding: "3px 6px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)" }}>
                            {e.dr}
                          </td>
                          <td style={{ textAlign: "right", padding: "3px 0", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
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
                <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
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

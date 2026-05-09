"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useUser } from "@/lib/use-user";
import { PageHeader } from "@/components/ui/page-header";
import { AccountPicker, type AccountOption } from "@/components/ui/account-picker";

interface AccountMap {
  wind_clinic_service_to_revenue: Record<string, string>;
  wind_clinic_product_to_revenue: Record<string, string>;
  wind_clinic_payment_to_bank: Record<string, string>;
  card_fee_account: string;
  default_ar_account: string;
  default_ap_account: string;
  doctor_commission_account?: string;
  doctor_commission_payable?: string;
}

type KVRow = { code: string; account: string };

const PAYMENT_METHODS = [
  "CASH",
  "TRANSFER",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "QR",
  "CHEQUE",
  "OTHER",
] as const;

function recordToRows(rec: Record<string, string>): KVRow[] {
  return Object.entries(rec).map(([code, account]) => ({ code, account }));
}

function rowsToRecord(rows: KVRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.code.trim()) result[row.code.trim()] = row.account;
  }
  return result;
}

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 24,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "16px 20px",
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: 12,
  letterSpacing: "-0.01em",
};

const SECTION_DESC_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 12,
};

const INPUT_STYLE: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: 4,
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "var(--font-mono, monospace)",
  width: "100%",
  outline: "none",
};

const BTN_GHOST: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 28,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: 4,
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
  cursor: "pointer",
};

const BTN_PRIMARY: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 14px",
  border: "none",
  borderRadius: 4,
  background: "var(--accent)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const BTN_DANGER_ICON: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  border: "none",
  borderRadius: 4,
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  flexShrink: 0,
};

const COL_CODE: React.CSSProperties = { width: 180, flexShrink: 0 };
const COL_ACCOUNT: React.CSSProperties = { flex: 1, minWidth: 0 };

function KVTable({
  rows,
  onChange,
  accounts,
  disabled,
  codePlaceholder = "รหัส (e.g. BOTOX)",
}: {
  rows: KVRow[];
  onChange: (rows: KVRow[]) => void;
  accounts: AccountOption[];
  disabled: boolean;
  codePlaceholder?: string;
}) {
  function updateCode(idx: number, code: string) {
    const next = rows.map((r, i) => (i === idx ? { ...r, code } : r));
    onChange(next);
  }

  function updateAccount(idx: number, account: string | null) {
    const next = rows.map((r, i) => (i === idx ? { ...r, account: account ?? "" } : r));
    onChange(next);
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  function addRow() {
    onChange([...rows, { code: "", account: "" }]);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 4,
          paddingLeft: 2,
        }}
      >
        <div style={{ ...COL_CODE, fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          รหัส (Code)
        </div>
        <div style={{ ...COL_ACCOUNT, fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          บัญชีรายได้ (Account)
        </div>
        <div style={{ width: 28 }} />
      </div>

      {rows.map((row, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
          <div style={COL_CODE}>
            <input
              style={INPUT_STYLE}
              value={row.code}
              onChange={(e) => updateCode(idx, e.target.value)}
              placeholder={codePlaceholder}
              disabled={disabled}
            />
          </div>
          <div style={COL_ACCOUNT}>
            <AccountPicker
              value={row.account || null}
              onChange={(code) => updateAccount(idx, code)}
              accounts={accounts}
              disabled={disabled}
            />
          </div>
          <button
            type="button"
            style={BTN_DANGER_ICON}
            onClick={() => removeRow(idx)}
            disabled={disabled}
            title="Remove"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      {!disabled && (
        <button type="button" style={{ ...BTN_GHOST, marginTop: 4 }} onClick={addRow}>
          <Plus size={12} />
          เพิ่มแถว
        </button>
      )}
    </div>
  );
}

function PaymentBankTable({
  map,
  onChange,
  accounts,
  disabled,
}: {
  map: Record<string, string>;
  onChange: (map: Record<string, string>) => void;
  accounts: AccountOption[];
  disabled: boolean;
}) {
  function updateMethod(method: string, accountCode: string | null) {
    const next = { ...map };
    if (accountCode) {
      next[method] = accountCode;
    } else {
      delete next[method];
    }
    onChange(next);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 2 }}>
        <div style={{ width: 140, fontSize: 11, color: "var(--text-muted)", fontWeight: 500, flexShrink: 0 }}>
          วิธีชำระเงิน
        </div>
        <div style={{ flex: 1, fontSize: 11, color: "var(--text-muted)", fontWeight: 500 }}>
          บัญชี GL (Account)
        </div>
      </div>

      {PAYMENT_METHODS.map((method) => (
        <div key={method} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
          <div
            style={{
              width: 140,
              flexShrink: 0,
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--text-primary)",
              paddingTop: 6,
            }}
          >
            {method}
          </div>
          <div style={{ flex: 1 }}>
            <AccountPicker
              value={map[method] ?? null}
              onChange={(code) => updateMethod(method, code)}
              accounts={accounts}
              disabled={disabled}
              placeholder="ไม่ได้ระบุ"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function SingleAccountRow({
  label,
  value,
  onChange,
  accounts,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (code: string | null) => void;
  accounts: AccountOption[];
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
      <div
        style={{
          width: 200,
          flexShrink: 0,
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, maxWidth: 360 }}>
        <AccountPicker
          value={value || null}
          onChange={onChange}
          accounts={accounts}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

export default function AccountMapPage() {
  const { user, loading: userLoading } = useUser();

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [serviceRows, setServiceRows] = useState<KVRow[]>([]);
  const [productRows, setProductRows] = useState<KVRow[]>([]);
  const [paymentMap, setPaymentMap] = useState<Record<string, string>>({});
  const [cardFeeAccount, setCardFeeAccount] = useState("");
  const [defaultAR, setDefaultAR] = useState("");
  const [defaultAP, setDefaultAP] = useState("");
  const [doctorCommissionAccount, setDoctorCommissionAccount] = useState("");
  const [doctorCommissionPayable, setDoctorCommissionPayable] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isAdmin = user?.role === "ADMIN";
  const disabled = !isAdmin || saving;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [accs, map] = await Promise.all([
        apiClient.get<AccountOption[]>("/api/v1/accounts"),
        apiClient.get<AccountMap>("/api/v1/settings/account-map"),
      ]);
      setAccounts(accs);
      setServiceRows(recordToRows(map.wind_clinic_service_to_revenue ?? {}));
      setProductRows(recordToRows(map.wind_clinic_product_to_revenue ?? {}));
      setPaymentMap(map.wind_clinic_payment_to_bank ?? {});
      setCardFeeAccount(map.card_fee_account ?? "");
      setDefaultAR(map.default_ar_account ?? "");
      setDefaultAP(map.default_ap_account ?? "");
      setDoctorCommissionAccount(map.doctor_commission_account ?? "");
      setDoctorCommissionPayable(map.doctor_commission_payable ?? "");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load account map");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userLoading) loadData();
  }, [userLoading, loadData]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const payload: AccountMap = {
        wind_clinic_service_to_revenue: rowsToRecord(serviceRows),
        wind_clinic_product_to_revenue: rowsToRecord(productRows),
        wind_clinic_payment_to_bank: paymentMap,
        card_fee_account: cardFeeAccount,
        default_ar_account: defaultAR,
        default_ap_account: defaultAP,
        ...(doctorCommissionAccount && { doctor_commission_account: doctorCommissionAccount }),
        ...(doctorCommissionPayable && { doctor_commission_payable: doctorCommissionPayable }),
      };
      await apiClient.patch<AccountMap>("/api/v1/settings/account-map", payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || userLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          color: "var(--text-muted)",
          gap: 8,
        }}
      >
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ color: "var(--color-danger, #ef4444)", padding: 24, fontSize: 13 }}>
        <AlertCircle size={14} style={{ display: "inline", marginRight: 6 }} />
        {loadError}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <PageHeader
        title="Account Map"
        description="กำหนดการแมปรหัสบริการ/สินค้า/การชำระเงิน → รหัสบัญชี GL สำหรับ webhook อัตโนมัติ"
        breadcrumbs={[{ label: "Settings" }, { label: "Account Map" }]}
        actions={
          isAdmin ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {saveSuccess && (
                <span style={{ fontSize: 12, color: "var(--color-success, #22c55e)", display: "flex", alignItems: "center", gap: 4 }}>
                  <CheckCircle2 size={13} />
                  บันทึกแล้ว
                </span>
              )}
              {saveError && (
                <span style={{ fontSize: 12, color: "var(--color-danger, #ef4444)" }}>
                  {saveError}
                </span>
              )}
              <button
                type="button"
                style={{ ...BTN_PRIMARY, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                บันทึก
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              ดูได้อย่างเดียว (Admin เท่านั้น)
            </span>
          )
        }
      />

      {/* Service → Revenue */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE_STYLE}>บริการ → รายได้ (Service → Revenue)</div>
        <div style={SECTION_DESC_STYLE}>
          แมปรหัสบริการจาก wind-clinic กับบัญชีรายได้ รองรับ wildcard เช่น{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>SKINCARE_*</code>
          {" "}และ{" "}
          <code style={{ fontFamily: "var(--font-mono, monospace)" }}>DEFAULT</code>
          {" "}(fallback)
        </div>
        <KVTable
          rows={serviceRows}
          onChange={setServiceRows}
          accounts={accounts}
          disabled={disabled}
          codePlaceholder="รหัสบริการ (เช่น BOTOX)"
        />
      </div>

      {/* Product → Revenue */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE_STYLE}>สินค้า → รายได้ (Product → Revenue)</div>
        <div style={SECTION_DESC_STYLE}>
          แมปรหัสสินค้าจาก wind-clinic กับบัญชีรายได้
        </div>
        <KVTable
          rows={productRows}
          onChange={setProductRows}
          accounts={accounts}
          disabled={disabled}
          codePlaceholder="รหัสสินค้า (เช่น SKINCARE_*)"
        />
      </div>

      {/* Payment Method → Bank/Cash Account */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE_STYLE}>วิธีชำระ → บัญชีธนาคาร (Payment → GL Account)</div>
        <div style={SECTION_DESC_STYLE}>
          ระบุบัญชี GL ที่ใช้รับเงินสำหรับแต่ละวิธีชำระเงิน
        </div>
        <PaymentBankTable
          map={paymentMap}
          onChange={setPaymentMap}
          accounts={accounts}
          disabled={disabled}
        />
      </div>

      {/* Fixed accounts */}
      <div style={SECTION_STYLE}>
        <div style={SECTION_TITLE_STYLE}>บัญชีคงที่ (Fixed Accounts)</div>
        <div style={SECTION_DESC_STYLE}>
          บัญชีเริ่มต้นสำหรับ AR, AP, ค่าธรรมเนียมบัตร และค่าคอมมิชชั่นแพทย์
        </div>

        <SingleAccountRow
          label="ค่าธรรมเนียมบัตร (Card Fee)"
          value={cardFeeAccount}
          onChange={(c) => setCardFeeAccount(c ?? "")}
          accounts={accounts}
          disabled={disabled}
        />
        <SingleAccountRow
          label="AR เริ่มต้น (Default AR)"
          value={defaultAR}
          onChange={(c) => setDefaultAR(c ?? "")}
          accounts={accounts}
          disabled={disabled}
        />
        <SingleAccountRow
          label="AP เริ่มต้น (Default AP)"
          value={defaultAP}
          onChange={(c) => setDefaultAP(c ?? "")}
          accounts={accounts}
          disabled={disabled}
        />
        <SingleAccountRow
          label="ค่าคอมมิชชั่นแพทย์ (Dr Commission Exp)"
          value={doctorCommissionAccount}
          onChange={(c) => setDoctorCommissionAccount(c ?? "")}
          accounts={accounts}
          disabled={disabled}
        />
        <SingleAccountRow
          label="ค้างจ่ายคอมมิชชั่น (Commission Payable)"
          value={doctorCommissionPayable}
          onChange={(c) => setDoctorCommissionPayable(c ?? "")}
          accounts={accounts}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";

interface CreateVendorBody {
  name: string;
  name_th?: string;
  vendor_type: "INDIVIDUAL" | "JURISTIC";
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
  default_withholding_rates?: Record<string, string>;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
};

const LABEL_STYLE: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 4,
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 14,
  paddingBottom: 6,
  borderBottom: "1px solid var(--border)",
};

const WHT_CATEGORIES = [
  { key: "services", label: "บริการ (Services)" },
  { key: "rent", label: "ค่าเช่า (Rent)" },
  { key: "goods", label: "ค่าสินค้า (Goods)" },
  { key: "advertising", label: "ค่าโฆษณา (Advertising)" },
  { key: "interest", label: "ดอกเบี้ย (Interest)" },
  { key: "professional", label: "วิชาชีพ (Professional)" },
  { key: "royalties", label: "ค่าลิขสิทธิ์ (Royalties)" },
  { key: "transportation", label: "ขนส่ง (Transportation)" },
];

const DEFAULT_WHT_RATES: Record<string, string> = {
  services: "3",
  rent: "5",
  goods: "0",
  advertising: "2",
  interest: "1",
  professional: "3",
  royalties: "3",
  transportation: "1",
};

export default function NewVendorPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [whtOpen, setWhtOpen] = useState(false);

  const [name, setName] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [vendorType, setVendorType] = useState<"INDIVIDUAL" | "JURISTIC">("JURISTIC");
  const [taxId, setTaxId] = useState("");
  const [branchOffice, setBranchOffice] = useState("00000");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [whtRates, setWhtRates] = useState<Record<string, string>>({ ...DEFAULT_WHT_RATES });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrors({});
    const fieldErrors: Record<string, string> = {};
    if (!name.trim()) fieldErrors.name = "Vendor name is required";
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const body: CreateVendorBody = {
        name: name.trim(),
        vendor_type: vendorType,
      };
      if (nameTh.trim()) body.name_th = nameTh.trim();
      if (taxId.trim()) body.tax_id = taxId.trim();
      if (branchOffice.trim() && branchOffice !== "00000") body.branch_office = branchOffice.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();
      if (address.trim()) body.address = address.trim();
      const days = parseInt(paymentTermsDays, 10);
      if (!isNaN(days) && days >= 0) body.payment_terms_days = days;
      body.default_withholding_rates = whtRates;

      const created = await apiClient.post<{ id: string }>("/api/v1/vendors", body);
      router.push(`/ap/vendors/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create vendor");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader
        title="เพิ่มเจ้าหนี้ใหม่"
        description="New Vendor"
        breadcrumbs={[
          { label: "AP", href: "/ap/dashboard" },
          { label: "Vendors", href: "/ap/vendors" },
          { label: "New" },
        ]}
      />

      <div style={{ marginTop: 24 }}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(184,92,80,0.1)",
                border: "1px solid var(--error)",
                borderRadius: 5,
                fontSize: 12,
                color: "var(--error)",
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              padding: "8px 12px",
              background: "rgba(var(--accent-rgb, 180,140,100),0.08)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 20,
            }}
          >
            รหัสเจ้าหนี้จะถูกสร้างอัตโนมัติ (VEND-2026-XXXX) เมื่อบันทึก
          </div>

          {/* Section: Basic info */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "18px 20px",
              marginBottom: 14,
            }}
          >
            <div style={SECTION_TITLE}>ข้อมูลพื้นฐาน · Basic Info</div>

            {/* Vendor type — required */}
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL_STYLE}>ประเภทผู้จัดการ · Vendor Type *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(
                  [
                    { value: "JURISTIC", label: "นิติบุคคล (Juristic / Company)" },
                    { value: "INDIVIDUAL", label: "บุคคลธรรมดา (Individual)" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: `1px solid ${vendorType === opt.value ? "var(--accent)" : "var(--border-strong)"}`,
                      background: vendorType === opt.value ? "rgba(var(--accent-rgb,180,140,100),0.08)" : "transparent",
                    }}
                  >
                    <input
                      type="radio"
                      name="vendor_type"
                      value={opt.value}
                      checked={vendorType === opt.value}
                      onChange={() => setVendorType(opt.value)}
                      style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={LABEL_STYLE}>ชื่อ (English) *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: "" })); }}
                  placeholder="Vendor name (English)"
                  style={{ ...INPUT_STYLE, borderColor: errors.name ? "var(--error)" : undefined }}
                  autoFocus
                />
                {errors.name && (
                  <div style={{ fontSize: 11, color: "var(--error)", marginTop: 3 }}>{errors.name}</div>
                )}
              </div>
              <div>
                <label style={LABEL_STYLE}>ชื่อภาษาไทย</label>
                <input
                  value={nameTh}
                  onChange={(e) => setNameTh(e.target.value)}
                  placeholder="ชื่อเจ้าหนี้"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={LABEL_STYLE}>เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder="13 หลัก"
                  maxLength={13}
                  style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>สาขา (Branch Office Code)</label>
                <input
                  value={branchOffice}
                  onChange={(e) => setBranchOffice(e.target.value)}
                  placeholder="00000 = สำนักงานใหญ่"
                  maxLength={5}
                  style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
                />
              </div>
            </div>
          </div>

          {/* Section: Contact */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "18px 20px",
              marginBottom: 14,
            }}
          >
            <div style={SECTION_TITLE}>ข้อมูลติดต่อ · Contact</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={LABEL_STYLE}>เบอร์โทรศัพท์</label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0xx-xxx-xxxx"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vendor@example.com"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div>
              <label style={LABEL_STYLE}>ที่อยู่ (Address)</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ที่อยู่สำหรับออกใบกำกับภาษี"
                rows={3}
                style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.5, padding: "8px 10px" }}
              />
            </div>
          </div>

          {/* Section: Payment */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "18px 20px",
              marginBottom: 14,
            }}
          >
            <div style={SECTION_TITLE}>เงื่อนไขการชำระเงิน · Payment Terms</div>
            <div style={{ maxWidth: 180 }}>
              <label style={LABEL_STYLE}>ระยะเวลาเครดิต (วัน)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  style={{ ...INPUT_STYLE, textAlign: "right", fontFamily: "var(--font-mono)" }}
                />
                <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                  {parseInt(paymentTermsDays, 10) === 0 ? "= COD" : `= Net ${paymentTermsDays} days`}
                </span>
              </div>
            </div>
          </div>

          {/* Section: WHT rates (collapsible) */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              marginBottom: 20,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setWhtOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "14px 20px",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              {whtOpen ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
              <span style={{ ...SECTION_TITLE, margin: 0, padding: 0, border: "none" }}>
                อัตราหัก ณ ที่จ่าย · Default WHT Rates
              </span>
              <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: "auto" }}>
                {whtOpen ? "ซ่อน" : "ตั้งค่าอัตราเริ่มต้นต่อประเภท"}
              </span>
            </button>

            {whtOpen && (
              <div style={{ padding: "0 20px 18px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                  อัตราเหล่านี้ใช้เป็นค่าเริ่มต้น — สามารถเปลี่ยนได้ต่อบิล
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {WHT_CATEGORIES.map(({ key, label }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <label style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>
                        {label}
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={whtRates[key] ?? "0"}
                          onChange={(e) =>
                            setWhtRates((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          style={{
                            width: 60,
                            padding: "4px 6px",
                            fontSize: 12,
                            borderRadius: 3,
                            border: "1px solid var(--border-strong)",
                            background: "var(--surface)",
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-mono)",
                            textAlign: "right",
                            outline: "none",
                          }}
                        />
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push("/ap/vendors")}
              disabled={submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <ArrowLeft size={12} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 20px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: submitting ? "var(--surface)" : "var(--accent)",
                color: "#fff",
                cursor: submitting ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              {submitting ? "Saving..." : "Create Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

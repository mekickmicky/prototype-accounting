"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";

interface CreateCustomerBody {
  name: string;
  name_th?: string;
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
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

export default function NewCustomerPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [nameTh, setNameTh] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchOffice, setBranchOffice] = useState("00000");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState("0");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: CreateCustomerBody = { name: name.trim() };
      if (nameTh.trim()) body.name_th = nameTh.trim();
      if (taxId.trim()) body.tax_id = taxId.trim();
      if (branchOffice.trim() && branchOffice !== "00000") body.branch_office = branchOffice.trim();
      if (phone.trim()) body.phone = phone.trim();
      if (email.trim()) body.email = email.trim();
      if (address.trim()) body.address = address.trim();
      const days = parseInt(paymentTermsDays, 10);
      if (!isNaN(days) && days >= 0) body.payment_terms_days = days;

      const created = await apiClient.post<{ id: string }>("/api/v1/customers", body);
      router.push(`/ar/customers/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create customer");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <PageHeader
        title="เพิ่มลูกค้าใหม่"
        description="New Customer"
        breadcrumbs={[
          { label: "AR", href: "/ar/dashboard" },
          { label: "Customers", href: "/ar/customers" },
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

          {/* Auto-generated code notice */}
          <div
            style={{
              padding: "8px 12px",
              background: "rgba(200, 150, 122, 0.08)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              fontSize: 11,
              color: "var(--text-muted)",
              marginBottom: 20,
            }}
          >
            รหัสลูกค้าจะถูกสร้างอัตโนมัติ (CUST-2026-XXXX) เมื่อบันทึก
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <label style={LABEL_STYLE}>ชื่อ (English) *</label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer name (English)"
                  style={INPUT_STYLE}
                  autoFocus
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>ชื่อภาษาไทย</label>
                <input
                  value={nameTh}
                  onChange={(e) => setNameTh(e.target.value)}
                  placeholder="ชื่อลูกค้า"
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
                  placeholder="customer@example.com"
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
                style={{
                  ...INPUT_STYLE,
                  resize: "vertical",
                  lineHeight: 1.5,
                  padding: "8px 10px",
                }}
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
              marginBottom: 20,
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
                  {parseInt(paymentTermsDays, 10) === 0 ? "= COD (Cash on Delivery)" : `= Net ${paymentTermsDays} days`}
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push("/ar/customers")}
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
              disabled={submitting || !name.trim()}
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
                cursor: submitting || !name.trim() ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                opacity: !name.trim() ? 0.5 : 1,
              }}
            >
              {submitting && <Loader2 size={12} className="animate-spin" />}
              {submitting ? "Saving..." : "Create Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Pencil, Trash2, Loader2, X, Check, ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import Decimal from "decimal.js";
import { ApiError } from "@/lib/api-client";

const API_BASE = "";

interface VendorDetail {
  id: string;
  code: string;
  name: string;
  name_th: string | null;
  vendor_type: "INDIVIDUAL" | "JURISTIC";
  tax_id: string | null;
  branch_office: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  default_ap_account_code: string;
  default_withholding_rates: Record<string, string>;
  is_active: boolean;
  updated_at: string;
  created_at: string;
  open_bills: { count: number; outstanding_balance: string };
}

async function apiReq<T>(path: string, init: RequestInit & { extraHeaders?: Record<string, string> } = {}): Promise<T> {
  const { extraHeaders, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
  if (res.status === 204) return undefined as T;
  let body: { success: boolean; data?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("PARSE_ERROR", "Failed to parse response", res.status);
  }
  if (!body.success) {
    throw new ApiError(body.error?.code ?? "UNKNOWN", body.error?.message ?? "Unknown error", res.status);
  }
  return body.data as T;
}

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
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
  marginBottom: 3,
};

const FIELD_VALUE: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
  padding: "6px 0",
};

const WHT_CATEGORIES = [
  { key: "services", label: "บริการ" },
  { key: "rent", label: "ค่าเช่า" },
  { key: "goods", label: "ค่าสินค้า" },
  { key: "advertising", label: "ค่าโฆษณา" },
  { key: "interest", label: "ดอกเบี้ย" },
  { key: "professional", label: "วิชาชีพ" },
  { key: "royalties", label: "ค่าลิขสิทธิ์" },
  { key: "transportation", label: "ขนส่ง" },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div style={LABEL_STYLE}>{children}</div>;
}

function FieldValue({ value, mono }: { value: string | null | number; mono?: boolean }) {
  const empty = value === null || value === "" || value === undefined;
  return (
    <div
      style={{
        ...FIELD_VALUE,
        fontFamily: mono ? "var(--font-mono)" : "inherit",
        color: empty ? "var(--text-dim)" : "var(--text-primary)",
        fontSize: mono ? 12 : 13,
      }}
    >
      {empty ? "—" : String(value)}
    </div>
  );
}

function VendorTypeBadge({ type }: { type: "INDIVIDUAL" | "JURISTIC" }) {
  const isIndividual = type === "INDIVIDUAL";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 10,
        fontWeight: 500,
        marginTop: 4,
        background: isIndividual ? "rgba(120,160,220,0.15)" : "rgba(180,140,100,0.15)",
        color: isIndividual ? "#78a0dc" : "var(--accent)",
      }}
    >
      {isIndividual ? "บุคคล (Individual)" : "นิติบุคคล (Juristic)"}
    </span>
  );
}

export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [whtOpen, setWhtOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<VendorDetail & { whtRates: Record<string, string> }>>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchVendor = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiReq<VendorDetail>(`/api/v1/vendors/${id}`);
      setVendor(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load vendor");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchVendor();
  }, [fetchVendor]);

  function startEdit() {
    if (!vendor) return;
    setEditForm({
      name: vendor.name,
      name_th: vendor.name_th ?? "",
      vendor_type: vendor.vendor_type,
      tax_id: vendor.tax_id ?? "",
      branch_office: vendor.branch_office,
      phone: vendor.phone ?? "",
      email: vendor.email ?? "",
      address: vendor.address ?? "",
      payment_terms_days: vendor.payment_terms_days,
      is_active: vendor.is_active,
      whtRates: { ...vendor.default_withholding_rates },
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    if (!vendor) return;
    setSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {};
      if (editForm.name !== undefined) body.name = editForm.name;
      if (editForm.name_th !== undefined) body.name_th = editForm.name_th || null;
      if (editForm.vendor_type !== undefined) body.vendor_type = editForm.vendor_type;
      if (editForm.tax_id !== undefined) body.tax_id = editForm.tax_id || null;
      if (editForm.branch_office !== undefined) body.branch_office = editForm.branch_office;
      if (editForm.phone !== undefined) body.phone = editForm.phone || null;
      if (editForm.email !== undefined) body.email = editForm.email || null;
      if (editForm.address !== undefined) body.address = editForm.address || null;
      if (editForm.payment_terms_days !== undefined) body.payment_terms_days = editForm.payment_terms_days;
      if (editForm.is_active !== undefined) body.is_active = editForm.is_active;
      if (editForm.whtRates !== undefined) body.default_withholding_rates = editForm.whtRates;

      const updated = await apiReq<VendorDetail>(`/api/v1/vendors/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        extraHeaders: { "If-Match": vendor.updated_at },
      });
      setVendor(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update vendor");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiReq<void>(`/api/v1/vendors/${id}`, { method: "DELETE" });
      router.push("/ap/vendors");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete vendor");
      setDeleting(false);
      setConfirmDelete(false);
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

  if (error || !vendor) {
    return (
      <div>
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 13,
            color: "var(--error)",
            marginBottom: 12,
          }}
        >
          {error ?? "Vendor not found"}
        </div>
        <button
          onClick={() => router.push("/ap/vendors")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={12} />
          Back to Vendors
        </button>
      </div>
    );
  }

  const balanceD = new Decimal(vendor.open_bills.outstanding_balance);
  const balance = balanceD.toNumber();
  const hasBalance = balanceD.gt(0);

  return (
    <div style={{ maxWidth: 880 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div>
          <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <a href="/ap/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AP</a>
            {" / "}
            <a href="/ap/vendors" style={{ color: "inherit", textDecoration: "none" }}>Vendors</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{vendor.code}</span>
          </nav>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.2,
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            {vendor.name_th ?? vendor.name}
          </h1>
          {vendor.name_th && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{vendor.name}</div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginTop: 4 }}>
          {!editing && (
            <>
              <button
                onClick={startEdit}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Pencil size={12} />
                Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "1px solid var(--error)",
                  background: "transparent",
                  color: "var(--error)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
          {editing && (
            <>
              <button
                onClick={cancelEdit}
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  fontSize: 12,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  opacity: saving ? 0.5 : 1,
                }}
              >
                <X size={12} />
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--accent)",
                  color: "#fff",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {editError && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
            marginBottom: 14,
          }}
        >
          {editError}
        </div>
      )}

      {deleteError && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
            marginBottom: 14,
          }}
        >
          {deleteError}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Left: profile */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Basic info card */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              ข้อมูลพื้นฐาน · Profile
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <FieldLabel>รหัสเจ้าหนี้</FieldLabel>
                <div style={{ ...FIELD_VALUE, fontFamily: "var(--font-mono)", fontSize: 12 }}>{vendor.code}</div>
              </div>
              <div>
                <FieldLabel>ประเภท / Status</FieldLabel>
                {editing ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                    {(["JURISTIC", "INDIVIDUAL"] as const).map((t) => (
                      <label
                        key={t}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="edit_vendor_type"
                          checked={(editForm.vendor_type ?? vendor.vendor_type) === t}
                          onChange={() => setEditForm((f) => ({ ...f, vendor_type: t }))}
                          style={{ accentColor: "var(--accent)", width: 12, height: 12 }}
                        />
                        {t === "JURISTIC" ? "นิติบุคคล" : "บุคคล"}
                      </label>
                    ))}
                  </div>
                ) : (
                  <VendorTypeBadge type={vendor.vendor_type} />
                )}
              </div>

              <div>
                <FieldLabel>ชื่อ (English)</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    style={INPUT_STYLE}
                  />
                ) : (
                  <FieldValue value={vendor.name} />
                )}
              </div>
              <div>
                <FieldLabel>ชื่อภาษาไทย</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.name_th ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name_th: e.target.value }))}
                    placeholder="ชื่อเจ้าหนี้"
                    style={INPUT_STYLE}
                  />
                ) : (
                  <FieldValue value={vendor.name_th} />
                )}
              </div>

              <div>
                <FieldLabel>เลขผู้เสียภาษี (Tax ID)</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.tax_id ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, tax_id: e.target.value }))}
                    style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
                    placeholder="13 หลัก"
                    maxLength={13}
                  />
                ) : (
                  <FieldValue value={vendor.tax_id} mono />
                )}
              </div>
              <div>
                <FieldLabel>สาขา</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.branch_office ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, branch_office: e.target.value }))}
                    style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
                    maxLength={5}
                  />
                ) : (
                  <FieldValue
                    value={vendor.branch_office === "00000" ? "00000 (สำนักงานใหญ่)" : vendor.branch_office}
                    mono
                  />
                )}
              </div>

              <div>
                <FieldLabel>Status</FieldLabel>
                {editing ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", paddingTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={editForm.is_active ?? vendor.is_active}
                      onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
                      style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
                    />
                    Active
                  </label>
                ) : (
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 9999,
                      fontSize: 10,
                      fontWeight: 500,
                      marginTop: 4,
                      background: vendor.is_active ? "rgba(108,178,120,0.15)" : "rgba(120,120,120,0.12)",
                      color: vendor.is_active ? "#6CB278" : "var(--text-dim)",
                    }}
                  >
                    {vendor.is_active ? "Active" : "Inactive"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Contact card */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              ข้อมูลติดต่อ · Contact
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div>
                <FieldLabel>เบอร์โทรศัพท์</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.phone ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    style={INPUT_STYLE}
                    placeholder="0xx-xxx-xxxx"
                  />
                ) : (
                  <FieldValue value={vendor.phone} />
                )}
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                {editing ? (
                  <input
                    type="email"
                    value={editForm.email ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    style={INPUT_STYLE}
                  />
                ) : (
                  <FieldValue value={vendor.email} />
                )}
              </div>
            </div>

            <div>
              <FieldLabel>ที่อยู่</FieldLabel>
              {editing ? (
                <textarea
                  value={editForm.address ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  rows={3}
                  style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.5, padding: "7px 10px" }}
                />
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: vendor.address ? "var(--text-primary)" : "var(--text-dim)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {vendor.address ?? "—"}
                </div>
              )}
            </div>
          </div>

          {/* WHT rates card (collapsible) */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
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
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-muted)",
                }}
              >
                อัตราหัก ณ ที่จ่าย · Default WHT Rates
              </span>
            </button>

            {whtOpen && (
              <div style={{ padding: "0 20px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {WHT_CATEGORIES.map(({ key, label }) => {
                    const rate = editing
                      ? (editForm.whtRates ?? vendor.default_withholding_rates)[key] ?? "0"
                      : (vendor.default_withholding_rates[key] ?? "0");
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", flex: 1 }}>{label}</span>
                        {editing ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.5}
                              value={rate}
                              onChange={(e) =>
                                setEditForm((f) => ({
                                  ...f,
                                  whtRates: { ...(f.whtRates ?? vendor.default_withholding_rates), [key]: e.target.value },
                                }))
                              }
                              style={{
                                width: 56,
                                padding: "3px 6px",
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
                        ) : (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: rate !== "0" ? "var(--text-primary)" : "var(--text-dim)" }}>
                            {rate}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Open bills section */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                บิลที่ค้างชำระ · Open Bills
              </div>
              <a
                href={`/ap/bills?vendor_id=${vendor.id}`}
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
              >
                View all →
              </a>
            </div>
            {vendor.open_bills.count === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>ไม่มีบิลที่ค้างชำระ</div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>
                  {vendor.open_bills.count}
                </span>
                {" "}รายการ ·{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: hasBalance ? "var(--error)" : "var(--text-primary)" }}>
                  {new Decimal(vendor.open_bills.outstanding_balance).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {" "}บาท
              </div>
            )}
          </div>

          {/* Payments section */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                ประวัติการชำระ · Payments
              </div>
              <a
                href={`/ap/payments?vendor_id=${vendor.id}`}
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
              >
                View all →
              </a>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
              ดูประวัติการชำระได้ที่ หน้า Payments
            </div>
          </div>

          {/* WHT certs section */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
                paddingBottom: 6,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
                ใบรับรองหัก ณ ที่จ่าย · WHT Certs
              </div>
              <a
                href={`/tax/wht-certs?vendor_id=${vendor.id}`}
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
              >
                View all →
              </a>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
              ดูใบรับรองได้ที่ หน้า WHT Certs
            </div>
          </div>
        </div>

        {/* Right: summary sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* AP Balance card */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: `1px solid ${hasBalance ? "var(--error)" : "var(--border)"}`,
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              ยอดเจ้าหนี้คงค้าง · AP Balance
            </div>
            <div
              style={{
                fontSize: 28,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: hasBalance ? "var(--error)" : "var(--text-primary)",
                lineHeight: 1,
                marginBottom: 4,
              }}
            >
              {new Decimal(vendor.open_bills.outstanding_balance).toNumber().toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>บาท (THB)</div>
            {vendor.open_bills.count > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
                {vendor.open_bills.count} รายการค้างชำระ
              </div>
            )}
          </div>

          {/* Payment terms */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              เงื่อนไขชำระ · Terms
            </div>
            {editing ? (
              <input
                type="number"
                min={0}
                max={365}
                value={editForm.payment_terms_days ?? vendor.payment_terms_days}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, payment_terms_days: parseInt(e.target.value, 10) || 0 }))
                }
                style={{ ...INPUT_STYLE, textAlign: "right", fontFamily: "var(--font-mono)" }}
              />
            ) : (
              <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>
                {vendor.payment_terms_days === 0 ? "COD" : `Net ${vendor.payment_terms_days}d`}
              </div>
            )}
          </div>

          {/* Meta info */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "14px 20px",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--text-dim)" }}>AP Account: </span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{vendor.default_ap_account_code}</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--text-dim)" }}>Created: </span>
              {new Date(vendor.created_at).toLocaleDateString("th-TH", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>Updated: </span>
              {new Date(vendor.updated_at).toLocaleDateString("th-TH", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "14px 20px",
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                marginBottom: 10,
              }}
            >
              Quick Actions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <a
                href={`/ap/bills/new?vendor_id=${vendor.id}`}
                style={{
                  display: "block",
                  padding: "7px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                + New Bill
              </a>
              <a
                href={`/ap/payments/new?vendor_id=${vendor.id}`}
                style={{
                  display: "block",
                  padding: "7px 12px",
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                + New Payment
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--modal-bg)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDelete(false);
          }}
        >
          <div
            style={{
              width: 400,
              maxWidth: "90vw",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                Delete Vendor?
              </h2>
            </div>
            <div style={{ padding: "14px 20px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                เจ้าหนี้{" "}
                <strong style={{ color: "var(--text-primary)" }}>{vendor.name_th ?? vendor.name}</strong>{" "}
                จะถูกลบออก (soft delete) การดำเนินการนี้จะถูกบล็อคหากมีบิลที่ยังค้างอยู่
              </p>
              {deleteError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    background: "rgba(184,92,80,0.1)",
                    border: "1px solid var(--error)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--error)",
                  }}
                >
                  {deleteError}
                </div>
              )}
            </div>
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
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={deleting}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 4,
                  border: "none",
                  background: "var(--error)",
                  color: "#fff",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting && <Loader2 size={12} className="animate-spin" />}
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

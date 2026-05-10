"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { Pencil, Trash2, Loader2, X, Check, ArrowLeft } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";
import { CustomerStatement } from "@/components/ar/customer-statement";

const API_BASE = "";

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  name_th: string | null;
  tax_id: string | null;
  branch_office: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  payment_terms_days: number;
  default_ar_account_code: string;
  is_active: boolean;
  updated_at: string;
  created_at: string;
  open_invoices: { count: number; outstanding_balance: string };
  statement_url: string;
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
  try { body = await res.json(); } catch {
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

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CustomerDetail>>({});
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchCustomer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiReq<CustomerDetail>(`/api/v1/customers/${id}`);
      setCustomer(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCustomer(); }, [fetchCustomer]);

  function startEdit() {
    if (!customer) return;
    setEditForm({
      name: customer.name,
      name_th: customer.name_th ?? "",
      tax_id: customer.tax_id ?? "",
      branch_office: customer.branch_office,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      payment_terms_days: customer.payment_terms_days,
      is_active: customer.is_active,
    });
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    if (!customer) return;
    setSaving(true);
    setEditError(null);
    try {
      const body: Record<string, unknown> = {};
      if (editForm.name !== undefined) body.name = editForm.name;
      if (editForm.name_th !== undefined) body.name_th = editForm.name_th || null;
      if (editForm.tax_id !== undefined) body.tax_id = editForm.tax_id || null;
      if (editForm.branch_office !== undefined) body.branch_office = editForm.branch_office;
      if (editForm.phone !== undefined) body.phone = editForm.phone || null;
      if (editForm.email !== undefined) body.email = editForm.email || null;
      if (editForm.address !== undefined) body.address = editForm.address || null;
      if (editForm.payment_terms_days !== undefined) body.payment_terms_days = editForm.payment_terms_days;
      if (editForm.is_active !== undefined) body.is_active = editForm.is_active;

      const updated = await apiReq<CustomerDetail>(`/api/v1/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        extraHeaders: { "If-Match": customer.updated_at },
      });
      setCustomer(updated);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Failed to update customer");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiReq<void>(`/api/v1/customers/${id}`, { method: "DELETE" });
      router.push("/ar/customers");
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Failed to delete customer");
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

  if (error || !customer) {
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
          {error ?? "Customer not found"}
        </div>
        <button
          onClick={() => router.push("/ar/customers")}
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
          Back to Customers
        </button>
      </div>
    );
  }

  const balance = new Decimal(customer.open_invoices.outstanding_balance);
  const hasBalance = balance.gt(0);

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
            <a href="/ar/dashboard" style={{ color: "inherit", textDecoration: "none" }}>AR</a>
            {" / "}
            <a href="/ar/customers" style={{ color: "inherit", textDecoration: "none" }}>Customers</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{customer.code}</span>
          </nav>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            {customer.name_th ?? customer.name}
          </h1>
          {customer.name_th && (
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>{customer.name}</div>
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
                <FieldLabel>รหัสลูกค้า</FieldLabel>
                <div style={{ ...FIELD_VALUE, fontFamily: "var(--font-mono)", fontSize: 12 }}>{customer.code}</div>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                {editing ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: "pointer", paddingTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={editForm.is_active ?? customer.is_active}
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
                      background: customer.is_active ? "rgba(108,178,120,0.15)" : "rgba(120,120,120,0.12)",
                      color: customer.is_active ? "#6CB278" : "var(--text-dim)",
                    }}
                  >
                    {customer.is_active ? "Active" : "Inactive"}
                  </span>
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
                  <FieldValue value={customer.name} />
                )}
              </div>
              <div>
                <FieldLabel>ชื่อภาษาไทย</FieldLabel>
                {editing ? (
                  <input
                    value={editForm.name_th ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, name_th: e.target.value }))}
                    style={INPUT_STYLE}
                    placeholder="ชื่อลูกค้า"
                  />
                ) : (
                  <FieldValue value={customer.name_th} />
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
                  <FieldValue value={customer.tax_id} mono />
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
                    value={customer.branch_office === "00000" ? "00000 (สำนักงานใหญ่)" : customer.branch_office}
                    mono
                  />
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
                  <FieldValue value={customer.phone} />
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
                  <FieldValue value={customer.email} />
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
                    color: customer.address ? "var(--text-primary)" : "var(--text-dim)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {customer.address ?? "—"}
                </div>
              )}
            </div>
          </div>

          {/* Open invoices section */}
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
                ใบแจ้งหนี้ที่ค้างชำระ · Open Invoices
              </div>
              <a
                href={`/ar/invoices?customer_id=${customer.id}`}
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
              >
                View all →
              </a>
            </div>

            {customer.open_invoices.count === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
                ไม่มีใบแจ้งหนี้ที่ค้างชำระ
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>
                  {customer.open_invoices.count}
                </span>
                {" "}รายการ ·{" "}
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: hasBalance ? "var(--error)" : "var(--text-primary)" }}>
                  {new Decimal(customer.open_invoices.outstanding_balance).toNumber().toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {" "}บาท
              </div>
            )}
          </div>

          {/* Receipts section */}
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
                ประวัติการรับชำระ · Receipts
              </div>
              <a
                href={`/ar/receipts?customer_id=${customer.id}`}
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}
              >
                View all →
              </a>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
              ดูประวัติการรับชำระได้ที่ หน้า Receipts
            </div>
          </div>
        </div>

        {/* Right: summary sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* AR Balance card */}
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
              ยอดลูกหนี้คงค้าง · AR Balance
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
              {new Decimal(customer.open_invoices.outstanding_balance).toNumber().toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>บาท (THB)</div>
            {customer.open_invoices.count > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
                {customer.open_invoices.count} รายการค้างชำระ
              </div>
            )}
          </div>

          {/* Payment terms card */}
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
                value={editForm.payment_terms_days ?? customer.payment_terms_days}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, payment_terms_days: parseInt(e.target.value, 10) || 0 }))
                }
                style={{ ...INPUT_STYLE, textAlign: "right", fontFamily: "var(--font-mono)" }}
              />
            ) : (
              <div style={{ fontSize: 20, fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-primary)" }}>
                {customer.payment_terms_days === 0
                  ? "COD"
                  : `Net ${customer.payment_terms_days}d`}
              </div>
            )}
          </div>

          {/* Statement anchor — scrolls to the statement below */}
          <div
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "14px 20px",
            }}
          >
            <a
              href="#customer-statement"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>↓ Customer Statement</span>
            </a>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4 }}>รายการเดินบัญชีลูกค้า</div>
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
              <span style={{ color: "var(--text-dim)" }}>AR Account: </span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{customer.default_ar_account_code}</span>
            </div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ color: "var(--text-dim)" }}>Created: </span>
              {new Date(customer.created_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
            </div>
            <div>
              <span style={{ color: "var(--text-dim)" }}>Updated: </span>
              {new Date(customer.updated_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Statement */}
      <div id="customer-statement" style={{ marginTop: 24 }}>
        <CustomerStatement customerId={customer.id} customerName={customer.name_th ?? customer.name} />
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
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
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
                Delete Customer?
              </h2>
            </div>
            <div style={{ padding: "14px 20px" }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                ลูกค้า <strong style={{ color: "var(--text-primary)" }}>{customer.name_th ?? customer.name}</strong> จะถูกลบออก (soft delete)
                การดำเนินการนี้จะถูกบล็อคหากมีใบแจ้งหนี้ที่ยังค้างอยู่
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
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
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

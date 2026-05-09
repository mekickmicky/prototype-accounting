"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useUser } from "@/lib/use-user";
import { PageHeader } from "@/components/ui/page-header";
import { AccountTree, type AccountRow } from "@/components/gl/account-tree";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function patchAccount(
  code: string,
  patch: { name_th?: string; is_active?: boolean }
): Promise<AccountRow> {
  const res = await fetch(`${API_BASE}/api/v1/accounts/${encodeURIComponent(code)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = await res.json();
  if (!body.success) {
    throw new Error(body.error?.message ?? "Update failed");
  }
  return body.data as AccountRow;
}

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET:     "สินทรัพย์ (Asset)",
  LIABILITY: "หนี้สิน (Liability)",
  EQUITY:    "ส่วนของผู้ถือหุ้น (Equity)",
  REVENUE:   "รายได้ (Revenue)",
  EXPENSE:   "ค่าใช้จ่าย (Expense)",
};

interface NewAccountForm {
  code: string;
  name_en: string;
  name_th: string;
  type: AccountType;
  parent_code: string;
  is_postable: boolean;
}

const EMPTY_FORM: NewAccountForm = {
  code: "",
  name_en: "",
  name_th: "",
  type: "ASSET",
  parent_code: "",
  is_postable: true,
};

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 12,
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

export default function AccountsPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<NewAccountForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiClient.get<AccountRow[]>("/api/v1/accounts");
      setAccounts(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleUpdate = useCallback(
    async (code: string, patch: { name_th?: string; is_active?: boolean }) => {
      setUpdateError(null);
      try {
        const updated = await patchAccount(code, patch);
        setAccounts((prev) =>
          prev.map((a) => (a.code === code ? { ...a, ...updated } : a))
        );
      } catch (err) {
        // Surface error so the inline edit row stays open (not silently swallowed)
        setUpdateError(err instanceof Error ? err.message : "Update failed");
        throw err;
      }
    },
    []
  );

  const handleNavigate = useCallback(
    (code: string) => {
      router.push(`/gl/accounts/${code}`);
    },
    [router]
  );

  const openModal = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setFieldErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormError(null);
  };

  const handleSubmitNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side field-level validation
    const newFieldErrors: Record<string, string> = {};
    if (!form.code.trim()) {
      newFieldErrors.code = "Account code is required";
    } else if (!/^\d{4,5}$/.test(form.code.trim())) {
      newFieldErrors.code = "Code must be 4–5 digits";
    }
    if (!form.name_th.trim()) newFieldErrors.name_th = "ชื่อบัญชี (Thai) จำเป็น";
    if (!form.name_en.trim()) newFieldErrors.name_en = "Account name is required";
    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        code: form.code,
        name_en: form.name_en,
        name_th: form.name_th,
        type: form.type,
        is_postable: form.is_postable,
      };
      if (form.parent_code.trim()) body.parent_code = form.parent_code.trim();

      const created = await apiClient.post<AccountRow>("/api/v1/accounts", body);
      setAccounts((prev) =>
        [...prev, { ...created, current_balance: "0.00" }].sort((a, b) =>
          a.code.localeCompare(b.code)
        )
      );
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setSubmitting(false);
    }
  };

  if (userLoading || loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          gap: 8,
        }}
      >
        <Loader2 size={16} className="animate-spin text-[--text-dim]" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "rgba(184,92,80,0.1)",
          border: "1px solid var(--error)",
          borderRadius: 6,
          fontSize: 13,
          color: "var(--error)",
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="ผังบัญชี"
        description={`Chart of Accounts · ${accounts.length} accounts`}
        breadcrumbs={[{ label: "GL" }, { label: "Accounts" }]}
        actions={
          isAdmin ? (
            <button
              onClick={openModal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                borderRadius: 4,
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "opacity 0.15s ease",
              }}
            >
              <Plus size={13} />
              New Account
            </button>
          ) : undefined
        }
      />

      {updateError && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 4,
            fontSize: 12,
            color: "var(--error)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{updateError}</span>
          <button
            onClick={() => setUpdateError(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--error)", fontSize: 11, padding: 0 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <AccountTree
          accounts={accounts}
          isAdmin={isAdmin}
          onUpdate={handleUpdate}
          onNavigate={handleNavigate}
        />
      </div>

      {showModal && (
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
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: "95vw",
              borderRadius: 6,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                New Account
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-dim)",
                  lineHeight: 1,
                  padding: 2,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmitNew}>
              <div
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {formError && (
                  <div
                    style={{
                      padding: "8px 12px",
                      background: "rgba(184,92,80,0.1)",
                      border: "1px solid var(--error)",
                      borderRadius: 4,
                      fontSize: 12,
                      color: "var(--error)",
                    }}
                  >
                    {formError}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={LABEL_STYLE}>Account Code *</label>
                    <input
                      value={form.code}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, code: e.target.value }));
                        setFieldErrors((fe) => { const n = { ...fe }; delete n.code; return n; });
                      }}
                      placeholder="e.g. 11010"
                      style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)", borderColor: fieldErrors.code ? "var(--error)" : undefined }}
                    />
                    {fieldErrors.code && (
                      <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--error)" }}>{fieldErrors.code}</p>
                    )}
                  </div>
                  <div>
                    <label style={LABEL_STYLE}>Type *</label>
                    <select
                      required
                      value={form.type}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, type: e.target.value as AccountType }))
                      }
                      style={INPUT_STYLE}
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={LABEL_STYLE}>ชื่อบัญชี (Thai) *</label>
                  <input
                    value={form.name_th}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name_th: e.target.value }));
                      setFieldErrors((fe) => { const n = { ...fe }; delete n.name_th; return n; });
                    }}
                    placeholder="เงินสด"
                    style={{ ...INPUT_STYLE, borderColor: fieldErrors.name_th ? "var(--error)" : undefined }}
                  />
                  {fieldErrors.name_th && (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--error)" }}>{fieldErrors.name_th}</p>
                  )}
                </div>

                <div>
                  <label style={LABEL_STYLE}>Account Name (English) *</label>
                  <input
                    value={form.name_en}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, name_en: e.target.value }));
                      setFieldErrors((fe) => { const n = { ...fe }; delete n.name_en; return n; });
                    }}
                    placeholder="Cash"
                    style={{ ...INPUT_STYLE, borderColor: fieldErrors.name_en ? "var(--error)" : undefined }}
                  />
                  {fieldErrors.name_en && (
                    <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--error)" }}>{fieldErrors.name_en}</p>
                  )}
                </div>

                <div>
                  <label style={LABEL_STYLE}>Parent Account Code</label>
                  <input
                    value={form.parent_code}
                    onChange={(e) => setForm((f) => ({ ...f, parent_code: e.target.value }))}
                    placeholder="e.g. 11000 (leave blank for root)"
                    style={{ ...INPUT_STYLE, fontFamily: "var(--font-mono)" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    id="new-is-postable"
                    checked={form.is_postable}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_postable: e.target.checked }))
                    }
                    style={{ width: 14, height: 14, accentColor: "var(--accent)" }}
                  />
                  <label
                    htmlFor="new-is-postable"
                    style={{ fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}
                  >
                    Postable (can be used in journal entry lines)
                  </label>
                </div>
              </div>

              {/* Footer */}
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
                  type="button"
                  onClick={closeModal}
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
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 4,
                    border: "none",
                    background: submitting ? "var(--surface)" : "var(--accent)",
                    color: "#fff",
                    cursor: submitting ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

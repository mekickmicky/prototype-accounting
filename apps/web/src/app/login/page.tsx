"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogIn } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface DevUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ACCOUNTANT" | "VIEWER";
}

const ROLE_BADGE: Record<DevUser["role"], { label: string; className: string }> = {
  ADMIN: {
    label: "Admin",
    className: "text-[--accent] border-[--accent] bg-[rgba(200,150,122,0.1)]",
  },
  ACCOUNTANT: {
    label: "Accountant",
    className:
      "text-[--status-posted] border-[--status-posted] bg-[rgba(107,142,127,0.1)]",
  },
  VIEWER: {
    label: "Viewer",
    className:
      "text-[--status-void] border-[--status-void] bg-[rgba(107,96,104,0.1)]",
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<DevUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<{ users: DevUser[] }>("/api/v1/auth/users")
      .then(({ users }) => {
        setUsers(users);
        const first = users.at(0);
        if (first) setSelectedId(first.id);
      })
      .catch(() => {
        setError("ไม่สามารถเชื่อมต่อ API ได้ กรุณาตรวจสอบว่า API server ทำงานอยู่");
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  async function handleLogin() {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.post("/api/v1/auth/login", { user_id: selectedId });
      router.replace("/dashboard");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      }
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-base)",
        padding: "var(--s-5)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: "6px",
          padding: "var(--s-6)",
          boxShadow: "var(--shadow)",
        }}
      >
        {/* Branding */}
        <div style={{ marginBottom: "var(--s-6)" }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "28px",
              fontWeight: 400,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            WIND Accounting
          </h1>
          <p
            style={{
              marginTop: "6px",
              fontSize: "11px",
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
            }}
          >
            ระบบบัญชีคลินิก
          </p>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
          {/* User select */}
          <div>
            <label
              htmlFor="user-select"
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--text-muted)",
                marginBottom: "6px",
              }}
            >
              เลือกผู้ใช้งาน
            </label>

            {loadingUsers ? (
              <div
                style={{
                  height: "36px",
                  background: "var(--surface)",
                  borderRadius: "4px",
                  border: "1px solid var(--border)",
                }}
              />
            ) : (
              <div style={{ position: "relative" }}>
                <select
                  id="user-select"
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  disabled={users.length === 0}
                  style={{
                    width: "100%",
                    padding: "8px 32px 8px 12px",
                    fontSize: "13px",
                    borderRadius: "4px",
                    border: "1px solid var(--border-strong)",
                    background: "var(--surface)",
                    color: "var(--text-primary)",
                    fontFamily: "inherit",
                    cursor: users.length === 0 ? "not-allowed" : "pointer",
                    appearance: "none",
                    WebkitAppearance: "none",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(200, 150, 122, 0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border-strong)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.email}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  strokeWidth={1.5}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: "var(--text-muted)",
                  }}
                />
              </div>
            )}
          </div>

          {/* Role badge for selected user */}
          {selectedUser && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--s-2)",
                padding: "6px 10px",
                background: "var(--surface)",
                borderRadius: "4px",
                border: "1px solid var(--border)",
              }}
            >
              <span
                style={{ fontSize: "12px", color: "var(--text-muted)" }}
              >
                สิทธิ์การใช้งาน:
              </span>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5",
                  "text-[10px] font-semibold uppercase tracking-[0.05em]",
                  "rounded-[3px] border",
                  ROLE_BADGE[selectedUser.role].className,
                )}
              >
                {ROLE_BADGE[selectedUser.role].label}
              </span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <p
              style={{
                fontSize: "12px",
                color: "var(--error)",
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          {/* Submit button */}
          <button
            onClick={handleLogin}
            disabled={!selectedId || submitting || loadingUsers}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "8px 14px",
              fontSize: "13px",
              fontWeight: 500,
              borderRadius: "4px",
              border: "none",
              background:
                !selectedId || submitting || loadingUsers
                  ? "var(--surface)"
                  : "var(--accent)",
              color:
                !selectedId || submitting || loadingUsers
                  ? "var(--text-muted)"
                  : "#fff",
              cursor:
                !selectedId || submitting || loadingUsers
                  ? "not-allowed"
                  : "pointer",
              transition: "background var(--transition-fast)",
              fontFamily: "inherit",
            }}
          >
            <LogIn size={14} strokeWidth={1.5} />
            {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </div>

        {/* Dev note */}
        <p
          style={{
            marginTop: "var(--s-5)",
            fontSize: "10px",
            color: "var(--text-dim)",
            textAlign: "center",
          }}
        >
          Prototype — no password required
        </p>
      </div>
    </div>
  );
}

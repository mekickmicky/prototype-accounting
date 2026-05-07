"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, Trash2 } from "lucide-react";
import { formatTHB, D } from "@wind-acc/shared";
import { ApiError } from "@/lib/api-client";
import { useUser } from "@/lib/use-user";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { JEForm, type JEFormValues } from "@/components/gl/je-form";
import type { AccountOption } from "@/components/ui/account-picker";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ──────────────────────────────────────────────────────────────────────

interface JournalLine {
  id: string;
  line_no: number;
  account_code: string;
  description: string | null;
  branch_code: string;
  debit: string;
  credit: string;
  dim_dept: string | null;
  dim_project: string | null;
}

interface JournalEntry {
  id: string;
  je_no: string;
  entry_date: string;
  period_code: string;
  branch_code: string;
  description: string;
  source_type: string;
  source_id: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
  posted_at: string | null;
  posted_by_id: string | null;
  voided_at: string | null;
  voided_by_id: string | null;
  void_reason: string | null;
  reversal_of_id: string | null;
  total_debit: string;
  total_credit: string;
  created_at: string;
  updated_at: string;
  lines: JournalLine[];
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function apiReq<T>(
  path: string,
  init: RequestInit & { extraHeaders?: Record<string, string> } = {}
): Promise<T> {
  const { extraHeaders, ...rest } = init;
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });

  if (res.status === 204) return undefined as T;

  let body: { success: boolean; data?: T; error?: { code: string; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new ApiError("PARSE_ERROR", "Failed to parse server response", res.status);
  }

  if (!body.success) {
    throw new ApiError(
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? "Unknown error",
      res.status
    );
  }

  return body.data as T;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function extractDateStr(iso: string): string {
  // Prisma @db.Date serializes as "2026-05-08T00:00:00.000Z" — extract date part
  return iso.substring(0, 10);
}

function formatDateTimeBangkok(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── VoidDialog ─────────────────────────────────────────────────────────────────

interface VoidDialogProps {
  open: boolean;
  loading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function VoidDialog({ open, loading, onConfirm, onCancel }: VoidDialogProps) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmed = reason.trim();
  const valid = trimmed.length >= 3;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{
          width: 480,
          maxWidth: "95vw",
          borderRadius: 6,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-base)",
          boxShadow: "var(--shadow)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="void-title"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <AlertCircle size={16} style={{ color: "var(--error)", flexShrink: 0 }} />
          <h2
            id="void-title"
            style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
          >
            ยืนยันการยกเลิก / Void Journal Entry
          </h2>
        </div>

        <div style={{ padding: "16px 24px" }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
            การยกเลิกจะสร้าง JE คู่กลับ (reversing entry) โดยอัตโนมัติ
            และไม่สามารถย้อนกลับได้โดยตรง
          </p>
          <label
            htmlFor="void-reason"
            style={{
              display: "block",
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
              marginBottom: 6,
            }}
          >
            เหตุผล / Reason *
          </label>
          <textarea
            ref={inputRef}
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={loading}
            rows={3}
            placeholder="Minimum 3 characters required"
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          {reason.length > 0 && !valid && (
            <p style={{ fontSize: 11, color: "var(--error)", marginTop: 4 }}>
              กรุณากรอกเหตุผลอย่างน้อย 3 ตัวอักษร
            </p>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 24px",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={S.btnSecondary}
          >
            ยกเลิก / Cancel
          </button>
          <button
            type="button"
            onClick={() => valid && onConfirm(trimmed)}
            disabled={!valid || loading}
            style={{
              ...S.btnDanger,
              opacity: !valid || loading ? 0.5 : 1,
              cursor: !valid || loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Loader2 size={13} />
                กำลังดำเนินการ...
              </span>
            ) : (
              "ยืนยันการยกเลิก / Confirm Void"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ReadOnlyJEView ─────────────────────────────────────────────────────────────

function ReadOnlyJEView({ je }: { je: JournalEntry }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header info */}
      <div style={S.panel}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px 24px",
          }}
        >
          <InfoField label="JE No">{je.je_no}</InfoField>
          <InfoField label="Entry Date">{extractDateStr(je.entry_date)}</InfoField>
          <InfoField label="Period">{je.period_code}</InfoField>
          <InfoField label="Branch">{je.branch_code}</InfoField>
          <InfoField label="Source Type">{je.source_type}</InfoField>
          <InfoField label="Status">
            <StatusBadge status={je.status} />
          </InfoField>
          <div style={{ gridColumn: "1 / -1" }}>
            <InfoField label="Description">{je.description}</InfoField>
          </div>
          {je.source_id && (
            <InfoField label="Source Ref">{je.source_id}</InfoField>
          )}
        </div>
      </div>

      {/* Lines table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-elevated)" }}>
              <ROTh w={36} center>#</ROTh>
              <ROTh pct={28}>บัญชี / Account</ROTh>
              <ROTh>คำอธิบาย</ROTh>
              <ROTh w={100}>สาขา</ROTh>
              <ROTh w={150} right>เดบิต / Debit</ROTh>
              <ROTh w={150} right>เครดิต / Credit</ROTh>
            </tr>
          </thead>
          <tbody>
            {je.lines.map((line, idx) => (
              <tr
                key={line.id}
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <td style={S.tdCenter}>{idx + 1}</td>
                <td style={S.td}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
                    {line.account_code}
                  </span>
                </td>
                <td style={{ ...S.td, fontSize: 12, color: "var(--text-muted)" }}>
                  {line.description ?? "—"}
                </td>
                <td style={S.td}>{line.branch_code}</td>
                <td style={{ ...S.td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {D(line.debit).isZero() ? (
                    <span style={{ color: "var(--text-dim)" }}>—</span>
                  ) : (
                    <span style={{ color: "var(--debit)" }}>{formatTHB(D(line.debit))}</span>
                  )}
                </td>
                <td style={{ ...S.td, textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {D(line.credit).isZero() ? (
                    <span style={{ color: "var(--text-dim)" }}>—</span>
                  ) : (
                    <span style={{ color: "var(--credit)" }}>{formatTHB(D(line.credit))}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals row */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            padding: "10px 12px",
            borderTop: "2px solid var(--border-strong)",
            gap: 40,
            fontSize: 13,
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)", marginRight: 12 }}>
              รวมเดบิต / Total Debit
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: "var(--debit)",
              }}
            >
              {formatTHB(D(je.total_debit))}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", marginRight: 12 }}>
              รวมเครดิต / Total Credit
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                color: "var(--credit)",
              }}
            >
              {formatTHB(D(je.total_credit))}
            </span>
          </div>
        </div>
      </div>

      {/* Meta info */}
      {(je.posted_at || je.voided_at) && (
        <div
          style={{
            display: "flex",
            gap: 24,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          {je.posted_at && (
            <span>Posted: {formatDateTimeBangkok(je.posted_at)}</span>
          )}
          {je.voided_at && (
            <span>Voided: {formatDateTimeBangkok(je.voided_at)}</span>
          )}
        </div>
      )}
    </div>
  );
}

function InfoField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{children}</div>
    </div>
  );
}

function ROTh({
  children,
  w,
  pct,
  right,
  center,
}: {
  children?: React.ReactNode;
  w?: number;
  pct?: number;
  right?: boolean;
  center?: boolean;
}) {
  return (
    <th
      style={{
        padding: "7px 12px",
        textAlign: center ? "center" : right ? "right" : "left",
        fontWeight: 500,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border)",
        whiteSpace: "nowrap",
        width: w ? `${w}px` : pct ? `${pct}%` : undefined,
      }}
    >
      {children}
    </th>
  );
}

// ── Banner components ──────────────────────────────────────────────────────────

function VoidedBanner({
  je,
  reversalJeId,
  reversalJeNo,
}: {
  je: JournalEntry;
  reversalJeId: string | null;
  reversalJeNo: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
        background: "rgba(107,96,104,0.08)",
        border: "1px solid var(--status-void)",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <AlertCircle size={14} style={{ color: "var(--status-void)", marginTop: 1, flexShrink: 0 }} />
        <div>
          <span style={{ color: "var(--status-void)", fontWeight: 600 }}>VOID</span>
          {je.voided_at && (
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
              โดยถูกยกเลิกเมื่อ {formatDateTimeBangkok(je.voided_at)}
            </span>
          )}
          {je.void_reason && (
            <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
              — {je.void_reason}
            </span>
          )}
        </div>
      </div>
      {reversalJeId && (
        <Link
          href={`/gl/journal-entries/${reversalJeId}`}
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          ดู JE คู่กลับ → {reversalJeNo ?? reversalJeId.substring(0, 8)}
        </Link>
      )}
    </div>
  );
}

function ReversalBanner({
  originalId,
  originalJeNo,
}: {
  originalId: string;
  originalJeNo: string | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 16px",
        background: "rgba(74,122,140,0.08)",
        border: "1px solid var(--status-paid)",
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--status-paid)", fontWeight: 500 }}>
        รายการนี้เป็น Reversing Entry สำหรับ{" "}
        {originalJeNo ?? `ID: ${originalId.substring(0, 8)}`}
      </span>
      <Link
        href={`/gl/journal-entries/${originalId}`}
        style={{
          fontSize: 12,
          color: "var(--accent)",
          textDecoration: "none",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        ดู JE ต้นฉบับ → {originalJeNo ?? "Original"}
      </Link>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function JournalEntryDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  const [je, setJe] = useState<JournalEntry | null>(null);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Reversal / void cross-link data
  const [reversalJeId, setReversalJeId] = useState<string | null>(null);
  const [reversalJeNo, setReversalJeNo] = useState<string | null>(null);
  const [originalJeNo, setOriginalJeNo] = useState<string | null>(null);

  // Mutation states
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);

  const fetchJE = useCallback(async () => {
    try {
      const data = await apiReq<JournalEntry>(`/api/v1/journal-entries/${id}`, { method: "GET" });
      setJe(data);
      return data;
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Failed to load journal entry");
      return null;
    }
  }, [id]);

  // Fetch original JE no for reversal banner
  const fetchOriginalJeNo = useCallback(async (originalId: string) => {
    try {
      const data = await apiReq<JournalEntry>(`/api/v1/journal-entries/${originalId}`, { method: "GET" });
      setOriginalJeNo(data.je_no);
    } catch {
      // Non-critical — link still works by ID
    }
  }, []);

  // Find reversal JE from a VOID JE by searching description
  const findReversalJe = useCallback(async (jeNo: string) => {
    try {
      const searchRes = await fetch(
        `${API_BASE}/api/v1/journal-entries?source_type=REVERSAL&q=${encodeURIComponent(`VOID of ${jeNo}`)}&page_size=5`,
        { credentials: "include" }
      );
      if (!searchRes.ok) return;
      const body = await searchRes.json();
      if (body.success && Array.isArray(body.data) && body.data.length > 0) {
        const found = body.data[0] as { id: string; je_no: string };
        setReversalJeId(found.id);
        setReversalJeNo(found.je_no);
      }
    } catch {
      // Non-critical — VOID banner shows without the link
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);

      const [jeData] = await Promise.all([
        fetchJE(),
        // Accounts always needed for DRAFT (deferred until we know status)
        apiReq<AccountOption[]>("/api/v1/accounts", { method: "GET" })
          .then((accts) => { if (!cancelled) setAccounts(accts); })
          .catch(() => {}),
      ]);

      if (!cancelled && jeData) {
        // Load cross-link data based on status
        if (jeData.status === "VOID" && jeData.je_no) {
          findReversalJe(jeData.je_no);
        }
        if (jeData.reversal_of_id) {
          fetchOriginalJeNo(jeData.reversal_of_id);
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [id, fetchJE, findReversalJe, fetchOriginalJeNo]);

  // ── DRAFT actions ────────────────────────────────────────────────────────────

  const handleSaveDraft = useCallback(
    async (values: JEFormValues) => {
      if (!je) return;
      setActionError(null);
      setSaving(true);
      try {
        const updated = await apiReq<JournalEntry>(
          `/api/v1/journal-entries/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(values),
            extraHeaders: { "If-Match": je.updated_at },
          }
        );
        setJe(updated);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Failed to save draft");
      } finally {
        setSaving(false);
      }
    },
    [je, id]
  );

  const handlePost = useCallback(
    async (values: JEFormValues) => {
      if (!je) return;
      setActionError(null);
      setPosting(true);
      try {
        // Persist current form values first
        const patched = await apiReq<JournalEntry>(
          `/api/v1/journal-entries/${id}`,
          {
            method: "PATCH",
            body: JSON.stringify(values),
            extraHeaders: { "If-Match": je.updated_at },
          }
        );
        setJe(patched);

        // Then post
        const posted = await apiReq<JournalEntry>(
          `/api/v1/journal-entries/${id}/post`,
          { method: "POST" }
        );
        setJe(posted);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Failed to post journal entry");
      } finally {
        setPosting(false);
      }
    },
    [je, id]
  );

  const handleDelete = useCallback(async () => {
    setShowDeleteDialog(false);
    setActionError(null);
    setDeleting(true);
    try {
      await apiReq<void>(`/api/v1/journal-entries/${id}`, { method: "DELETE" });
      router.push("/gl/journal-entries");
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Failed to delete draft");
      setDeleting(false);
    }
  }, [id, router]);

  // ── POSTED actions ───────────────────────────────────────────────────────────

  const handleVoid = useCallback(
    async (reason: string) => {
      setActionError(null);
      setVoiding(true);
      try {
        const result = await apiReq<{ original: JournalEntry; reversal: JournalEntry }>(
          `/api/v1/journal-entries/${id}/void`,
          {
            method: "POST",
            body: JSON.stringify({ reason }),
          }
        );
        setJe(result.original);
        setShowVoidDialog(false);
        // Update cross-link data with the new reversal JE
        setReversalJeId(result.reversal.id);
        setReversalJeNo(result.reversal.je_no);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.message : "Failed to void journal entry");
      } finally {
        setVoiding(false);
      }
    },
    [id]
  );

  // ── Render ───────────────────────────────────────────────────────────────────

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
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (loadError) {
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
        {loadError}
      </div>
    );
  }

  if (!je) return null;

  const canMutate = user?.role === "ADMIN" || user?.role === "ACCOUNTANT";
  const isReversal = je.reversal_of_id !== null;

  const breadcrumbs = [
    { label: "GL", href: "/gl/dashboard" },
    { label: "Journal Entries", href: "/gl/journal-entries" },
    { label: je.je_no || je.id.substring(0, 8) },
  ];

  return (
    <div>
      {/* ── DRAFT ── */}
      {je.status === "DRAFT" && (
        <>
          <PageHeader
            title="แก้ไขรายการบันทึก"
            description={`Draft Journal Entry — ${je.id}`}
            breadcrumbs={breadcrumbs}
            actions={
              canMutate ? (
                <button
                  type="button"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={deleting}
                  style={{
                    ...S.btnDanger,
                    opacity: deleting ? 0.6 : 1,
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  {deleting ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                  ลบร่าง / Delete Draft
                </button>
              ) : null
            }
          />

          <div style={{ marginTop: 20 }}>
            {actionError && <ErrorBanner message={actionError} />}

            <JEForm
              accounts={accounts}
              defaultValues={jeToFormValues(je)}
              onSaveDraft={handleSaveDraft}
              onPost={handlePost}
              saving={saving}
              posting={posting}
              onCancel={() => router.push("/gl/journal-entries")}
            />
          </div>

          <ConfirmDialog
            open={showDeleteDialog}
            title="ลบรายการร่าง?"
            description={`ยืนยันการลบ Journal Entry นี้ (${je.id.substring(0, 8)}...) — การลบไม่สามารถย้อนกลับได้`}
            confirmLabel="ลบ / Delete"
            cancelLabel="ยกเลิก / Cancel"
            destructive
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteDialog(false)}
          />
        </>
      )}

      {/* ── POSTED ── */}
      {je.status === "POSTED" && (
        <>
          <PageHeader
            title={je.description}
            description={je.je_no}
            breadcrumbs={breadcrumbs}
            actions={
              canMutate && !isReversal ? (
                <button
                  type="button"
                  onClick={() => setShowVoidDialog(true)}
                  style={S.btnDanger}
                >
                  ยกเลิก / Void
                </button>
              ) : null
            }
          />

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {actionError && <ErrorBanner message={actionError} />}

            {isReversal && (
              <ReversalBanner
                originalId={je.reversal_of_id!}
                originalJeNo={originalJeNo}
              />
            )}

            <ReadOnlyJEView je={je} />
          </div>

          <VoidDialog
            open={showVoidDialog}
            loading={voiding}
            onConfirm={handleVoid}
            onCancel={() => setShowVoidDialog(false)}
          />
        </>
      )}

      {/* ── VOID ── */}
      {je.status === "VOID" && (
        <>
          <PageHeader
            title={je.description}
            description={je.je_no}
            breadcrumbs={breadcrumbs}
          />

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            <VoidedBanner
              je={je}
              reversalJeId={reversalJeId}
              reversalJeNo={reversalJeNo}
            />

            <ReadOnlyJEView je={je} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function jeToFormValues(je: JournalEntry): JEFormValues {
  return {
    entry_date: extractDateStr(je.entry_date),
    branch_code: je.branch_code,
    description: je.description,
    source_type: je.source_type,
    lines: je.lines.map((l) => ({
      account_code: l.account_code,
      description: l.description ?? "",
      branch_code: l.branch_code,
      debit: l.debit,
      credit: l.credit,
      dim_dept: l.dim_dept ?? undefined,
      dim_project: l.dim_project ?? undefined,
    })),
  };
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "10px 14px",
        background: "rgba(184,92,80,0.1)",
        border: "1px solid var(--error)",
        borderRadius: 6,
        fontSize: 13,
        color: "var(--error)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <AlertCircle size={13} style={{ flexShrink: 0 }} />
      {message}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "16px 20px",
  } as React.CSSProperties,

  td: {
    padding: "8px 12px",
    fontSize: 13,
    color: "var(--text-primary)",
  } as React.CSSProperties,

  tdCenter: {
    padding: "8px 8px",
    textAlign: "center",
    fontSize: 11,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  } as React.CSSProperties,

  btnSecondary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  btnDanger: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    border: "none",
    background: "var(--error)",
    color: "#fff",
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
} as const;

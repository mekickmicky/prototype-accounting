"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useUser } from "@/lib/use-user";
import { PageHeader } from "@/components/ui/page-header";
import { JEForm, type JEFormValues } from "@/components/gl/je-form";
import type { AccountOption } from "@/components/ui/account-picker";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface JEResponse {
  id: string;
  je_no: string | null;
  status: "DRAFT" | "POSTED" | "VOID";
}

export default function NewJournalEntryPage() {
  const router = useRouter();
  const { user, loading: userLoading } = useUser();

  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<AccountOption[]>("/api/v1/accounts")
      .then((data) => setAccounts(data))
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : "Failed to load accounts"
        )
      )
      .finally(() => setLoadingAccounts(false));
  }, []);

  const handleSaveDraft = async (values: JEFormValues) => {
    setActionError(null);
    setSaving(true);
    try {
      const je = await apiClient.post<JEResponse>(
        "/api/v1/journal-entries",
        values
      );
      router.push(`/gl/journal-entries/${je.id}`);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to save draft"
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (values: JEFormValues) => {
    setActionError(null);
    setPosting(true);
    try {
      // Create draft first
      const draft = await apiClient.post<JEResponse>(
        "/api/v1/journal-entries",
        values
      );
      // Then post
      try {
        await fetch(
          `${API_BASE}/api/v1/journal-entries/${draft.id}/post`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          }
        ).then(async (res) => {
          const body = await res.json();
          if (!body.success) {
            throw new ApiError(
              body.error?.code ?? "UNKNOWN",
              body.error?.message ?? "Posting failed",
              res.status
            );
          }
        });
        router.push(`/gl/journal-entries/${draft.id}`);
      } catch (postErr) {
        // Draft created but post failed — navigate to draft so user can retry
        setActionError(
          postErr instanceof ApiError
            ? postErr.message
            : "Draft saved but posting failed"
        );
        router.push(`/gl/journal-entries/${draft.id}`);
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Failed to create journal entry"
      );
    } finally {
      setPosting(false);
    }
  };

  if (userLoading || loadingAccounts) {
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
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          กำลังโหลด...
        </span>
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

  // Suppress unused variable warning — user is loaded for auth guard via useUser
  void user;

  return (
    <div>
      <PageHeader
        title="สร้างบันทึกรายการ"
        description="New Journal Entry"
        breadcrumbs={[
          { label: "GL", href: "/gl/dashboard" },
          { label: "Journal Entries", href: "/gl/journal-entries" },
          { label: "New" },
        ]}
      />

      <div style={{ marginTop: 20 }}>
        {actionError && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "rgba(184,92,80,0.1)",
              border: "1px solid var(--error)",
              borderRadius: 6,
              fontSize: 13,
              color: "var(--error)",
            }}
          >
            {actionError}
          </div>
        )}

        <JEForm
          accounts={accounts}
          defaultValues={{ branch_code: "TL" }}
          onSaveDraft={handleSaveDraft}
          onPost={handlePost}
          saving={saving}
          posting={posting}
          onCancel={() => router.push("/gl/journal-entries")}
        />
      </div>
    </div>
  );
}

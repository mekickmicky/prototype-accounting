"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Download, Printer, Loader2 } from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";

import { useUser } from "@/lib/use-user";

import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge, DocumentStatus } from "@/components/ui/status-badge";
import { MoneyDisplay } from "@/components/ui/money-display";
import { BranchPicker } from "@/components/ui/branch-picker";
import { PeriodPicker, PeriodOption } from "@/components/ui/period-picker";
import { EmptyState } from "@/components/ui/empty-state";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ──────────────────────────────────────────────────────────────────────

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
  total_debit: string;
  total_credit: string;
  created_at: string;
  updated_at: string;
}

interface UserInfo {
  id: string;
  name: string;
  email: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBangkokNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 7 * 60 * 60 * 1000);
}

function getCurrentPeriod(): string {
  const d = getBangkokNow();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function generatePeriodOptions(monthsBack = 13): PeriodOption[] {
  const d = getBangkokNow();
  const options: PeriodOption[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    options.push({ code: `${y}-${m}`, status: "OPEN" });
  }
  return options;
}

function formatEntryDate(isoDate: string): string {
  const parts = isoDate.split("T")[0]?.split("-").map(Number) ?? [];
  if (parts.length < 3) return isoDate;
  const [y, mo, d] = parts as [number, number, number];
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  MANUAL: "Manual",
  SALES_INVOICE: "Sales Invoice",
  RECEIPT: "Receipt",
  BILL: "Bill",
  PAYMENT: "Payment",
  TAX_FILING: "Tax Filing",
  BANK_TRANSFER: "Bank Transfer",
  STOCK_EXPORT: "Stock Export",
  RECURRING: "Recurring",
  ADJUSTMENT: "Adjustment",
  REVERSAL: "Reversal",
};

const SOURCE_TYPE_OPTIONS = [
  { label: "All Types", value: "" },
  ...Object.entries(SOURCE_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
];

const STATUS_FILTER_OPTIONS = [
  { label: "Active (Draft + Posted)", value: "active" },
  { label: "All Statuses", value: "all" },
  { label: "Draft only", value: "DRAFT" },
  { label: "Posted only", value: "POSTED" },
  { label: "Void only", value: "VOID" },
];

// ── CSV export ─────────────────────────────────────────────────────────────────

function exportCSV(entries: JournalEntry[], userMap: Record<string, string>) {
  const BOM = "﻿";
  const headers = [
    "JE No",
    "Date",
    "Description",
    "Source",
    "Branch",
    "Total Dr",
    "Total Cr",
    "Status",
    "Posted By",
  ];
  const rows = entries.map((e) => [
    e.je_no,
    e.entry_date.split("T")[0] ?? "",
    `"${e.description.replace(/"/g, '""')}"`,
    SOURCE_TYPE_LABELS[e.source_type] ?? e.source_type,
    e.branch_code,
    e.total_debit,
    e.total_credit,
    e.status,
    e.posted_by_id ? (userMap[e.posted_by_id] ?? e.posted_by_id) : "",
  ]);

  const csv =
    BOM +
    [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `journal-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function JournalEntriesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: userLoading } = useUser();

  const defaultPeriod = getCurrentPeriod();
  const periodOptions = useMemo(() => generatePeriodOptions(13), []);

  // Filter state — initialized from URL params
  const [period, setPeriod] = useState<string>(
    searchParams.get("period") ?? defaultPeriod
  );
  const [branch, setBranch] = useState<string>(
    searchParams.get("branch") ?? "ALL"
  );
  const [statusMode, setStatusMode] = useState<string>(
    searchParams.get("status") ?? "active"
  );
  const [sourceType, setSourceType] = useState<string>(
    searchParams.get("source_type") ?? ""
  );
  const [dateFrom, setDateFrom] = useState<string>(
    searchParams.get("date_from") ?? ""
  );
  const [dateTo, setDateTo] = useState<string>(
    searchParams.get("date_to") ?? ""
  );
  const [account, setAccount] = useState<string>(
    searchParams.get("account") ?? ""
  );
  const [q, setQ] = useState<string>(searchParams.get("q") ?? "");

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync filter state → URL
  const syncURL = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v) {
          params.set(k, v);
        } else {
          params.delete(k);
        }
      });
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setAndSync = useCallback(
    (
      setter: React.Dispatch<React.SetStateAction<string>>,
      key: string,
      value: string
    ) => {
      setter(value);
      syncURL({ [key]: value });
    },
    [syncURL]
  );

  // Fetch users for Posted By display
  useEffect(() => {
    fetch(`${API_BASE}/api/v1/auth/users`, { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (body.success && Array.isArray(body.data?.users)) {
          const map: Record<string, string> = {};
          (body.data.users as UserInfo[]).forEach((u) => {
            map[u.id] = u.name;
          });
          setUserMap(map);
        }
      })
      .catch(() => {/* no-op — Posted By shows ID fallback */});
  }, []);

  // Fetch journal entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (branch !== "ALL") params.set("branch", branch);
    // For specific status values only (not "active"/"all" — handled client-side)
    if (statusMode !== "active" && statusMode !== "all") {
      params.set("status", statusMode);
    }
    if (sourceType) params.set("source_type", sourceType);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (account) params.set("account", account);
    if (q) params.set("q", q);
    params.set("page_size", "100");

    try {
      const res = await fetch(
        `${API_BASE}/api/v1/journal-entries?${params.toString()}`,
        { credentials: "include", headers: { "Content-Type": "application/json" } }
      );
      const body = await res.json();
      if (!body.success) {
        throw new Error(body.error?.message ?? "Failed to load journal entries");
      }
      setEntries(body.data as JournalEntry[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal entries");
    } finally {
      setLoading(false);
    }
  }, [period, branch, statusMode, sourceType, dateFrom, dateTo, account, q]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Client-side filter for "active" mode (exclude VOID)
  const displayEntries = useMemo(() => {
    if (statusMode === "active") {
      return entries.filter((e) => e.status !== "VOID");
    }
    return entries;
  }, [entries, statusMode]);

  // Table columns
  const columns = useMemo<ColumnDef<JournalEntry, unknown>[]>(
    () => [
      {
        accessorKey: "je_no",
        header: "JE No",
        cell: ({ row }) => {
          const isDraftNo = row.original.je_no.startsWith("DRAFT-");
          return (
            <Link
              href={`/gl/journal-entries/${row.original.id}`}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: isDraftNo ? "var(--text-muted)" : "var(--accent)",
                textDecoration: "none",
                fontWeight: 500,
                fontStyle: isDraftNo ? "italic" : "normal",
              }}
            >
              {isDraftNo ? "(draft)" : row.original.je_no}
            </Link>
          );
        },
      },
      {
        accessorKey: "entry_date",
        header: "Date",
        cell: ({ getValue }) => (
          <span style={{ fontSize: 12, whiteSpace: "nowrap", color: "var(--text-primary)" }}>
            {formatEntryDate(getValue() as string)}
          </span>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ getValue }) => {
          const val = getValue() as string;
          return (
            <span
              style={{
                fontSize: 12,
                color: "var(--text-primary)",
                maxWidth: 260,
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={val}
            >
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: "source_type",
        header: "Source",
        cell: ({ getValue }) => (
          <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {SOURCE_TYPE_LABELS[getValue() as string] ?? (getValue() as string)}
          </span>
        ),
      },
      {
        accessorKey: "branch_code",
        header: "Branch",
        cell: ({ getValue }) => (
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              color: "var(--text-muted)",
            }}
          >
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "total_debit",
        header: "Total Dr",
        cell: ({ getValue }) => (
          <div style={{ textAlign: "right" }}>
            <MoneyDisplay value={getValue() as string} showZero />
          </div>
        ),
      },
      {
        accessorKey: "total_credit",
        header: "Total Cr",
        cell: ({ getValue }) => (
          <div style={{ textAlign: "right" }}>
            <MoneyDisplay value={getValue() as string} showZero />
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge status={getValue() as DocumentStatus} />
        ),
      },
      {
        accessorKey: "posted_by_id",
        header: "Posted By",
        cell: ({ getValue }) => {
          const id = getValue() as string | null;
          if (!id) return <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>;
          const name = userMap[id];
          return (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {name ?? id.slice(0, 8) + "…"}
            </span>
          );
        },
      },
    ],
    [userMap]
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  if (userLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 120, justifyContent: "center" }}>
        <Loader2 size={16} className="animate-spin text-[--text-dim]" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังโหลด...</span>
      </div>
    );
  }

  const isEditor = user?.role === "ADMIN" || user?.role === "ACCOUNTANT";

  return (
    <div>
      <PageHeader
        title="รายการสมุดรายวัน"
        description="Journal Entries"
        breadcrumbs={[{ label: "GL" }, { label: "Journal Entries" }]}
        actions={
          isEditor ? (
            <Link
              href="/gl/journal-entries/new"
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
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              <Plus size={13} />
              New JE
            </Link>
          ) : undefined
        }
      />

      {/* Filter bar */}
      <FilterBar
        search={q}
        onSearchChange={(v) => setAndSync(setQ, "q", v)}
        searchPlaceholder="Search JE no, description…"
        filters={
          <>
            {/* Period */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
                Period
              </span>
              <PeriodPicker
                value={period || null}
                onChange={(v) => setAndSync(setPeriod, "period", v ?? "")}
                periods={periodOptions}
                placeholder="All periods"
                className="h-7 text-[12px]"
              />
            </div>

            {/* Branch */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
                Branch
              </span>
              <BranchPicker
                value={branch}
                onChange={(v) => setAndSync(setBranch, "branch", v)}
                allowAll
                className="h-7 text-[12px]"
              />
            </div>

            {/* Status */}
            <FilterSelect
              label="Status"
              value={statusMode}
              onChange={(v) => setAndSync(setStatusMode, "status", v)}
              options={STATUS_FILTER_OPTIONS}
            />

            {/* Source type */}
            <FilterSelect
              label="Source"
              value={sourceType}
              onChange={(v) => setAndSync(setSourceType, "source_type", v)}
              options={SOURCE_TYPE_OPTIONS}
            />

            {/* Date range */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
                From
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setAndSync(setDateFrom, "date_from", e.target.value)}
                style={{
                  height: 28,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-elevated)",
                  padding: "0 8px",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                  colorScheme: "dark",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setAndSync(setDateTo, "date_to", e.target.value)}
                style={{
                  height: 28,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-elevated)",
                  padding: "0 8px",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                  colorScheme: "dark",
                }}
              />
            </div>

            {/* Account filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 500 }}>
                Account
              </span>
              <input
                type="text"
                value={account}
                onChange={(e) => setAndSync(setAccount, "account", e.target.value)}
                placeholder="e.g. 11010"
                style={{
                  height: 28,
                  width: 90,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "var(--bg-elevated)",
                  padding: "0 8px",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  outline: "none",
                  fontFamily: "var(--font-mono)",
                }}
              />
            </div>
          </>
        }
        actions={
          <>
            <button
              onClick={() => exportCSV(displayEntries, userMap)}
              title="Export CSV"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 28,
                padding: "0 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Download size={12} />
              CSV
            </button>
            <button
              onClick={() => window.print()}
              title="Print"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                height: 28,
                padding: "0 10px",
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--text-primary)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <Printer size={12} />
              Print
            </button>
          </>
        }
      />

      {/* Table area */}
      <div style={{ marginTop: 12 }}>
        {error ? (
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
        ) : loading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", height: 120 }}>
            <Loader2 size={16} className="animate-spin text-[--text-dim]" />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>กำลังโหลด...</span>
          </div>
        ) : displayEntries.length === 0 ? (
          <EmptyState
            title="ไม่พบรายการ"
            description="No journal entries match the current filters."
            action={
              isEditor ? (
                <Link
                  href="/gl/journal-entries/new"
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
                    textDecoration: "none",
                    fontFamily: "inherit",
                  }}
                >
                  <Plus size={13} />
                  New JE
                </Link>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={displayEntries}
            pageSize={20}
            emptyMessage="No journal entries"
          />
        )}
      </div>

      {/* Entry count footer */}
      {!loading && !error && displayEntries.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--text-dim)",
            textAlign: "right",
          }}
        >
          Showing {displayEntries.length} entries
          {displayEntries.length === 100 && " (max 100 — refine filters to see more)"}
        </div>
      )}
    </div>
  );
}

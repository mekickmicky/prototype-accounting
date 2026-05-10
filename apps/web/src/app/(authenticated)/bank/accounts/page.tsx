"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import Decimal from "decimal.js";
import type { ColumnDef } from "@tanstack/react-table";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";

interface BankAccount {
  id: string;
  code: string;
  name: string;
  bank_name: string;
  account_number: string | null;
  account_type: string | null;
  gl_account_code: string;
  is_active: boolean;
  balance: string;
  updated_at: string;
}

interface ListResponse {
  data: BankAccount[];
  meta: { total: number; page: number; page_size: number };
}

function maskAccountNo(no: string | null): string {
  if (!no) return "—";
  if (no.length <= 4) return no;
  return "****" + no.slice(-4);
}

function fmtMoney(val: string): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getPaged<BankAccount[]>("/api/v1/bank-accounts?page=1&page_size=100");
      setAccounts(result.data ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load bank accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const columns: ColumnDef<BankAccount, unknown>[] = [
    {
      accessorKey: "bank_name",
      header: "Bank",
      cell: ({ getValue, row }) => {
        const bank = getValue() as string;
        const isCash = bank === "CASH";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                background: isCash ? "rgba(108,178,120,0.15)" : "rgba(180,140,90,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Building2 size={13} style={{ color: isCash ? "#6CB278" : "var(--accent)" }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{bank}</div>
              <div style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                {row.original.code}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "name",
      header: "Account Name",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "account_number",
      header: "Account No.",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
          {maskAccountNo(getValue() as string | null)}
        </span>
      ),
    },
    {
      accessorKey: "account_type",
      header: "Type",
      cell: ({ getValue }) => {
        const v = (getValue() as string | null) ?? "—";
        return <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "capitalize" }}>{v}</span>;
      },
    },
    {
      accessorKey: "gl_account_code",
      header: "GL Account",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "balance",
      header: () => <span style={{ display: "block", textAlign: "right" }}>Balance (THB)</span>,
      cell: ({ getValue }) => {
        const val = getValue() as string;
        const n = new Decimal(val ?? "0");
        return (
          <span
            style={{
              display: "block",
              textAlign: "right",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: 500,
              color: n.lt(0) ? "var(--error)" : "var(--text-primary)",
            }}
          >
            {fmtMoney(val)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (row) => row.is_active,
      cell: ({ getValue }) => {
        const active = getValue() as boolean;
        return (
          <span
            style={{
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 500,
              background: active ? "rgba(108,178,120,0.15)" : "rgba(120,120,120,0.12)",
              color: active ? "#6CB278" : "var(--text-dim)",
            }}
          >
            {active ? "Active" : "Inactive"}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/bank/accounts/${row.original.id}`)}
          style={{
            fontSize: 11,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "2px 6px",
          }}
        >
          View →
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="บัญชีธนาคาร"
        description="Bank accounts · Cash & bank reconciliation"
        breadcrumbs={[{ label: "Bank", href: "/bank/accounts" }, { label: "Accounts" }]}
      />

      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 12,
            color: "var(--error)",
            marginBottom: 12,
            marginTop: 16,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            borderRadius: 6,
            border: "1px solid var(--border)",
            overflow: "hidden",
            background: "var(--bg-elevated)",
            marginTop: 16,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderBottom: i < 7 ? "1px solid var(--border)" : undefined,
              }}
            >
              <div
                className="animate-pulse"
                style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}
              />
              <div style={{ flex: 1, display: "flex", gap: 16, alignItems: "center" }}>
                {[80, 140, 100, 60, 70, 80].map((w, j) => (
                  <div
                    key={j}
                    className="animate-pulse"
                    style={{ height: 11, width: w, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            borderRadius: 6,
            border: "1px solid var(--border)",
            overflow: "hidden",
            background: "var(--bg-elevated)",
            marginTop: error ? 0 : 16,
          }}
        >
          <DataTable
            columns={columns}
            data={accounts}
            pageSize={25}
            emptyMessage="ไม่พบบัญชีธนาคาร"
          />
        </div>
      )}
    </div>
  );
}

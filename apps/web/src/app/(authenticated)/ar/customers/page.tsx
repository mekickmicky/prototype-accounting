"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";

interface Customer {
  id: string;
  code: string;
  name: string;
  name_th: string | null;
  tax_id: string | null;
  phone: string | null;
  payment_terms_days: number;
  is_active: boolean;
}

const INPUT_STYLE: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  fontSize: 12,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
};

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCustomers = useCallback(async (query: string, active: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: "1", page_size: "100" });
      if (query.trim()) qs.set("q", query.trim());
      if (active) qs.set("active", "true");
      const result = await apiClient.get<Customer[]>(`/api/v1/customers?${qs}`);
      setCustomers(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers("", true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleQChange(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchCustomers(val, activeOnly), 300);
  }

  function handleActiveChange(checked: boolean) {
    setActiveOnly(checked);
    fetchCustomers(q, checked);
  }

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      accessorKey: "code",
      header: "Code",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      id: "display_name",
      header: "Name",
      accessorFn: (row) => row.name_th ?? row.name,
      cell: ({ row, getValue }) => (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{getValue() as string}</div>
          {row.original.name_th && (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.original.name}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "tax_id",
      header: "Tax ID",
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: v ? "var(--text-primary)" : "var(--text-dim)" }}>
            {v ?? "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        return <span style={{ fontSize: 12, color: v ? "var(--text-primary)" : "var(--text-dim)" }}>{v ?? "—"}</span>;
      },
    },
    {
      accessorKey: "payment_terms_days",
      header: "Terms",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {v === 0 ? "COD" : `Net ${v}d`}
          </span>
        );
      },
    },
    {
      id: "ar_balance",
      header: "AR Balance",
      cell: () => (
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>
      ),
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
          onClick={() => router.push(`/ar/customers/${row.original.id}`)}
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
        title="ลูกค้า"
        description="Customer master · Accounts Receivable"
        breadcrumbs={[{ label: "AR", href: "/ar/dashboard" }, { label: "Customers" }]}
        actions={
          <button
            onClick={() => router.push("/ar/customers/new")}
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
            }}
          >
            <Plus size={13} />
            New Customer
          </button>
        }
      />

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "0 0 260px" }}>
          <Search
            size={12}
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}
          />
          <input
            type="text"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="ค้นหารหัส ชื่อ เบอร์โทร..."
            style={{ ...INPUT_STYLE, paddingLeft: 28, width: "100%" }}
          />
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-primary)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => handleActiveChange(e.target.checked)}
            style={{ accentColor: "var(--accent)", width: 13, height: 13 }}
          />
          Active only
        </label>

        {loading && (
          <Loader2 size={13} style={{ color: "var(--text-dim)" }} className="animate-spin" />
        )}
      </div>

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
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          borderRadius: 6,
          border: "1px solid var(--border)",
          overflow: "hidden",
          background: "var(--bg-elevated)",
        }}
      >
        <DataTable
          columns={columns}
          data={customers}
          pageSize={25}
          emptyMessage="ไม่พบลูกค้า — กด New Customer เพื่อเพิ่มลูกค้าใหม่"
        />
      </div>
    </div>
  );
}

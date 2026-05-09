"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, AlertTriangle, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import Decimal from "decimal.js";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { format } from "date-fns";

type BillStatus = "DRAFT" | "POSTED" | "PARTIAL_PAID" | "PAID" | "VOID";

interface Bill {
  id: string;
  bill_no: string | null;
  vendor_invoice_no: string | null;
  vendor: { id: string; code: string; name: string; name_th: string | null };
  branch_code: string;
  issue_date: string;
  due_date: string;
  subtotal: string;
  withholding_total: string;
  net_payable: string;
  total: string;
  paid_amount: string;
  status: BillStatus;
}

interface ListResponse {
  data: Bill[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_LABELS: Record<BillStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIAL_PAID: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_COLORS: Record<BillStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(100,140,220,0.15)", color: "#6480CC" },
  PARTIAL_PAID: { bg: "rgba(200,160,60,0.15)", color: "#C8A03C" },
  PAID: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "POSTED", label: "Posted" },
  { value: "PARTIAL_PAID", label: "Partial" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

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

function fmtMoney(val: string | number): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

export default function BillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState("");
  const [overdue, setOverdue] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchBills = useCallback(
    async (opts: { q: string; status: string; branch: string; period: string; overdue: boolean; page: number }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(opts.page), page_size: String(PAGE_SIZE) });
        if (opts.q.trim()) qs.set("q", opts.q.trim());
        if (opts.status) qs.set("status", opts.status);
        if (opts.branch) qs.set("branch", opts.branch);
        if (opts.period) qs.set("period", opts.period);
        if (opts.overdue) qs.set("overdue", "true");
        const result = await apiClient.get<ListResponse>(`/api/v1/bills?${qs}`);
        setBills(result.data ?? []);
        setTotal(result.meta?.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load bills");
        setBills([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchBills({ q, status, branch, period, overdue, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters(newPage = 1) {
    setPage(newPage);
    fetchBills({ q, status, branch, period, overdue, page: newPage });
  }

  function handleQChange(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(1), 350);
  }

  function handleFilterChange<T>(setter: (v: T) => void, val: T) {
    setter(val);
    setTimeout(() => applyFilters(1), 0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns: ColumnDef<Bill, unknown>[] = [
    {
      accessorKey: "bill_no",
      header: "Bill #",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {(getValue() as string | null) ?? "(Draft)"}
        </span>
      ),
    },
    {
      accessorKey: "vendor_invoice_no",
      header: "Vendor Inv #",
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
      id: "vendor",
      header: "Vendor",
      accessorFn: (row) => row.vendor.name_th ?? row.vendor.name,
      cell: ({ row, getValue }) => (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{getValue() as string}</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{row.original.vendor.code}</div>
        </div>
      ),
    },
    {
      accessorKey: "issue_date",
      header: "Issue Date",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(getValue() as string)}</span>
      ),
    },
    {
      accessorKey: "due_date",
      header: "Due Date",
      cell: ({ row, getValue }) => {
        const isOverdue =
          ["POSTED", "PARTIAL_PAID"].includes(row.original.status) &&
          new Date(getValue() as string) < new Date();
        return (
          <span style={{ fontSize: 12, color: isOverdue ? "var(--error)" : "var(--text-muted)", fontWeight: isOverdue ? 500 : 400 }}>
            {fmtDate(getValue() as string)}
            {isOverdue && " ⚠"}
          </span>
        );
      },
    },
    {
      accessorKey: "total",
      header: "Total",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "withholding_total",
      header: "WHT",
      cell: ({ getValue }) => {
        const v = new Decimal(getValue() as string);
        return (
          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: v.gt(0) ? "#C8A03C" : "var(--text-dim)" }}>
            {v.gt(0) ? `(${fmtMoney(v.toNumber())})` : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "net_payable",
      header: "Net Payable",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--accent)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "paid_amount",
      header: "Paid",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as BillStatus;
        const { bg, color } = STATUS_COLORS[s] ?? STATUS_COLORS.DRAFT;
        return (
          <span style={{ display: "inline-block", padding: "1px 7px", borderRadius: 9999, fontSize: 10, fontWeight: 500, background: bg, color }}>
            {STATUS_LABELS[s] ?? s}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          onClick={() => router.push(`/ap/bills/${row.original.id}`)}
          style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "2px 6px" }}
        >
          View →
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="ใบวางบิล"
        description="Bills · Accounts Payable"
        breadcrumbs={[{ label: "AP", href: "/ap/dashboard" }, { label: "Bills" }]}
        actions={
          <button
            onClick={() => router.push("/ap/bills/new")}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, borderRadius: 4, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}
          >
            <Plus size={13} />
            New Bill
          </button>
        }
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "0 0 220px" }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
          <input type="text" value={q} onChange={(e) => handleQChange(e.target.value)} placeholder="ค้นหาเลขที่ เจ้าหนี้..." style={{ ...INPUT_STYLE, paddingLeft: 28, width: "100%" }} />
        </div>
        <select value={status} onChange={(e) => handleFilterChange(setStatus, e.target.value)} disabled={overdue} style={{ ...INPUT_STYLE, padding: "0 8px", cursor: "pointer", width: 130, opacity: overdue ? 0.5 : 1 }}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={branch} onChange={(e) => handleFilterChange(setBranch, e.target.value)} style={{ ...INPUT_STYLE, padding: "0 8px", cursor: "pointer", width: 110 }}>
          <option value="">All branches</option>
          {["TL", "EK", "RAMA9"].map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <input type="month" value={period} onChange={(e) => handleFilterChange(setPeriod, e.target.value)} style={{ ...INPUT_STYLE, width: 130 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: overdue ? "var(--error)" : "var(--text-primary)", cursor: "pointer", userSelect: "none", padding: "4px 8px", borderRadius: 4, border: `1px solid ${overdue ? "var(--error)" : "var(--border)"}`, background: overdue ? "rgba(184,92,80,0.08)" : "transparent" }}>
          <AlertTriangle size={11} style={{ color: overdue ? "var(--error)" : "var(--text-dim)" }} />
          <input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); if (e.target.checked) setStatus(""); setTimeout(() => applyFilters(1), 0); }} style={{ accentColor: "var(--error)", width: 12, height: 12 }} />
          Overdue only
        </label>
        {loading && <Loader2 size={13} style={{ color: "var(--text-dim)" }} className="animate-spin" />}
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(184,92,80,0.1)", border: "1px solid var(--error)", borderRadius: 5, fontSize: 12, color: "var(--error)", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
        {total} bill{total !== 1 ? "s" : ""}
        {total > PAGE_SIZE && ` · page ${page} of ${totalPages}`}
      </div>

      {loading && bills.length === 0 ? (
        <div style={{ borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-elevated)" }}>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              style={{
                height: 44,
                borderBottom: i < 7 ? "1px solid var(--border)" : undefined,
                padding: "0 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              {[100, 90, 150, 70, 70, 80, 60, 70, 60, 40].map((w, j) => (
                <div
                  key={j}
                  className="animate-pulse"
                  style={{ height: 10, width: w, borderRadius: 4, background: "var(--border-strong)", opacity: 0.6, flexShrink: 0 }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", background: "var(--bg-elevated)" }}>
          <DataTable columns={columns} data={bills} pageSize={PAGE_SIZE} emptyMessage="ไม่พบใบวางบิล — กด New Bill เพื่อสร้างใหม่" />
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-strong)", background: "var(--surface)", color: page === 1 ? "var(--text-dim)" : "var(--text-primary)", cursor: page === 1 ? "default" : "pointer", fontFamily: "inherit" }}>Prev</button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 4, border: "1px solid var(--border-strong)", background: "var(--surface)", color: page >= totalPages ? "var(--text-dim)" : "var(--text-primary)", cursor: page >= totalPages ? "default" : "pointer", fontFamily: "inherit" }}>Next</button>
        </div>
      )}
    </div>
  );
}

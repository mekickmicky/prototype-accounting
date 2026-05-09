"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, AlertTriangle, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiClient, ApiError } from "@/lib/api-client";
import Decimal from "decimal.js";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { format } from "date-fns";

type InvoiceStatus = "DRAFT" | "POSTED" | "PARTIAL_PAID" | "PAID" | "VOID";

interface SalesInvoice {
  id: string;
  invoice_no: string;
  tax_invoice_no: string | null;
  customer: { id: string; code: string; name: string; name_th: string | null };
  branch_code: string;
  issue_date: string;
  due_date: string;
  total: string;
  paid_amount: string;
  status: InvoiceStatus;
}

interface ListResponse {
  data: SalesInvoice[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  PARTIAL_PAID: "Partial",
  PAID: "Paid",
  VOID: "Void",
};

const STATUS_COLORS: Record<InvoiceStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(100,140,220,0.15)", color: "#6480CC" },
  PARTIAL_PAID: { bg: "rgba(200,160,60,0.15)", color: "#C8A03C" },
  PAID: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const BRANCH_OPTIONS = ["", "TL", "EK", "RAMA9"] as const;
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
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

const SELECT_STYLE: React.CSSProperties = {
  ...INPUT_STYLE,
  padding: "0 8px",
  cursor: "pointer",
  appearance: "none" as const,
  paddingRight: 24,
};

function fmtMoney(val: string | number | Decimal): string {
  const n = new Decimal(val ?? 0).toNumber();
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

function balance(invoice: SalesInvoice): Decimal {
  return new Decimal(invoice.total).minus(new Decimal(invoice.paid_amount));
}

export default function InvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [branch, setBranch] = useState("");
  const [period, setPeriod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [overdue, setOverdue] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInvoices = useCallback(
    async (opts: {
      q: string;
      status: string;
      branch: string;
      period: string;
      dateFrom: string;
      dateTo: string;
      overdue: boolean;
      page: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(opts.page), page_size: String(PAGE_SIZE) });
        if (opts.q.trim()) qs.set("q", opts.q.trim());
        if (opts.status) qs.set("status", opts.status);
        if (opts.branch) qs.set("branch", opts.branch);
        if (opts.period) qs.set("period", opts.period);
        if (opts.dateFrom) qs.set("date_from", opts.dateFrom);
        if (opts.dateTo) qs.set("date_to", opts.dateTo);
        if (opts.overdue) qs.set("overdue", "true");
        const result = await apiClient.get<ListResponse>(`/api/v1/sales-invoices?${qs}`);
        setInvoices(result.data ?? []);
        setTotal(result.meta?.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load invoices");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchInvoices({ q, status, branch, period, dateFrom, dateTo, overdue, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters(newPage = 1) {
    setPage(newPage);
    fetchInvoices({ q, status, branch, period, dateFrom, dateTo, overdue, page: newPage });
  }

  function handleQChange(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => applyFilters(1), 350);
  }

  function handleFilterChange<T>(setter: (v: T) => void, val: T) {
    setter(val);
    // use timeout so state updates settle before applyFilters re-reads them
    setTimeout(() => applyFilters(1), 0);
  }

  function handleOverdueToggle(checked: boolean) {
    setOverdue(checked);
    if (checked) setStatus(""); // overdue filter replaces status
    setTimeout(() => applyFilters(1), 0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns: ColumnDef<SalesInvoice, unknown>[] = [
    {
      accessorKey: "invoice_no",
      header: "Invoice #",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "tax_invoice_no",
      header: "Tax Invoice #",
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
      id: "customer",
      header: "Customer",
      accessorFn: (row) => row.customer.name_th ?? row.customer.name,
      cell: ({ row, getValue }) => (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{getValue() as string}</div>
          {row.original.customer.name_th && (
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{row.original.customer.code}</div>
          )}
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
      accessorKey: "paid_amount",
      header: "Paid",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      accessorFn: (row) => balance(row),
      cell: ({ getValue }) => {
        const b = getValue() as Decimal;
        return (
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              color: b.gt(0) ? "var(--accent)" : "var(--text-dim)",
              fontWeight: b.gt(0) ? 500 : 400,
            }}
          >
            {fmtMoney(b)}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as InvoiceStatus;
        const { bg, color } = STATUS_COLORS[s] ?? STATUS_COLORS.DRAFT;
        return (
          <span
            style={{
              display: "inline-block",
              padding: "1px 7px",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 500,
              background: bg,
              color,
            }}
          >
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
          onClick={() => router.push(`/ar/invoices/${row.original.id}`)}
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
        title="ใบแจ้งหนี้"
        description="Sales Invoices · Accounts Receivable"
        breadcrumbs={[{ label: "AR", href: "/ar/dashboard" }, { label: "Invoices" }]}
        actions={
          <button
            onClick={() => router.push("/ar/invoices/new")}
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
            New Invoice
          </button>
        }
      />

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 12, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "0 0 220px" }}>
          <Search
            size={12}
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }}
          />
          <input
            type="text"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="ค้นหาเลขที่ ลูกค้า..."
            style={{ ...INPUT_STYLE, paddingLeft: 28, width: "100%" }}
          />
        </div>

        {/* Status */}
        <div style={{ position: "relative" }}>
          <select
            value={status}
            onChange={(e) => handleFilterChange(setStatus, e.target.value)}
            disabled={overdue}
            style={{ ...SELECT_STYLE, width: 130, opacity: overdue ? 0.5 : 1 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Branch */}
        <div style={{ position: "relative" }}>
          <select
            value={branch}
            onChange={(e) => handleFilterChange(setBranch, e.target.value)}
            style={{ ...SELECT_STYLE, width: 100 }}
          >
            <option value="">All branches</option>
            {BRANCH_OPTIONS.filter(Boolean).map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Period */}
        <input
          type="month"
          value={period}
          onChange={(e) => handleFilterChange(setPeriod, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Filter by period"
        />

        {/* Date range */}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Issue date from"
        />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Issue date to"
        />

        {/* Overdue toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: overdue ? "var(--error)" : "var(--text-primary)",
            cursor: "pointer",
            userSelect: "none",
            padding: "4px 8px",
            borderRadius: 4,
            border: `1px solid ${overdue ? "var(--error)" : "var(--border)"}`,
            background: overdue ? "rgba(184,92,80,0.08)" : "transparent",
          }}
        >
          <AlertTriangle size={11} style={{ color: overdue ? "var(--error)" : "var(--text-dim)" }} />
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => handleOverdueToggle(e.target.checked)}
            style={{ accentColor: "var(--error)", width: 12, height: 12 }}
          />
          Overdue only
        </label>

        {loading && <Loader2 size={13} style={{ color: "var(--text-dim)" }} className="animate-spin" />}
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

      {/* Summary row */}
      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
        {total} invoice{total !== 1 ? "s" : ""}
        {total > PAGE_SIZE && ` · page ${page} of ${totalPages}`}
      </div>

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
          data={invoices}
          pageSize={PAGE_SIZE}
          emptyMessage="ไม่พบใบแจ้งหนี้ — กด New Invoice เพื่อสร้างใหม่"
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: page === 1 ? "var(--text-dim)" : "var(--text-primary)",
              cursor: page === 1 ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Prev
          </button>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            style={{
              padding: "4px 10px",
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: page >= totalPages ? "var(--text-dim)" : "var(--text-primary)",
              cursor: page >= totalPages ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

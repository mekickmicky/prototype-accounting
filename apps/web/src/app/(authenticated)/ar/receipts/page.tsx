"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { format } from "date-fns";

type ReceiptStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentMethod = "CASH" | "TRANSFER" | "CARD" | "PROMPTPAY" | "CHEQUE" | "OTHER";

interface Receipt {
  id: string;
  receipt_no: string;
  customer: { id: string; code: string; name: string; name_th: string | null };
  branch_code: string;
  receipt_date: string;
  total_amount: string;
  payment_method: PaymentMethod;
  status: ReceiptStatus;
  applications: Array<{ id: string; applied_amount: string }>;
}

interface ListResponse {
  data: Receipt[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_LABELS: Record<ReceiptStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOID: "Void",
};

const STATUS_COLORS: Record<ReceiptStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const PM_LABELS: Record<PaymentMethod, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
  CARD: "บัตร",
  PROMPTPAY: "พร้อมเพย์",
  CHEQUE: "เช็ค",
  OTHER: "อื่นๆ",
};

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

function fmtMoney(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

function sumApplied(receipt: Receipt): number {
  return receipt.applications.reduce((s, a) => s + parseFloat(a.applied_amount), 0);
}

export default function ReceiptsPage() {
  const router = useRouter();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReceipts = useCallback(
    async (opts: { q: string; status: string; period: string; dateFrom: string; dateTo: string; page: number }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(opts.page), page_size: String(PAGE_SIZE) });
        if (opts.q.trim()) qs.set("q", opts.q.trim());
        if (opts.status) qs.set("status", opts.status);
        if (opts.period) qs.set("period", opts.period);
        if (opts.dateFrom) qs.set("date_from", opts.dateFrom);
        if (opts.dateTo) qs.set("date_to", opts.dateTo);
        const result = await apiClient.get<ListResponse>(`/api/v1/receipts?${qs}`);
        setReceipts(result.data ?? []);
        setTotal(result.meta?.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load receipts");
        setReceipts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchReceipts({ q, status, period, dateFrom, dateTo, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters(newPage = 1) {
    setPage(newPage);
    fetchReceipts({ q, status, period, dateFrom, dateTo, page: newPage });
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

  const columns: ColumnDef<Receipt, unknown>[] = [
    {
      accessorKey: "receipt_no",
      header: "Receipt #",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "receipt_date",
      header: "Date",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(getValue() as string)}</span>
      ),
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
      accessorKey: "payment_method",
      header: "Method",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {PM_LABELS[getValue() as PaymentMethod] ?? getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "total_amount",
      header: "Total",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      id: "applied",
      header: "Applied",
      accessorFn: (row) => sumApplied(row),
      cell: ({ row, getValue }) => {
        const applied = getValue() as number;
        const total = parseFloat(row.original.total_amount);
        const advance = total - applied;
        return (
          <div>
            <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "#6CB278" }}>
              {fmtMoney(applied)}
            </div>
            {advance > 0.005 && (
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>+{fmtMoney(advance)} advance</div>
            )}
          </div>
        );
      },
    },
    {
      id: "apps_count",
      header: "Invoices",
      accessorFn: (row) => row.applications.length,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{getValue() as number}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as ReceiptStatus;
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
          onClick={() => router.push(`/ar/receipts/${row.original.id}`)}
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
        title="ใบเสร็จรับเงิน"
        description="Receipts · Accounts Receivable"
        breadcrumbs={[{ label: "AR", href: "/ar/dashboard" }, { label: "Receipts" }]}
        actions={
          <button
            onClick={() => router.push("/ar/receipts/new")}
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
            New Receipt
          </button>
        }
      />

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, marginBottom: 12, flexWrap: "wrap" }}>
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

        <div style={{ position: "relative" }}>
          <select
            value={status}
            onChange={(e) => handleFilterChange(setStatus, e.target.value)}
            style={{ ...SELECT_STYLE, width: 130 }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="POSTED">Posted</option>
            <option value="VOID">Void</option>
          </select>
        </div>

        <input
          type="month"
          value={period}
          onChange={(e) => handleFilterChange(setPeriod, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Filter by period"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFilterChange(setDateFrom, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Date from"
        />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleFilterChange(setDateTo, e.target.value)}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Date to"
        />

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

      <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 8 }}>
        {total} receipt{total !== 1 ? "s" : ""}
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
          data={receipts}
          pageSize={PAGE_SIZE}
          emptyMessage="ไม่พบใบเสร็จ — กด New Receipt เพื่อสร้างใหม่"
        />
      </div>

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

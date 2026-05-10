"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import Decimal from "decimal.js";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { format } from "date-fns";

type PaymentStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentMethod = "CASH" | "TRANSFER" | "CREDIT_CARD" | "DEBIT_CARD" | "QR" | "CHEQUE" | "OTHER";

interface Payment {
  id: string;
  payment_no: string;
  vendor: { id: string; code: string; name: string; name_th: string | null };
  branch_code: string;
  payment_date: string;
  total_amount: string;
  withholding_total: string;
  net_paid: string;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  applications: Array<{ id: string; applied_amount: string }>;
  withholding: Array<{ id: string; wht_amount: string }>;
}

interface ListResponse {
  data: Payment[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  VOID: "Void",
};

const STATUS_COLORS: Record<PaymentStatus, { bg: string; color: string }> = {
  DRAFT: { bg: "rgba(120,120,120,0.12)", color: "var(--text-muted)" },
  POSTED: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
};

const PM_LABELS: Record<PaymentMethod, string> = {
  CASH: "เงินสด",
  TRANSFER: "โอน",
  CREDIT_CARD: "เครดิต",
  DEBIT_CARD: "เดบิต",
  QR: "QR",
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
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<Payment[]>([]);
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

  const fetchPayments = useCallback(
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
        const result = await apiClient.getPaged<Payment[]>(`/api/v1/payments?${qs}`);
        setPayments(result.data ?? []);
        setTotal(result.meta?.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load payments");
        setPayments([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPayments({ q, status, period, dateFrom, dateTo, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters(newPage = 1) {
    setPage(newPage);
    fetchPayments({ q, status, period, dateFrom, dateTo, page: newPage });
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

  const columns: ColumnDef<Payment, unknown>[] = [
    {
      accessorKey: "payment_no",
      header: "Payment #",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "payment_date",
      header: "Date",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(getValue() as string)}</span>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      accessorFn: (row) => row.vendor.name_th ?? row.vendor.name,
      cell: ({ row, getValue }) => (
        <div>
          <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{getValue() as string}</div>
          {row.original.vendor.name_th && (
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{row.original.vendor.code}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "payment_method",
      header: "Method",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {PM_LABELS[getValue() as PaymentMethod] ?? (getValue() as string)}
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
      id: "withholding",
      header: "WHT",
      accessorFn: (row) => row.withholding.reduce((acc, w) => acc.plus(w.wht_amount), new Decimal(0)).toNumber(),
      cell: ({ getValue }) => {
        const amt = getValue() as number;
        return amt > 0 ? (
          <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "#C8A03C" }}>
            ({fmtMoney(amt)})
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>—</span>
        );
      },
    },
    {
      id: "net_paid",
      header: "Net Paid",
      accessorFn: (row) => new Decimal(row.total_amount).minus(row.withholding.reduce((acc, w) => acc.plus(w.wht_amount), new Decimal(0))).toNumber(),
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "#6CB278", fontWeight: 500 }}>
          {fmtMoney(getValue() as number)}
        </span>
      ),
    },
    {
      id: "apps_count",
      header: "Bills",
      accessorFn: (row) => row.applications.length,
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{getValue() as number}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as PaymentStatus;
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
          onClick={() => router.push(`/ap/payments/${row.original.id}`)}
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
        title="ใบสั่งจ่ายเงิน"
        description="Payments · Accounts Payable"
        breadcrumbs={[{ label: "AP", href: "/ap/dashboard" }, { label: "Payments" }]}
        actions={
          <button
            onClick={() => router.push("/ap/payments/new")}
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
            New Payment
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
            placeholder="ค้นหาเลขที่ เจ้าหนี้..."
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
        {total} payment{total !== 1 ? "s" : ""}
        {total > PAGE_SIZE && ` · page ${page} of ${totalPages}`}
      </div>

      {loading && payments.length === 0 ? (
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
              {[100, 80, 150, 70, 80, 60, 80, 60, 40].map((w, j) => (
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
            data={payments}
            pageSize={PAGE_SIZE}
            emptyMessage="ไม่พบใบสั่งจ่ายเงิน — กด New Payment เพื่อสร้างใหม่"
          />
        </div>
      )}

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

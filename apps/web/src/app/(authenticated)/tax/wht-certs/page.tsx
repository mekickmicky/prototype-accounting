"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Loader2, RefreshCw, X, FileText } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import Decimal from "decimal.js";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { format } from "date-fns";

interface WhtCert {
  id: string;
  cert_no: string;
  payment_date: string;
  period_code: string;
  wht_type: string;
  wht_rate: string;
  gross_amount: string;
  wht_amount: string;
  status: string;
  vendor_tax_id: string | null;
  payment: {
    id: string;
    payment_no: string;
    vendor: { id: string; code: string; name: string; name_th: string | null };
  };
}

interface ListResponse {
  data: WhtCert[];
  meta: { total: number; page: number; page_size: number };
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "rgba(108,178,120,0.15)", color: "#6CB278" },
  VOID: { bg: "rgba(184,92,80,0.12)", color: "var(--error)" },
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
};

function fmtMoney(val: string | number): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy");
}

interface PdfModalProps {
  certId: string;
  certNo: string;
  onClose: () => void;
}

function PdfModal({ certId, certNo, onClose }: PdfModalProps) {
  const pdfUrl = `/api/v1/tax-filings/wht-certs/${certId}/pdf`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          borderRadius: 8,
          width: "min(900px, 95vw)",
          height: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              ใบรับรองการหักภาษี ณ ที่จ่าย — {certNo}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: "var(--accent)",
                textDecoration: "none",
                padding: "3px 8px",
                border: "1px solid var(--accent)",
                borderRadius: 4,
              }}
            >
              Open in new tab ↗
            </a>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                padding: 2,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <iframe
          src={pdfUrl}
          style={{ flex: 1, border: "none", background: "#f5f5f5" }}
          title={`WHT Cert ${certNo}`}
        />
      </div>
    </div>
  );
}

export default function WhtCertsPage() {
  const [certs, setCerts] = useState<WhtCert[]>([]);
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

  const [previewCert, setPreviewCert] = useState<{ id: string; cert_no: string } | null>(null);

  const [bulkPeriod, setBulkPeriod] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCerts = useCallback(
    async (opts: {
      q: string;
      status: string;
      period: string;
      dateFrom: string;
      dateTo: string;
      page: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ page: String(opts.page), page_size: String(PAGE_SIZE) });
        if (opts.q.trim()) qs.set("q", opts.q.trim());
        if (opts.status) qs.set("status", opts.status);
        if (opts.period) qs.set("period", opts.period);
        if (opts.dateFrom) qs.set("date_from", opts.dateFrom);
        if (opts.dateTo) qs.set("date_to", opts.dateTo);
        const result = await apiClient.getPaged<WhtCert[]>(`/api/v1/tax-filings/wht-certs?${qs}`);
        setCerts(result.data ?? []);
        setTotal(result.meta?.total ?? 0);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load WHT certificates");
        setCerts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCerts({ q, status, period, dateFrom, dateTo, page });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function applyFilters(newPage = 1) {
    setPage(newPage);
    fetchCerts({ q, status, period, dateFrom, dateTo, page: newPage });
  }

  function handleQChange(val: string) {
    setQ(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchCerts({ q: val.trim(), status, period, dateFrom, dateTo, page: 1 });
    }, 350);
  }

  function handleFilterChange(
    setter: (v: string) => void,
    val: string,
    field: "status" | "period" | "dateFrom" | "dateTo"
  ) {
    setter(val);
    setPage(1);
    // Pass the new value directly to avoid capturing stale state in a closure
    fetchCerts({
      q,
      status: field === "status" ? val : status,
      period: field === "period" ? val : period,
      dateFrom: field === "dateFrom" ? val : dateFrom,
      dateTo: field === "dateTo" ? val : dateTo,
      page: 1,
    });
  }

  async function handleBulkRegenerate() {
    if (!bulkPeriod) {
      setBulkError("กรุณาระบุเดือน (YYYY-MM)");
      return;
    }
    setBulkLoading(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const result = await apiClient.post<{ count: number; period: string }>(
        "/api/v1/tax-filings/wht-certs/bulk-regenerate",
        { period: bulkPeriod }
      );
      setBulkResult(`สำเร็จ: ${result.count} ใบ (${result.period})`);
    } catch (err) {
      setBulkError(err instanceof ApiError ? err.message : "Bulk re-generate failed");
    } finally {
      setBulkLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns: ColumnDef<WhtCert, unknown>[] = [
    {
      accessorKey: "cert_no",
      header: "Cert No.",
      cell: ({ getValue }) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent)" }}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: "payment_date",
      header: "Payment Date",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {fmtDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      accessorFn: (row) => row.payment.vendor.name_th ?? row.payment.vendor.name,
      cell: ({ row, getValue }) => (
        <div>
          <div style={{ fontSize: 13 }}>{getValue() as string}</div>
          {row.original.payment.vendor.name_th && (
            <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
              {row.original.payment.vendor.code}
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "gross_amount",
      header: "Gross Amount",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)" }}>
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "wht_rate",
      header: "Rate",
      cell: ({ getValue }) => (
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {new Decimal(getValue() as string).times(100).toFixed(0)}%
        </span>
      ),
    },
    {
      accessorKey: "wht_amount",
      header: "WHT Amount",
      cell: ({ getValue }) => (
        <span
          style={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            color: "#C8A03C",
          }}
        >
          {fmtMoney(getValue() as string)}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ getValue }) => {
        const s = getValue() as string;
        const style = STATUS_COLORS[s] ?? STATUS_COLORS["ACTIVE"]!;
        const { bg, color } = style;
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
            {s}
          </span>
        );
      },
    },
    {
      id: "payment_link",
      header: "Payment",
      cell: ({ row }) => (
        <a
          href={`/ap/payments/${row.original.payment.id}`}
          style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", fontFamily: "var(--font-mono)" }}
        >
          {row.original.payment.payment_no}
        </a>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <button
          data-testid="action-pdf"
          onClick={() =>
            setPreviewCert({ id: row.original.id, cert_no: row.original.cert_no })
          }
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
          Preview PDF
        </button>
      ),
    },
  ];

  return (
    <div>
      {previewCert && (
        <PdfModal
          certId={previewCert.id}
          certNo={previewCert.cert_no}
          onClose={() => setPreviewCert(null)}
        />
      )}

      <PageHeader
        title="ใบรับรองการหักภาษี ณ ที่จ่าย"
        description="Withholding Tax Certificates (50 ทวิ)"
        breadcrumbs={[{ label: "Tax", href: "/tax/wht-certs" }, { label: "WHT Certs" }]}
      />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 16,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "0 0 220px" }}>
          <Search
            size={12}
            style={{
              position: "absolute",
              left: 9,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
            }}
          />
          <input
            type="text"
            data-testid="filter-vendor"
            value={q}
            onChange={(e) => handleQChange(e.target.value)}
            placeholder="ค้นหา cert_no หรือ vendor..."
            style={{ ...INPUT_STYLE, paddingLeft: 28, width: "100%" }}
          />
        </div>

        <select
          value={status}
          onChange={(e) => handleFilterChange(setStatus, e.target.value, "status")}
          style={{ ...SELECT_STYLE, width: 120 }}
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="VOID">Void</option>
        </select>

        <input
          type="month"
          value={period}
          onChange={(e) => handleFilterChange(setPeriod, e.target.value, "period")}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Filter by period"
        />

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFilterChange(setDateFrom, e.target.value, "dateFrom")}
          style={{ ...INPUT_STYLE, width: 130 }}
          title="Date from"
        />
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleFilterChange(setDateTo, e.target.value, "dateTo")}
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
        {total} certificate{total !== 1 ? "s" : ""}
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
          data={certs}
          pageSize={PAGE_SIZE}
          emptyMessage="ไม่พบใบรับรองการหักภาษี ณ ที่จ่าย"
        />
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 8,
            marginTop: 12,
          }}
        >
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

      {/* Bulk Re-generate */}
      <div
        style={{
          marginTop: 32,
          padding: "16px 20px",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>
          Bulk Re-generate Certificates
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Re-validates all active WHT certificates for a period (use after template changes).
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="month"
            value={bulkPeriod}
            onChange={(e) => {
              setBulkPeriod(e.target.value);
              setBulkResult(null);
              setBulkError(null);
            }}
            style={{ ...INPUT_STYLE, width: 140 }}
            placeholder="YYYY-MM"
          />
          <button
            onClick={handleBulkRegenerate}
            disabled={bulkLoading || !bulkPeriod}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: bulkLoading || !bulkPeriod ? "var(--surface)" : "var(--bg-elevated)",
              color:
                bulkLoading || !bulkPeriod ? "var(--text-dim)" : "var(--text-primary)",
              cursor: bulkLoading || !bulkPeriod ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {bulkLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Re-generate
          </button>
        </div>
        {bulkResult && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "#6CB278",
            }}
          >
            ✓ {bulkResult}
          </div>
        )}
        {bulkError && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: "var(--error)",
            }}
          >
            {bulkError}
          </div>
        )}
      </div>
    </div>
  );
}

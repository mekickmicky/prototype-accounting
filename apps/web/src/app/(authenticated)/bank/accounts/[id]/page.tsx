"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Loader2, Upload, GitMerge, ChevronLeft, ChevronRight } from "lucide-react";
import Decimal from "decimal.js";
import { apiClient, ApiError } from "@/lib/api-client";

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
  created_at: string;
  updated_at: string;
}

interface BankTransaction {
  id: string;
  txn_date: string;
  description: string | null;
  debit: string;
  credit: string;
  balance: string | null;
  bank_ref: string | null;
  status: string;
  reconciled_at: string | null;
}

interface TxnMeta {
  total: number;
  page: number;
  page_size: number;
}

function maskAccountNo(no: string | null): string {
  if (!no) return "—";
  if (no.length <= 4) return no;
  return "****" + no.slice(-4);
}

function fmtMoney(val: string): string {
  return new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Bangkok",
  });
}

const LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  marginBottom: 3,
};

const VALUE: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-primary)",
};

type ReconciledFilter = "all" | "unreconciled" | "reconciled";

const PAGE_SIZE = 20;

export default function BankAccountDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [txnMeta, setTxnMeta] = useState<TxnMeta>({ total: 0, page: 1, page_size: PAGE_SIZE });
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [txnError, setTxnError] = useState<string | null>(null);

  const [reconciledFilter, setReconciledFilter] = useState<ReconciledFilter>("all");
  const [page, setPage] = useState(1);

  const fetchAccount = useCallback(async () => {
    setLoadingAccount(true);
    setAccountError(null);
    try {
      const account = await apiClient.get<BankAccount>(`/api/v1/bank-accounts/${id}`);
      setAccount(account);
    } catch (err) {
      setAccountError(err instanceof ApiError ? err.message : "Failed to load account");
    } finally {
      setLoadingAccount(false);
    }
  }, [id]);

  const fetchTransactions = useCallback(async (p: number, filter: ReconciledFilter) => {
    setLoadingTxns(true);
    setTxnError(null);
    try {
      const qs = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      if (filter === "reconciled") qs.set("reconciled", "true");
      if (filter === "unreconciled") qs.set("reconciled", "false");
      const result = await apiClient.getPaged<BankTransaction[], TxnMeta>(
        `/api/v1/bank-accounts/${id}/transactions?${qs}`,
      );
      setTransactions(result.data ?? []);
      setTxnMeta(result.meta ?? { total: 0, page: p, page_size: PAGE_SIZE });
    } catch (err) {
      setTxnError(err instanceof ApiError ? err.message : "Failed to load transactions");
    } finally {
      setLoadingTxns(false);
    }
  }, [id]);

  useEffect(() => { fetchAccount(); }, [fetchAccount]);
  useEffect(() => { fetchTransactions(page, reconciledFilter); }, [fetchTransactions, page, reconciledFilter]);

  function handleFilterChange(f: ReconciledFilter) {
    setReconciledFilter(f);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(txnMeta.total / PAGE_SIZE));

  if (loadingAccount) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "40px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลด...</span>
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div>
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 5,
            fontSize: 13,
            color: "var(--error)",
            marginBottom: 12,
          }}
        >
          {accountError ?? "Bank account not found"}
        </div>
        <button
          onClick={() => router.push("/bank/accounts")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          <ArrowLeft size={12} />
          Back to Accounts
        </button>
      </div>
    );
  }

  const balance = new Decimal(account.balance ?? "0");

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border)",
          marginBottom: 20,
        }}
      >
        <div>
          <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            <a href="/bank/accounts" style={{ color: "inherit", textDecoration: "none" }}>Bank</a>
            {" / "}
            <a href="/bank/accounts" style={{ color: "inherit", textDecoration: "none" }}>Accounts</a>
            {" / "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{account.code}</span>
          </nav>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 400,
              lineHeight: 1.2,
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            {account.name}
          </h1>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {account.bank_name} · {maskAccountNo(account.account_number)} · {account.account_type ?? "current"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginTop: 4 }}>
          <button
            onClick={() => router.push(`/bank/import?account_id=${account.id}`)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 4,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <Upload size={12} />
            Import
          </button>
          <button
            onClick={() => router.push(`/bank/reconcile/${account.id}`)}
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
            <GitMerge size={12} />
            Reconcile
          </button>
        </div>
      </div>

      {/* Account info + balance cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginBottom: 24, alignItems: "start" }}>
        {/* Info card */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
              marginBottom: 14,
              paddingBottom: 6,
              borderBottom: "1px solid var(--border)",
            }}
          >
            ข้อมูลบัญชี · Account Info
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <div style={LABEL}>รหัสบัญชี</div>
              <div style={{ ...VALUE, fontFamily: "var(--font-mono)", fontSize: 12 }}>{account.code}</div>
            </div>
            <div>
              <div style={LABEL}>ธนาคาร</div>
              <div style={VALUE}>{account.bank_name}</div>
            </div>
            <div>
              <div style={LABEL}>ประเภทบัญชี</div>
              <div style={{ ...VALUE, textTransform: "capitalize" }}>{account.account_type ?? "—"}</div>
            </div>
            <div>
              <div style={LABEL}>เลขบัญชี</div>
              <div style={{ ...VALUE, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {account.account_number ?? "—"}
              </div>
            </div>
            <div>
              <div style={LABEL}>GL Account</div>
              <div style={{ ...VALUE, fontFamily: "var(--font-mono)", fontSize: 12 }}>{account.gl_account_code}</div>
            </div>
            <div>
              <div style={LABEL}>Status</div>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 500,
                  marginTop: 4,
                  background: account.is_active ? "rgba(108,178,120,0.15)" : "rgba(120,120,120,0.12)",
                  color: account.is_active ? "#6CB278" : "var(--text-dim)",
                }}
              >
                {account.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>

        {/* Balance card */}
        <div
          style={{
            background: "var(--bg-elevated)",
            border: `1px solid ${balance.lt(0) ? "var(--error)" : "var(--border)"}`,
            borderRadius: 6,
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
              marginBottom: 10,
            }}
          >
            ยอดเงิน · GL Balance
          </div>
          <div
            style={{
              fontSize: 28,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: balance.lt(0) ? "var(--error)" : "var(--text-primary)",
              lineHeight: 1,
              marginBottom: 4,
            }}
          >
            {fmtMoney(account.balance)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>บาท (THB)</div>
          <div style={{ marginTop: 12, fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <div>Updated: {fmtDate(account.updated_at)}</div>
          </div>
        </div>
      </div>

      {/* Transactions section */}
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        {/* Section header + filters */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
            }}
          >
            รายการธุรกรรม · Bank Transactions
            {txnMeta.total > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--text-dim)" }}>
                ({txnMeta.total.toLocaleString()} รายการ)
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {(["all", "unreconciled", "reconciled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                style={{
                  padding: "3px 10px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: reconciledFilter === f ? "var(--accent)" : "var(--border-strong)",
                  background: reconciledFilter === f ? "var(--accent)" : "transparent",
                  color: reconciledFilter === f ? "#fff" : "var(--text-muted)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textTransform: "capitalize",
                }}
              >
                {f === "all" ? "All" : f === "unreconciled" ? "Unreconciled" : "Reconciled"}
              </button>
            ))}
            {loadingTxns && <Loader2 size={12} style={{ color: "var(--text-dim)", marginLeft: 8 }} className="animate-spin" />}
          </div>
        </div>

        {txnError && (
          <div
            style={{
              padding: "10px 16px",
              background: "rgba(184,92,80,0.1)",
              fontSize: 12,
              color: "var(--error)",
            }}
          >
            {txnError}
          </div>
        )}

        {/* Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--bg-base)" }}>
              {["Date", "Description", "Bank Ref", "Debit", "Credit", "Running Balance", "Status"].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: "8px 12px",
                    textAlign: h === "Debit" || h === "Credit" || h === "Running Balance" ? "right" : "left",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--text-muted)",
                    borderBottom: "1px solid var(--border)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loadingTxns && transactions.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: "32px 16px", textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}
                >
                  {reconciledFilter === "all"
                    ? "ยังไม่มีรายการธุรกรรม — กด Import เพื่อนำเข้า"
                    : "ไม่พบรายการที่ตรงกับตัวกรอง"}
                </td>
              </tr>
            )}
            {transactions.map((txn, i) => {
              const debit = new Decimal(txn.debit ?? "0");
              const credit = new Decimal(txn.credit ?? "0");
              const isReconciled = !!txn.reconciled_at;
              return (
                <tr
                  key={txn.id}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <td style={{ padding: "8px 12px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {fmtDate(txn.txn_date)}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      color: "var(--text-primary)",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {txn.description ?? "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                    {txn.bank_ref ?? "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      color: debit.gt(0) ? "var(--error)" : "var(--text-dim)",
                    }}
                  >
                    {debit.gt(0) ? fmtMoney(txn.debit) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      color: credit.gt(0) ? "#6CB278" : "var(--text-dim)",
                    }}
                  >
                    {credit.gt(0) ? fmtMoney(txn.credit) : "—"}
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-muted)",
                    }}
                  >
                    {txn.balance != null ? fmtMoney(txn.balance) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "1px 7px",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 500,
                        background: isReconciled
                          ? "rgba(108,178,120,0.15)"
                          : txn.status === "IGNORED"
                          ? "rgba(120,120,120,0.12)"
                          : "rgba(180,140,90,0.15)",
                        color: isReconciled
                          ? "#6CB278"
                          : txn.status === "IGNORED"
                          ? "var(--text-dim)"
                          : "var(--accent)",
                      }}
                    >
                      {isReconciled ? "Reconciled" : txn.status === "IGNORED" ? "Ignored" : "Unmatched"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              Page {page} of {totalPages} · {txnMeta.total} รายการ
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: page === 1 ? "var(--text-dim)" : "var(--text-primary)",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  fontSize: 11,
                  borderRadius: 4,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  color: page === totalPages ? "var(--text-dim)" : "var(--text-primary)",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <ChevronRight size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

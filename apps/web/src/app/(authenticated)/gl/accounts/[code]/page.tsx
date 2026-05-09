"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { D, formatTHB, type Decimal } from "@wind-acc/shared";
import { apiClient, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/ui/page-header";
import { MoneyDisplay } from "@/components/ui/money-display";
import { EmptyState } from "@/components/ui/empty-state";
import { PeriodPicker, type PeriodOption } from "@/components/ui/period-picker";
import { BranchPicker } from "@/components/ui/branch-picker";

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "สินทรัพย์",
  LIABILITY: "หนี้สิน",
  EQUITY: "ส่วนของผู้ถือหุ้น",
  REVENUE: "รายได้",
  EXPENSE: "ค่าใช้จ่าย",
};

const TYPE_BADGE_CLASS: Record<AccountType, string> = {
  ASSET:     "text-[--status-paid] border-[--status-paid] bg-[rgba(74,122,140,0.1)]",
  LIABILITY: "text-[--error] border-[--error] bg-[rgba(184,92,80,0.1)]",
  EQUITY:    "text-[--accent] border-[--accent] bg-[rgba(184,138,100,0.1)]",
  REVENUE:   "text-[--status-posted] border-[--status-posted] bg-[rgba(107,142,127,0.1)]",
  EXPENSE:   "text-[--warning] border-[--warning] bg-[rgba(200,163,82,0.1)]",
};

interface SimpleAccount {
  code: string;
  name_th: string;
  name_en: string;
}

interface AccountLineJE {
  id: string;
  je_no: string;
  entry_date: string;
  description: string;
  branch_code: string;
}

interface AccountLine {
  id: string;
  je_id: string;
  line_no: number;
  account_code: string;
  branch_code: string;
  debit: string;
  credit: string;
  description: string | null;
  created_at: string;
  je: AccountLineJE;
}

interface AccountDetailData {
  code: string;
  name_en: string;
  name_th: string;
  type: AccountType;
  parent_code: string | null;
  is_postable: boolean;
  is_active: boolean;
  parent_chain: SimpleAccount[];
  children: SimpleAccount[];
  recent_lines: AccountLine[];
}

interface TransactionRow {
  line: AccountLine;
  running_balance: Decimal;
}

function derivePeriodCode(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

interface PeriodRecord {
  code: string;
  status: "OPEN" | "CLOSED";
}

export default function AccountDetailPage() {
  const params = useParams();
  const code = params.code as string;

  const [account, setAccount] = useState<AccountDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [periodsMap, setPeriodsMap] = useState<Map<string, "OPEN" | "CLOSED">>(new Map());

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<AccountDetailData>(
        `/api/v1/accounts/${encodeURIComponent(code)}`
      );
      setAccount(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  // Fetch period statuses so the period picker shows OPEN vs CLOSED accurately
  useEffect(() => {
    apiClient.get<PeriodRecord[]>("/api/v1/periods")
      .then((periods) => {
        setPeriodsMap(new Map(periods.map((p) => [p.code, p.status])));
      })
      .catch(() => {
        // Non-critical: fall back to treating all periods as OPEN
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 gap-2">
        <Loader2 size={16} className="animate-spin text-[--text-dim]" />
        <span className="text-[13px] text-[--text-muted]">กำลังโหลด...</span>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div className="p-4 rounded border text-[13px] bg-[rgba(184,92,80,0.1)] border-[--error] text-[--error]">
        {error ?? "Account not found"}
      </div>
    );
  }

  // Derive unique periods from lines, using actual status from the fetched periods map
  const periodSet = new Set<string>();
  account.recent_lines.forEach((l) => periodSet.add(derivePeriodCode(l.je.entry_date)));
  const periodOptions: PeriodOption[] = Array.from(periodSet)
    .sort()
    .map((p) => ({ code: p, status: periodsMap.get(p) ?? "OPEN" }));

  // Filter and sort lines
  const filteredLines = account.recent_lines.filter((l) => {
    if (selectedPeriod && derivePeriodCode(l.je.entry_date) !== selectedPeriod) return false;
    if (selectedBranch !== "ALL" && l.branch_code !== selectedBranch) return false;
    return true;
  });

  const sortedLines = [...filteredLines].sort((a, b) => {
    const dateDiff =
      new Date(a.je.entry_date).getTime() - new Date(b.je.entry_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // Compute running balances — debit increases balance, credit decreases
  let runningBal = D("0");
  const rows: TransactionRow[] = sortedLines.map((l) => {
    runningBal = runningBal.plus(D(l.debit.toString())).minus(D(l.credit.toString()));
    return { line: l, running_balance: runningBal };
  });

  const closingBalance = rows.length > 0 ? rows[rows.length - 1]!.running_balance : D("0");
  const totalDebit = sortedLines.reduce((s, l) => s.plus(D(l.debit.toString())), D("0"));
  const totalCredit = sortedLines.reduce((s, l) => s.plus(D(l.credit.toString())), D("0"));

  const breadcrumbs = [
    { label: "GL" },
    { label: "Accounts", href: "/gl/accounts" },
    ...account.parent_chain.map((p) => ({
      label: `${p.code} ${p.name_th}`,
      href: `/gl/accounts/${p.code}`,
    })),
    { label: account.code },
  ];

  return (
    <div>
      <PageHeader
        title={account.name_th}
        description={`${account.code} · ${account.name_en}`}
        breadcrumbs={breadcrumbs}
      />

      {/* Account metadata + balance row */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] rounded-[3px] border ${TYPE_BADGE_CLASS[account.type]}`}
        >
          {TYPE_LABELS[account.type]}
        </span>

        {!account.is_postable && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] rounded-[3px] border text-[--text-muted] border-[--border]">
            Header
          </span>
        )}

        {!account.is_active && (
          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] rounded-[3px] border text-slate-400 border-slate-400 bg-slate-400/10">
            Inactive
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-widest text-[--text-muted]">
            Balance
          </span>
          <span className="text-[18px] font-light tabular-nums text-[--text-primary] font-[--font-mono]">
            {formatTHB(closingBalance)}
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <span className="text-[12px] text-[--text-muted]">Period:</span>
        <PeriodPicker
          value={selectedPeriod}
          onChange={setSelectedPeriod}
          periods={periodOptions}
          placeholder="ทุกงวด"
        />
        <span className="text-[12px] text-[--text-muted] ml-2">Branch:</span>
        <BranchPicker value={selectedBranch} onChange={setSelectedBranch} allowAll />
      </div>

      {/* Transaction ledger */}
      <div className="mt-4 overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการ"
            description="No posted transactions for this account with the selected filters."
          />
        ) : (
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-strong)" }}>
                {(["Date", "JE No", "Description", "Debit", "Credit", "Balance"] as const).map(
                  (col) => (
                    <th
                      key={col}
                      style={{
                        padding: "8px 12px",
                        textAlign: col === "Description" || col === "Date" || col === "JE No"
                          ? "left"
                          : "right",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-muted)",
                        whiteSpace: "nowrap",
                        width:
                          col === "Date" ? 80
                          : col === "JE No" ? 110
                          : col === "Description" ? undefined
                          : 110,
                      }}
                    >
                      {col}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ line, running_balance }) => (
                <tr
                  key={line.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    transition: "background 100ms",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      "var(--surface)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background = "")
                  }
                >
                  <td
                    style={{
                      padding: "7px 12px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(line.je.entry_date)}
                  </td>
                  <td style={{ padding: "7px 12px", whiteSpace: "nowrap" }}>
                    <Link
                      href={`/gl/journal-entries/${line.je_id}`}
                      style={{
                        color: "var(--accent)",
                        textDecoration: "none",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                      }}
                    >
                      {line.je.je_no}
                    </Link>
                  </td>
                  <td
                    style={{
                      padding: "7px 12px",
                      color: "var(--text-primary)",
                      maxWidth: 320,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {line.description ?? line.je.description}
                  </td>
                  <td style={{ padding: "7px 12px", textAlign: "right" }}>
                    {D(line.debit.toString()).isZero() ? (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    ) : (
                      <span
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatTHB(D(line.debit.toString()))}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "7px 12px", textAlign: "right" }}>
                    {D(line.credit.toString()).isZero() ? (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    ) : (
                      <span
                        style={{
                          color: "var(--text-primary)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatTHB(D(line.credit.toString()))}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "7px 12px",
                      textAlign: "right",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                    }}
                  >
                    <MoneyDisplay value={running_balance.toString()} showZero />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border-strong)" }}>
                <td
                  colSpan={3}
                  style={{
                    padding: "7px 12px",
                    fontSize: 11,
                    color: "var(--text-muted)",
                  }}
                >
                  {rows.length} transaction{rows.length !== 1 ? "s" : ""}
                </td>
                <td
                  style={{
                    padding: "7px 12px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {totalDebit.isZero() ? "—" : formatTHB(totalDebit)}
                </td>
                <td
                  style={{
                    padding: "7px 12px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                  }}
                >
                  {totalCredit.isZero() ? "—" : formatTHB(totalCredit)}
                </td>
                <td
                  style={{
                    padding: "7px 12px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  <MoneyDisplay value={closingBalance.toString()} showZero />
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

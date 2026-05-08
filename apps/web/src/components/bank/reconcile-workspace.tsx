"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCw,
  Upload,
  Link2,
  Ban,
  FilePlus2,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BankAccount {
  id: string;
  code: string;
  name: string;
  bank_name: string;
  account_number: string | null;
  gl_account_code: string;
  balance: string;
}

interface BankTxn {
  id: string;
  txn_date: string;
  description: string;
  debit: string;
  credit: string;
  bank_ref: string | null;
  reconciled_with_id: string | null;
  reconciled_with_type: string | null;
}

interface Document {
  type: "RECEIPT" | "PAYMENT";
  id: string;
  no: string;
  date: string;
  amount: string;
  counterpartyName: string;
}

interface Suggestion {
  document_type: "RECEIPT" | "PAYMENT";
  document_id: string;
  document_no: string;
  document_date: string;
  document_amount: string;
  confidence: number;
  tier: string;
  counterparty_name: string;
  days_diff: number;
}

interface ReconciliationView {
  bank_account_id: string;
  unmatched_bank_txns: BankTxn[];
  unmatched_documents: Document[];
  suggestions_per_txn: Record<string, Suggestion[]>;
}

interface CreateJEResult {
  je_id: string;
  je_no: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  if (isNaN(n)) return "—";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: "Asia/Bangkok",
    });
  } catch {
    return dateStr.slice(0, 10);
  }
}

function txnDirection(txn: BankTxn): { sign: "+" | "−"; amount: string; isCredit: boolean } {
  const cr = parseFloat(txn.credit);
  if (cr > 0.005) return { sign: "+", amount: txn.credit, isCredit: true };
  return { sign: "−", amount: txn.debit, isCredit: false };
}

// ─── Style helpers ────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "secondary" | "ghost";
type BtnSize = "sm" | "md";

function btnStyle(variant: BtnVariant, size: BtnSize = "md"): React.CSSProperties {
  const pad = size === "sm" ? "5px 12px" : "7px 16px";
  const fs = size === "sm" ? 11 : 12;
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: pad,
    fontSize: fs,
    fontWeight: 500,
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  };
  if (variant === "primary")
    return { ...base, background: "var(--accent)", color: "#fff", border: "none" };
  if (variant === "secondary")
    return {
      ...base,
      background: "transparent",
      border: "1px solid var(--border-strong)",
      color: "var(--text-primary)",
    };
  return {
    ...base,
    background: "transparent",
    border: "none",
    color: "var(--text-muted)",
  };
}

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const CARD_HEADER: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 14px",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg-base)",
  flexShrink: 0,
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

const FIELD_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--text-muted)",
  marginBottom: 5,
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 13,
  borderRadius: 4,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function FooterStat({
  label,
  value,
  valueStyle,
}: {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 500,
          color: "var(--text-primary)",
          ...valueStyle,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Modal({
  children,
  onClose,
  width = 480,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          width: "100%",
          maxWidth: width,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 14px 0" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}>
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ReconcileWorkspace({ accountId }: { accountId: string }) {
  const router = useRouter();

  const [account, setAccount] = useState<BankAccount | null>(null);
  const [view, setView] = useState<ReconciliationView | null>(null);
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<"RECEIPT" | "PAYMENT" | null>(null);
  const [hideIgnored, setHideIgnored] = useState(true);
  const [searchQ, setSearchQ] = useState("");

  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    txnId: string;
    docType: "RECEIPT" | "PAYMENT";
    docId: string;
    suggestion: Suggestion | null;
  } | null>(null);

  const [ignoreModal, setIgnoreModal] = useState<{ txnId: string } | null>(null);
  const [ignoreReason, setIgnoreReason] = useState("");

  const [jeModal, setJeModal] = useState<{ txn: BankTxn } | null>(null);
  const [jeDesc, setJeDesc] = useState("");
  const [jeBranch, setJeBranch] = useState("TL");
  const [jeExpenseAccount, setJeExpenseAccount] = useState("52010");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [accountRes, viewRes, txnsRes] = await Promise.all([
        apiClient.get<BankAccount>(`/api/v1/bank-accounts/${accountId}`),
        apiClient.get<ReconciliationView>(`/api/v1/bank/reconciliation/${accountId}`),
        apiClient.get<{ data: Array<{ debit: string; credit: string }> } | Array<{ debit: string; credit: string }>>(
          `/api/v1/bank-accounts/${accountId}/transactions?page=1&page_size=500`,
        ),
      ]);

      setAccount(accountRes);
      setView(viewRes);

      const allTxns = Array.isArray(txnsRes)
        ? txnsRes
        : (txnsRes as { data: Array<{ debit: string; credit: string }> }).data ?? [];
      const stmt = allTxns.reduce(
        (sum, t) => sum + parseFloat(t.credit || "0") - parseFloat(t.debit || "0"),
        0,
      );
      setStatementBalance(stmt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load reconciliation data");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function flash(text: string, isError = false) {
    setActionMsg({ text, isError });
    setTimeout(() => setActionMsg(null), 4500);
  }

  async function handleConfirmMatch(txnId: string, docType: "RECEIPT" | "PAYMENT", docId: string) {
    setActionLoading(true);
    try {
      await apiClient.post("/api/v1/bank/reconcile", {
        bank_txn_id: txnId,
        document_type: docType,
        document_id: docId,
      });
      flash("Matched successfully");
      setConfirmModal(null);
      setSelectedTxnId(null);
      setSelectedDocId(null);
      setSelectedDocType(null);
      await loadData();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Match failed", true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIgnore() {
    if (!ignoreModal) return;
    setActionLoading(true);
    try {
      await apiClient.post("/api/v1/bank/ignore-txn", {
        bank_txn_id: ignoreModal.txnId,
        reason: ignoreReason,
      });
      flash("Transaction marked as ignored");
      setIgnoreModal(null);
      setIgnoreReason("");
      setSelectedTxnId(null);
      await loadData();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Failed to ignore", true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateJE() {
    if (!jeModal) return;
    const txn = jeModal.txn;
    const { amount, isCredit } = (() => {
      const cr = parseFloat(txn.credit);
      return cr > 0.005
        ? { amount: txn.credit, isCredit: true }
        : { amount: txn.debit, isCredit: false };
    })();

    const glAcct = account?.gl_account_code ?? "11020";
    const lines = isCredit
      ? [
          { account_code: glAcct, branch_code: jeBranch, credit: amount, description: "Received" },
          { account_code: jeExpenseAccount, branch_code: jeBranch, debit: amount, description: jeDesc || txn.description },
        ]
      : [
          { account_code: jeExpenseAccount, branch_code: jeBranch, debit: amount, description: jeDesc || txn.description },
          { account_code: glAcct, branch_code: jeBranch, credit: amount, description: "Bank payment" },
        ];

    setActionLoading(true);
    try {
      const result = await apiClient.post<CreateJEResult>("/api/v1/bank/create-je-from-txn", {
        bank_txn_id: txn.id,
        je: {
          entry_date: txn.txn_date.slice(0, 10),
          branch_code: jeBranch,
          description: jeDesc || txn.description,
          lines,
        },
      });
      flash(`JE ${result.je_no} created and posted`);
      setJeModal(null);
      setJeDesc("");
      setSelectedTxnId(null);
      await loadData();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Failed to create JE", true);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAutoMatchAll() {
    if (!view) return;
    setActionLoading(true);
    let matched = 0;
    try {
      for (const txn of view.unmatched_bank_txns) {
        const suggestions = view.suggestions_per_txn[txn.id] ?? [];
        const top = suggestions.find((s) => s.tier === "AUTO_CONFIRM" || s.confidence >= 0.95);
        if (top) {
          try {
            await apiClient.post("/api/v1/bank/reconcile", {
              bank_txn_id: txn.id,
              document_type: top.document_type,
              document_id: top.document_id,
            });
            matched++;
          } catch {
            // individual failure — continue
          }
        }
      }
      flash(`Auto-matched ${matched} transaction${matched !== 1 ? "s" : ""}`);
      await loadData();
    } catch (err) {
      flash(err instanceof ApiError ? err.message : "Auto-match failed", true);
    } finally {
      setActionLoading(false);
    }
  }

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const selectedTxn = view?.unmatched_bank_txns.find((t) => t.id === selectedTxnId) ?? null;
  const suggestions: Suggestion[] = selectedTxnId ? (view?.suggestions_per_txn[selectedTxnId] ?? []) : [];
  const bookBalance = parseFloat(account?.balance ?? "0");
  const difference = statementBalance - bookBalance;

  const filteredTxns = (view?.unmatched_bank_txns ?? []).filter((t) => {
    if (hideIgnored && t.reconciled_with_type === "IGNORED") return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        (t.bank_ref ?? "").toLowerCase().includes(q) ||
        t.credit.includes(q) ||
        t.debit.includes(q)
      );
    }
    return true;
  });

  const filteredDocs = (view?.unmatched_documents ?? []).filter((d) => {
    if (!searchQ) return true;
    const q = searchQ.toLowerCase();
    return (
      d.no.toLowerCase().includes(q) ||
      d.counterpartyName.toLowerCase().includes(q) ||
      d.amount.includes(q)
    );
  });

  // ─── Early returns ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "60px 0", color: "var(--text-muted)" }}>
        <Loader2 size={16} className="animate-spin" />
        <span style={{ fontSize: 13 }}>กำลังโหลดข้อมูล reconcile…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "16px 20px", background: "rgba(184,92,80,0.08)", border: "1px solid var(--error)", borderRadius: 6, fontSize: 13, color: "var(--error)", display: "flex", alignItems: "center", gap: 8 }}>
        <AlertTriangle size={14} />
        {error}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 18 }}>
        <nav style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
          <a href="/bank/accounts" style={{ color: "inherit", textDecoration: "none" }}>Bank</a>
          {" / "}
          <span>Reconciliation</span>
          {account && (
            <>
              {" / "}
              <span style={{ color: "var(--text-primary)" }}>
                {account.bank_name} · {account.name}
              </span>
            </>
          )}
        </nav>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              Bank Reconciliation
            </h1>
            {account && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {account.bank_name}
                {account.account_number ? ` · ****${account.account_number.slice(-4)}` : ""}
                {" · GL "}
                {account.gl_account_code}
                {" · "}
                {filteredTxns.length} รายการรอ reconcile
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
            <button
              onClick={() => router.push(`/bank/import?account_id=${accountId}`)}
              style={btnStyle("secondary")}
            >
              <Upload size={12} />
              Import more
            </button>
            <button
              onClick={handleAutoMatchAll}
              disabled={actionLoading}
              style={{ ...btnStyle("secondary"), opacity: actionLoading ? 0.6 : 1 }}
            >
              {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Auto-match all
            </button>
            <button
              onClick={loadData}
              style={btnStyle("secondary")}
            >
              <RefreshCw size={12} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: "var(--text-primary)", flexShrink: 0 }}>
          <input
            type="checkbox"
            checked={hideIgnored}
            onChange={(e) => setHideIgnored(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Hide ignored
        </label>
        <input
          type="text"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          placeholder="Search description or amount…"
          style={{
            padding: "6px 10px",
            fontSize: 12,
            borderRadius: 4,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            outline: "none",
            width: 240,
          }}
        />
        {actionMsg && (
          <div style={{
            fontSize: 12,
            padding: "5px 12px",
            borderRadius: 4,
            background: actionMsg.isError ? "rgba(184,92,80,0.1)" : "rgba(108,178,120,0.1)",
            color: actionMsg.isError ? "var(--error)" : "#6CB278",
            border: `1px solid ${actionMsg.isError ? "var(--error)" : "rgba(108,178,120,0.4)"}`,
          }}>
            {actionMsg.text}
          </div>
        )}
      </div>

      {/* Two-pane grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* LEFT: Bank transactions */}
        <div style={CARD}>
          <div style={CARD_HEADER}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Bank Transactions · ธุรกรรมจากธนาคาร
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {filteredTxns.length} unmatched
            </span>
          </div>
          <div style={{ overflowY: "auto", flex: 1, maxHeight: 520 }}>
            {filteredTxns.length === 0 ? (
              <div style={{ padding: "40px 16px", textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>
                {searchQ ? "No results match your search." : "ไม่มีรายการรอ reconcile"}
              </div>
            ) : (
              filteredTxns.map((txn) => {
                const { sign, amount, isCredit } = txnDirection(txn);
                const isSelected = txn.id === selectedTxnId;
                const isIgnored = txn.reconciled_with_type === "IGNORED";
                return (
                  <div
                    key={txn.id}
                    onClick={() => {
                      setSelectedTxnId(isSelected ? null : txn.id);
                      setSelectedDocId(null);
                      setSelectedDocType(null);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--border)",
                      cursor: "pointer",
                      background: isSelected ? "rgba(200,150,122,.1)" : "transparent",
                      borderLeft: `3px solid ${isSelected ? "var(--accent)" : "transparent"}`,
                      opacity: isIgnored ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                      <strong style={{ fontSize: 12, color: "var(--text-primary)" }}>
                        {fmtDate(txn.txn_date)}
                      </strong>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, color: isCredit ? "#6CB278" : "var(--error)" }}>
                        {sign}{fmtMoney(amount)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {txn.description}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                      {txn.bank_ref ? (
                        <>Bank ref: <span style={{ fontFamily: "var(--font-mono)" }}>{txn.bank_ref}</span></>
                      ) : (
                        <span style={{ fontStyle: "italic" }}>no bank ref</span>
                      )}
                      {isIgnored && (
                        <span style={{ marginLeft: 8, color: "var(--text-muted)", fontStyle: "italic" }}>[ignored]</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Suggestions / match panel */}
        <div style={CARD}>
          <div style={CARD_HEADER}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              Match Suggestions · ข้อเสนอจับคู่
            </div>
            {selectedTxn && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {(() => {
                  const { sign, amount } = txnDirection(selectedTxn);
                  return `${sign}฿${fmtMoney(amount)} · ${fmtDate(selectedTxn.txn_date)}`;
                })()}
              </span>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", maxHeight: 520, padding: "14px" }}>
            {!selectedTxn ? (
              <div style={{ padding: "48px 16px", textAlign: "center", fontSize: 12, color: "var(--text-dim)" }}>
                <div style={{ fontSize: 24, marginBottom: 10, opacity: 0.4 }}>←</div>
                <div>เลือกรายการธนาคารทางซ้ายเพื่อดูข้อเสนอจับคู่</div>
              </div>
            ) : (
              <>
                {/* Auto-suggestions */}
                <div style={{ ...SECTION_LABEL, marginBottom: 10 }}>
                  Auto-suggestions ranked by confidence
                </div>

                {suggestions.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 14, fontStyle: "italic", padding: "10px 0" }}>
                    No automatic suggestions found for this transaction.
                  </div>
                ) : (
                  suggestions.map((sug) => {
                    const conf = sug.confidence;
                    const isHigh = conf >= 0.95;
                    const isMid = conf >= 0.7;
                    return (
                      <div
                        key={sug.document_id}
                        style={{
                          border: `1px solid ${isHigh ? "rgba(108,178,120,0.5)" : "var(--border)"}`,
                          borderRadius: 5,
                          padding: "10px 12px",
                          marginBottom: 10,
                          background: isHigh ? "rgba(108,178,120,0.05)" : "transparent",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                          <strong style={{ fontSize: 13, color: isHigh ? "#6CB278" : "var(--text-primary)" }}>
                            {sug.document_no} · {sug.document_type === "RECEIPT" ? "Receipt" : "Payment"}
                          </strong>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isHigh ? "#6CB278" : isMid ? "var(--accent)" : "var(--text-muted)" }}>
                            Confidence {(conf * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>
                          {sug.counterparty_name} · {fmtDate(sug.document_date)}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", marginBottom: 8 }}>
                          Amount: {fmtMoney(sug.document_amount)}
                          {sug.days_diff === 0 ? " — same day" : ` — ${Math.abs(sug.days_diff)}d off`}
                        </div>
                        <div style={{ height: 3, background: "var(--bg-base)", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(conf * 100)}%`, background: isHigh ? "#6CB278" : isMid ? "var(--accent)" : "var(--text-dim)", borderRadius: 2 }} />
                        </div>
                        <button
                          onClick={() =>
                            setConfirmModal({
                              txnId: selectedTxn.id,
                              docType: sug.document_type,
                              docId: sug.document_id,
                              suggestion: sug,
                            })
                          }
                          style={btnStyle(isHigh ? "primary" : "secondary", "sm")}
                        >
                          <Check size={11} />
                          {isHigh ? "✓ Confirm Match" : "Match instead"}
                        </button>
                      </div>
                    );
                  })
                )}

                {/* Manual doc selection */}
                {filteredDocs.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                    <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>
                      Manual match — receipts / payments
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
                      {filteredDocs.map((doc) => {
                        const isDocSelected = doc.id === selectedDocId;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => {
                              setSelectedDocId(isDocSelected ? null : doc.id);
                              setSelectedDocType(isDocSelected ? null : doc.type);
                            }}
                            style={{
                              padding: "8px 12px",
                              borderBottom: "1px solid var(--border)",
                              cursor: "pointer",
                              background: isDocSelected ? "rgba(200,150,122,.1)" : "transparent",
                              borderLeft: `2px solid ${isDocSelected ? "var(--accent)" : "transparent"}`,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div>
                                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>{doc.no}</span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                                  {doc.type === "RECEIPT" ? "Receipt" : "Payment"}
                                </span>
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                                {fmtMoney(doc.amount)}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                              {doc.counterpartyName} · {fmtDate(doc.date)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {selectedDocId && selectedDocType && (
                      <button
                        onClick={() =>
                          setConfirmModal({
                            txnId: selectedTxn.id,
                            docType: selectedDocType,
                            docId: selectedDocId,
                            suggestion: null,
                          })
                        }
                        disabled={actionLoading}
                        style={{ ...btnStyle("primary"), marginTop: 10, opacity: actionLoading ? 0.6 : 1 }}
                      >
                        <Link2 size={12} />
                        Match selected
                      </button>
                    )}
                  </div>
                )}

                {/* Other actions */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                  <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>Other actions</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setJeModal({ txn: selectedTxn });
                        setJeDesc(selectedTxn.description);
                      }}
                      style={btnStyle("secondary", "sm")}
                    >
                      <FilePlus2 size={12} />
                      Create JE from txn
                    </button>
                    <button
                      onClick={() => {
                        setIgnoreModal({ txnId: selectedTxn.id });
                        setIgnoreReason("");
                      }}
                      style={btnStyle("ghost", "sm")}
                    >
                      <Ban size={12} />
                      Mark as ignored
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
                    "Create JE" สร้าง JE ใหม่ Dr. Bank Fee · Cr. Cash/Bank — เหมาะสำหรับค่าธรรมเนียมที่ยังไม่ได้บันทึก
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Footer balance summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        marginTop: 14,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "14px 18px",
      }}>
        <FooterStat label="Bank Balance (statement)" value={fmtMoney(statementBalance)} />
        <FooterStat
          label={`Book Balance (GL ${account?.gl_account_code ?? "—"})`}
          value={fmtMoney(account?.balance ?? "0")}
        />
        <FooterStat
          label="Difference"
          value={fmtMoney(Math.abs(difference))}
          valueStyle={{ color: Math.abs(difference) < 0.01 ? "#6CB278" : "var(--error)" }}
        />
        <FooterStat
          label="Status"
          value={
            filteredTxns.length === 0 && Math.abs(difference) < 0.01
              ? "Balanced ✓"
              : `Reconciling — ${filteredTxns.length} left`
          }
          valueStyle={{
            fontSize: 14,
            color:
              filteredTxns.length === 0 && Math.abs(difference) < 0.01
                ? "#6CB278"
                : "var(--accent)",
          }}
        />
      </div>

      {/* ─── Confirm match modal ──────────────────────────────────────────────── */}
      {confirmModal && (
        <Modal onClose={() => setConfirmModal(null)} width={520}>
          <div style={{ padding: "4px 24px 24px" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
              Confirm Match
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18 }}>
              Review the match before confirming. This can be reversed with "Unmatch."
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {/* Bank txn side */}
              <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 5, padding: "12px 14px" }}>
                <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>Bank Transaction</div>
                {(() => {
                  const txn = view?.unmatched_bank_txns.find((t) => t.id === confirmModal.txnId);
                  if (!txn) return null;
                  const { sign, amount, isCredit } = txnDirection(txn);
                  return (
                    <>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500, color: isCredit ? "#6CB278" : "var(--error)" }}>
                        {sign}{fmtMoney(amount)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 5 }}>{txn.description}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{fmtDate(txn.txn_date)}</div>
                      {txn.bank_ref && (
                        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginTop: 4 }}>
                          {txn.bank_ref}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Document side */}
              <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 5, padding: "12px 14px" }}>
                <div style={{ ...SECTION_LABEL, marginBottom: 8 }}>
                  {confirmModal.docType === "RECEIPT" ? "Receipt" : "Payment"}
                </div>
                {confirmModal.suggestion ? (
                  <>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>
                      {fmtMoney(confirmModal.suggestion.document_amount)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 5 }}>
                      {confirmModal.suggestion.counterparty_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {confirmModal.suggestion.document_no} · {fmtDate(confirmModal.suggestion.document_date)}
                    </div>
                    <div style={{ fontSize: 10, color: "#6CB278", marginTop: 6 }}>
                      Confidence: {(confirmModal.suggestion.confidence * 100).toFixed(0)}%
                    </div>
                  </>
                ) : (
                  (() => {
                    const doc = view?.unmatched_documents.find((d) => d.id === confirmModal.docId);
                    if (!doc) return null;
                    return (
                      <>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 500 }}>
                          {fmtMoney(doc.amount)}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 5 }}>{doc.counterpartyName}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                          {doc.no} · {fmtDate(doc.date)}
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmModal(null)} style={btnStyle("secondary")}>
                Cancel
              </button>
              <button
                onClick={() => handleConfirmMatch(confirmModal.txnId, confirmModal.docType, confirmModal.docId)}
                disabled={actionLoading}
                style={{ ...btnStyle("primary"), opacity: actionLoading ? 0.6 : 1 }}
              >
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Confirm Match
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Ignore modal ─────────────────────────────────────────────────────── */}
      {ignoreModal && (
        <Modal onClose={() => setIgnoreModal(null)}>
          <div style={{ padding: "4px 24px 24px" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
              Mark as Ignored
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              This transaction will be hidden from the default view. Toggle "Show ignored" to see it again.
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={FIELD_LABEL}>Reason (optional)</label>
              <input
                type="text"
                value={ignoreReason}
                onChange={(e) => setIgnoreReason(e.target.value)}
                placeholder="e.g. Bank fee already recorded, inter-account transfer…"
                autoFocus
                style={INPUT}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleIgnore();
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setIgnoreModal(null)} style={btnStyle("secondary")}>Cancel</button>
              <button onClick={handleIgnore} disabled={actionLoading} style={{ ...btnStyle("primary"), opacity: actionLoading ? 0.6 : 1 }}>
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                Mark as Ignored
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Create JE modal ─────────────────────────────────────────────────── */}
      {jeModal && (
        <Modal onClose={() => setJeModal(null)} width={520}>
          <div style={{ padding: "4px 24px 24px" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)", marginBottom: 4 }}>
              Create Journal Entry from Transaction
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
              Creates and posts a JE, then links this bank transaction. Use for fees, charges, or items not already recorded.
            </div>

            {/* Txn summary */}
            {(() => {
              const { sign, amount, isCredit } = txnDirection(jeModal.txn);
              return (
                <div style={{ background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 5, padding: "10px 14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 3 }}>Transaction</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 17, fontWeight: 500, color: isCredit ? "#6CB278" : "var(--error)" }}>
                    {sign}{fmtMoney(amount)}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 2 }}>{jeModal.txn.description}</div>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                    {fmtDate(jeModal.txn.txn_date)} · {isCredit ? `Dr GL ${account?.gl_account_code ?? "11020"}` : `Cr GL ${account?.gl_account_code ?? "11020"}`}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={FIELD_LABEL}>Branch</label>
                <select
                  value={jeBranch}
                  onChange={(e) => setJeBranch(e.target.value)}
                  style={{ ...INPUT, appearance: "none" as const }}
                >
                  <option value="TL">Thonglor (TL)</option>
                  <option value="EK">Ekkamai (EK)</option>
                  <option value="RAMA9">Rama 9</option>
                </select>
              </div>
              <div>
                <label style={FIELD_LABEL}>Counterpart account</label>
                <input
                  type="text"
                  value={jeExpenseAccount}
                  onChange={(e) => setJeExpenseAccount(e.target.value)}
                  placeholder="52010"
                  style={{ ...INPUT, fontFamily: "var(--font-mono)" }}
                />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={FIELD_LABEL}>Description</label>
              <input
                type="text"
                value={jeDesc}
                onChange={(e) => setJeDesc(e.target.value)}
                placeholder="JE description…"
                style={INPUT}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setJeModal(null)} style={btnStyle("secondary")}>Cancel</button>
              <button
                onClick={handleCreateJE}
                disabled={actionLoading || !jeDesc.trim()}
                style={{ ...btnStyle("primary"), opacity: actionLoading || !jeDesc.trim() ? 0.6 : 1 }}
              >
                {actionLoading ? <Loader2 size={12} className="animate-spin" /> : <FilePlus2 size={12} />}
                Create & Post JE
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

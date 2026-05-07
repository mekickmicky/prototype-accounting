"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { D, sumD, formatTHB } from "@wind-acc/shared";
import { AccountPicker, type AccountOption } from "@/components/ui/account-picker";
import { BranchPicker } from "@/components/ui/branch-picker";
import { MoneyInput } from "@/components/ui/money-input";
import { DatePickerTH } from "@/components/ui/date-picker-th";

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const SOURCE_TYPE_OPTIONS = [
  { value: "MANUAL", label: "Manual" },
  { value: "ADJUSTMENT", label: "Adjustment / ปรับปรุง" },
  { value: "RECURRING", label: "Recurring / ประจำ" },
  { value: "SALES_INVOICE", label: "Sales Invoice" },
  { value: "RECEIPT", label: "Receipt" },
  { value: "BILL", label: "Bill" },
  { value: "PAYMENT", label: "Payment" },
  { value: "TAX_FILING", label: "Tax Filing" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "STOCK_EXPORT", label: "Stock Export" },
] as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface JEFormValues {
  entry_date: string;
  branch_code: string;
  description: string;
  source_type: string;
  lines: Array<{
    account_code: string;
    description: string;
    branch_code: string;
    debit: string;
    credit: string;
    dim_dept?: string;
    dim_project?: string;
  }>;
}

interface JELineState {
  _key: string;
  account_code: string;
  description: string;
  branch_code: string;
  debit: string;
  credit: string;
  dim_dept: string;
  dim_project: string;
  _dimOpen: boolean;
}

export interface JEFormProps {
  accounts: AccountOption[];
  defaultValues?: Partial<JEFormValues>;
  onSaveDraft: (values: JEFormValues) => Promise<void>;
  onPost: (values: JEFormValues) => Promise<void>;
  saving: boolean;
  posting: boolean;
  onCancel?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _keySeq = 0;
function nextKey(): string {
  return `je-line-${++_keySeq}`;
}

function todayBangkok(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

function safeD(s: string) {
  try {
    return D(s || "0");
  } catch {
    return D(0);
  }
}

function emptyLine(defaultBranch: string): JELineState {
  return {
    _key: nextKey(),
    account_code: "",
    description: "",
    branch_code: defaultBranch,
    debit: "0",
    credit: "0",
    dim_dept: "",
    dim_project: "",
    _dimOpen: false,
  };
}

function initLines(
  defaultLines: JEFormValues["lines"] | undefined,
  defaultBranch: string
): JELineState[] {
  if (defaultLines && defaultLines.length >= 2) {
    return defaultLines.map((l) => ({
      _key: nextKey(),
      account_code: l.account_code,
      description: l.description ?? "",
      branch_code: l.branch_code,
      debit: l.debit,
      credit: l.credit,
      dim_dept: l.dim_dept ?? "",
      dim_project: l.dim_project ?? "",
      _dimOpen: !!(l.dim_dept || l.dim_project),
    }));
  }
  return [emptyLine(defaultBranch), emptyLine(defaultBranch)];
}

function lineStateToValue(l: JELineState): JEFormValues["lines"][number] {
  return {
    account_code: l.account_code,
    description: l.description,
    branch_code: l.branch_code,
    debit: l.debit,
    credit: l.credit,
    dim_dept: l.dim_dept || undefined,
    dim_project: l.dim_project || undefined,
  };
}

// ── Component ──────────────────────────────────────────────────────────────────

export function JEForm({
  accounts,
  defaultValues,
  onSaveDraft,
  onPost,
  saving,
  posting,
  onCancel,
}: JEFormProps) {
  const defaultBranch = defaultValues?.branch_code ?? "TL";

  const [entryDate, setEntryDate] = useState(
    defaultValues?.entry_date ?? todayBangkok()
  );
  const [branchCode, setBranchCode] = useState(defaultBranch);
  const [description, setDescription] = useState(
    defaultValues?.description ?? ""
  );
  const [sourceType, setSourceType] = useState(
    defaultValues?.source_type ?? "MANUAL"
  );
  const [lines, setLines] = useState<JELineState[]>(() =>
    initLines(defaultValues?.lines, defaultBranch)
  );
  const [periodWarning, setPeriodWarning] = useState<string | null>(null);

  // ── Computed totals and validation ─────────────────────────────────────────

  const { totalDebit, totalCredit, difference, isBalanced } = useMemo(() => {
    const td = sumD(lines.map((l) => safeD(l.debit)));
    const tc = sumD(lines.map((l) => safeD(l.credit)));
    const diff = td.minus(tc);
    return {
      totalDebit: td,
      totalCredit: tc,
      difference: diff,
      isBalanced: diff.isZero(),
    };
  }, [lines]);

  const lineErrors = useMemo(() => {
    const errors: Partial<Record<string, string>> = {};
    for (const l of lines) {
      if (!l.account_code) {
        errors[l._key] = "Account required";
      } else {
        const hasDebit = safeD(l.debit).gt(0);
        const hasCredit = safeD(l.credit).gt(0);
        if (!hasDebit && !hasCredit) {
          errors[l._key] = "Enter a debit or credit amount";
        } else if (hasDebit && hasCredit) {
          errors[l._key] = "Only one of debit or credit may be non-zero";
        }
      }
    }
    return errors;
  }, [lines]);

  const isFormValid =
    lines.length >= 2 &&
    Object.keys(lineErrors).length === 0 &&
    isBalanced &&
    description.trim().length > 0 &&
    !!entryDate;

  // ── Line handlers ─────────────────────────────────────────────────────────

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, emptyLine(branchCode)]);
  }, [branchCode]);

  const removeLine = useCallback((key: string) => {
    setLines((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((l) => l._key !== key);
    });
  }, []);

  const updateLine = useCallback(
    (key: string, patch: Partial<JELineState>) => {
      setLines((prev) =>
        prev.map((l) => (l._key === key ? { ...l, ...patch } : l))
      );
    },
    []
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const buildValues = (): JEFormValues => ({
    entry_date: entryDate,
    branch_code: branchCode,
    description,
    source_type: sourceType,
    lines: lines.map(lineStateToValue),
  });

  const handleSaveDraft = async () => {
    setPeriodWarning(null);
    await onSaveDraft(buildValues());
  };

  const handlePost = async () => {
    setPeriodWarning(null);
    if (!isFormValid) return;

    const periodCode = entryDate.substring(0, 7);
    try {
      const res = await fetch(`${API_BASE}/api/v1/periods/${periodCode}`, {
        credentials: "include",
      });
      if (res.ok) {
        const body = await res.json();
        if (body.data?.status === "CLOSED") {
          setPeriodWarning(
            `งวด ${periodCode} ปิดแล้ว (CLOSED) — กรุณาเปลี่ยนวันที่หรือขอให้ผู้ดูแลระบบเปิดงวดก่อน`
          );
          return;
        }
      }
    } catch {
      // Network error — proceed; server will enforce period rules
    }

    await onPost(buildValues());
  };

  const disabled = saving || posting;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Period warning */}
      {periodWarning && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            padding: "10px 14px",
            background: "rgba(184,92,80,0.1)",
            border: "1px solid var(--error)",
            borderRadius: 6,
            fontSize: 13,
            color: "var(--error)",
          }}
        >
          <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{periodWarning}</span>
        </div>
      )}

      {/* Header fields */}
      <div style={S.panel}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "160px 160px 1fr 190px",
            gap: 16,
            alignItems: "end",
          }}
        >
          <div>
            <label style={S.label}>วันที่ / Date *</label>
            <DatePickerTH
              value={entryDate}
              onChange={(v) => {
                setEntryDate(v ?? todayBangkok());
                setPeriodWarning(null);
              }}
              disabled={disabled}
            />
          </div>

          <div>
            <label style={S.label}>สาขา / Branch *</label>
            <BranchPicker
              value={branchCode}
              onChange={setBranchCode}
              disabled={disabled}
            />
          </div>

          <div>
            <label style={S.label}>คำอธิบาย / Description *</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Journal entry description"
              disabled={disabled}
              style={S.input}
            />
          </div>

          <div>
            <label style={S.label}>ประเภท / Source Type</label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              disabled={disabled}
              style={{ ...S.input, cursor: "pointer" }}
            >
              {SOURCE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lines table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--bg-elevated)" }}>
              <Th w={36} center>
                #
              </Th>
              <Th pct={28}>บัญชี / Account</Th>
              <Th>คำอธิบาย</Th>
              <Th w={130}>สาขา</Th>
              <Th w={140} right>
                เดบิต / Debit
              </Th>
              <Th w={140} right>
                เครดิต / Credit
              </Th>
              <Th w={52} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const lineErr = lineErrors[line._key];
              return (
                <React.Fragment key={line._key}>
                  {/* Data row */}
                  <tr
                    style={{
                      borderBottom:
                        (lineErr || line._dimOpen) ? "none" : "1px solid var(--border)",
                      background: lineErr
                        ? "rgba(184,92,80,0.03)"
                        : undefined,
                    }}
                  >
                    <td
                      style={{
                        padding: "6px 8px",
                        textAlign: "center",
                        fontSize: 11,
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {idx + 1}
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <AccountPicker
                        value={line.account_code || null}
                        onChange={(code) =>
                          updateLine(line._key, { account_code: code ?? "" })
                        }
                        accounts={accounts}
                        disabled={disabled}
                      />
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) =>
                          updateLine(line._key, { description: e.target.value })
                        }
                        placeholder="(optional)"
                        disabled={disabled}
                        style={{ ...S.input, padding: "5px 8px", fontSize: 12 }}
                      />
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <BranchPicker
                        value={line.branch_code}
                        onChange={(v) =>
                          updateLine(line._key, { branch_code: v })
                        }
                        disabled={disabled}
                      />
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <MoneyInput
                        value={line.debit}
                        onChange={(raw) =>
                          updateLine(line._key, { debit: raw })
                        }
                        disabled={disabled}
                      />
                    </td>

                    <td style={{ padding: "4px 8px" }}>
                      <MoneyInput
                        value={line.credit}
                        onChange={(raw) =>
                          updateLine(line._key, { credit: raw })
                        }
                        disabled={disabled}
                      />
                    </td>

                    <td style={{ padding: "4px 6px" }}>
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(line._key, { _dimOpen: !line._dimOpen })
                          }
                          title="Toggle dimensions"
                          style={S.iconBtn}
                        >
                          {line._dimOpen ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                        {lines.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removeLine(line._key)}
                            disabled={disabled}
                            title="Remove line"
                            style={{ ...S.iconBtn, color: "var(--error)" }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Validation error row */}
                  {lineErr && (
                    <tr
                      style={{
                        borderBottom: line._dimOpen
                          ? "none"
                          : "1px solid var(--border)",
                        background: "rgba(184,92,80,0.03)",
                      }}
                    >
                      <td />
                      <td
                        colSpan={5}
                        style={{
                          padding: "2px 8px 5px",
                          fontSize: 11,
                          color: "var(--error)",
                        }}
                      >
                        {lineErr}
                      </td>
                      <td />
                    </tr>
                  )}

                  {/* Dimensions row */}
                  {line._dimOpen && (
                    <tr
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg-elevated)",
                      }}
                    >
                      <td />
                      <td colSpan={5} style={{ padding: "8px" }}>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div>
                            <label style={{ ...S.label, marginBottom: 3 }}>
                              Department
                            </label>
                            <input
                              type="text"
                              value={line.dim_dept}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  dim_dept: e.target.value,
                                })
                              }
                              placeholder="e.g. CLINIC"
                              disabled={disabled}
                              style={{
                                ...S.input,
                                padding: "5px 8px",
                                fontSize: 12,
                              }}
                            />
                          </div>
                          <div>
                            <label style={{ ...S.label, marginBottom: 3 }}>
                              Project
                            </label>
                            <input
                              type="text"
                              value={line.dim_project}
                              onChange={(e) =>
                                updateLine(line._key, {
                                  dim_project: e.target.value,
                                })
                              }
                              placeholder="e.g. PROMO-2026"
                              disabled={disabled}
                              style={{
                                ...S.input,
                                padding: "5px 8px",
                                fontSize: 12,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td />
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {/* Add line button */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={addLine}
            disabled={disabled}
            style={S.addLineBtn}
          >
            <Plus size={12} />
            Add Line
          </button>
        </div>
      </div>

      {/* Totals */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <table style={{ width: 360, borderCollapse: "collapse", fontSize: 13 }}>
          <tbody>
            <tr>
              <td style={S.totalLabel}>รวมเดบิต / Total Debit</td>
              <td
                style={{
                  ...S.totalValue,
                  color: "var(--debit)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {totalDebit.isZero() ? "—" : formatTHB(totalDebit)}
              </td>
            </tr>
            <tr>
              <td style={S.totalLabel}>รวมเครดิต / Total Credit</td>
              <td
                style={{
                  ...S.totalValue,
                  color: "var(--credit)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {totalCredit.isZero() ? "—" : formatTHB(totalCredit)}
              </td>
            </tr>
            <tr
              style={{
                borderTop: `2px solid ${isBalanced ? "var(--border-strong)" : "var(--error)"}`,
              }}
            >
              <td
                style={{
                  ...S.totalLabel,
                  fontWeight: 600,
                  color: isBalanced ? "var(--text-muted)" : "var(--error)",
                }}
              >
                ผลต่าง / Difference
              </td>
              <td
                style={{
                  ...S.totalValue,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  color: isBalanced ? "var(--text-muted)" : "var(--error)",
                }}
              >
                {isBalanced ? "—" : formatTHB(difference.abs())}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--border)",
        }}
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            style={S.btnSecondary}
          >
            ยกเลิก / Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSaveDraft}
          disabled={disabled}
          style={{
            ...S.btnSecondary,
            opacity: saving ? 0.7 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {saving ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Saving...
            </>
          ) : (
            "บันทึกร่าง / Save Draft"
          )}
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={disabled || !isFormValid}
          title={!isFormValid ? "Fix validation errors before posting" : undefined}
          style={{
            ...S.btnPrimary,
            opacity: disabled || !isFormValid ? 0.45 : 1,
            cursor: disabled || !isFormValid ? "not-allowed" : "pointer",
          }}
        >
          {posting ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Posting...
            </>
          ) : (
            "บันทึก & Post ▶"
          )}
        </button>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Th({
  children,
  w,
  pct,
  right,
  center,
}: {
  children?: React.ReactNode;
  w?: number;
  pct?: number;
  right?: boolean;
  center?: boolean;
}) {
  return (
    <th
      style={{
        padding: "7px 12px",
        textAlign: center ? "center" : right ? "right" : "left",
        fontWeight: 500,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        color: "var(--text-muted)",
        borderBottom: "1px solid var(--border)",
        whiteSpace: "nowrap",
        width: w ? `${w}px` : pct ? `${pct}%` : undefined,
      }}
    >
      {children}
    </th>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S = {
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "16px 20px",
  } as React.CSSProperties,

  label: {
    display: "block",
    fontSize: 10,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
    marginBottom: 4,
  } as React.CSSProperties,

  input: {
    width: "100%",
    padding: "7px 10px",
    fontSize: 13,
    borderRadius: 4,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
    boxSizing: "border-box" as const,
  } as React.CSSProperties,

  iconBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    border: "none",
    borderRadius: 3,
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    transition: "color 0.15s, background 0.15s",
    flexShrink: 0,
  } as React.CSSProperties,

  addLineBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 10px",
    fontSize: 12,
    color: "var(--text-muted)",
    background: "transparent",
    border: "1px dashed var(--border-strong)",
    borderRadius: 4,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "color 0.15s, border-color 0.15s",
  } as React.CSSProperties,

  totalLabel: {
    padding: "7px 16px 7px 0",
    fontSize: 12,
    color: "var(--text-muted)",
    textAlign: "left",
  } as React.CSSProperties,

  totalValue: {
    padding: "7px 0",
    fontSize: 13,
    textAlign: "right",
    minWidth: 130,
  } as React.CSSProperties,

  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 16px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    border: "none",
    background: "var(--accent)",
    color: "#fff",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  btnSecondary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 4,
    border: "1px solid var(--border-strong)",
    background: "transparent",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    transition: "background 0.15s",
    whiteSpace: "nowrap",
  } as React.CSSProperties,
} as const;

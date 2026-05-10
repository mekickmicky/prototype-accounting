"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MoneyDisplay } from "@/components/ui/money-display";

export interface AccountRow {
  code: string;
  name_en: string;
  name_th: string;
  type: string;
  parent_code: string | null;
  is_postable: boolean;
  is_active: boolean;
  current_balance: string;
}

interface AccountTreeProps {
  accounts: AccountRow[];
  isAdmin: boolean;
  onUpdate: (code: string, patch: { name_th?: string; is_active?: boolean }) => Promise<void>;
  onNavigate: (code: string) => void;
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  ASSET:     { label: "Asset",     color: "var(--info)" },
  LIABILITY: { label: "Liability", color: "var(--warning)" },
  EQUITY:    { label: "Equity",    color: "var(--accent)" },
  REVENUE:   { label: "Revenue",   color: "var(--credit)" },
  EXPENSE:   { label: "Expense",   color: "var(--debit)" },
};

function buildChildMap(accounts: AccountRow[]): Map<string | null, AccountRow[]> {
  const map = new Map<string | null, AccountRow[]>();
  for (const acc of accounts) {
    const key = acc.parent_code ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(acc);
  }
  return map;
}

function parseCollapsed(hash: string): Set<string> {
  if (!hash) return new Set();
  const m = hash.slice(1).match(/(?:^|&)c=([^&]*)/);
  if (!m || !m[1]) return new Set();
  return new Set(m[1].split(",").filter(Boolean));
}

function serializeCollapsed(collapsed: Set<string>): string {
  if (collapsed.size === 0) return "";
  return `#c=${Array.from(collapsed).sort().join(",")}`;
}

interface TreeNodeProps {
  account: AccountRow;
  childMap: Map<string | null, AccountRow[]>;
  depth: number;
  collapsed: Set<string>;
  onToggle: (code: string) => void;
  isAdmin: boolean;
  onUpdate: (code: string, patch: { name_th?: string; is_active?: boolean }) => Promise<void>;
  onNavigate: (code: string) => void;
}

function TreeNode({
  account,
  childMap,
  depth,
  collapsed,
  onToggle,
  isAdmin,
  onUpdate,
  onNavigate,
}: TreeNodeProps) {
  const children = childMap.get(account.code) ?? [];
  const hasChildren = children.length > 0;
  const isCollapsed = collapsed.has(account.code);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(account.name_th);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(account.name_th);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditing(false);
  };

  const commitEdit = async (e?: React.MouseEvent | React.FocusEvent) => {
    e?.stopPropagation?.();
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === account.name_th) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onUpdate(account.code, { name_th: trimmed });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await onUpdate(account.code, { is_active: !account.is_active });
  };

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle(account.code);
    } else {
      onNavigate(account.code);
    }
  };

  const badge = TYPE_BADGE[account.type] ?? { label: account.type, color: "var(--text-muted)" };
  const indentPx = 12 + depth * 20;

  return (
    <>
      <tr
        onClick={handleRowClick}
        style={{ cursor: "pointer", opacity: account.is_active ? 1 : 0.45 }}
        className="transition-colors duration-[100ms] hover:bg-[--bg-hover]"
      >
        {/* Code + expand chevron */}
        <td
          className="whitespace-nowrap border-b border-[--border]"
          style={{ paddingLeft: indentPx, paddingRight: 8, paddingTop: 7, paddingBottom: 7, width: 200 }}
        >
          <div className="flex items-center gap-1.5">
            {hasChildren ? (
              <span className="shrink-0 text-[--text-dim]">
                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              </span>
            ) : (
              <span style={{ width: 12, display: "inline-block", flexShrink: 0 }} />
            )}
            <span
              className="font-mono text-[12px] text-[--text-muted]"
              onClick={(e) => { e.stopPropagation(); onNavigate(account.code); }}
            >
              {account.code}
            </span>
          </div>
        </td>

        {/* Name */}
        <td
          className="border-b border-[--border]"
          style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 7, paddingBottom: 7 }}
        >
          {editing && isAdmin ? (
            <div
              className="flex items-center gap-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={commitEdit}
                disabled={saving}
                className="w-full rounded border border-[--accent] bg-[--surface] px-2 py-0.5 text-[13px] text-[--text-primary] outline-none"
              />
              <button
                onClick={commitEdit}
                className="shrink-0 text-[--success] hover:text-[--credit]"
                title="Save"
              >
                <Check size={13} />
              </button>
              <button
                onClick={cancelEdit}
                className="shrink-0 text-[--text-dim] hover:text-[--text-muted]"
                title="Cancel"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="group flex items-baseline gap-2">
              <span className="text-[13px] text-[--text-primary]">{account.name_th}</span>
              {account.name_en && (
                <span className="text-[11px] text-[--text-dim]">{account.name_en}</span>
              )}
              {isAdmin && (
                <button
                  onClick={startEdit}
                  className="opacity-0 transition-opacity duration-[100ms] group-hover:opacity-100 text-[--text-dim] hover:text-[--accent]"
                  title="Edit name"
                >
                  <Edit2 size={11} />
                </button>
              )}
            </div>
          )}
        </td>

        {/* Type badge */}
        <td
          className="whitespace-nowrap border-b border-[--border]"
          style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 7, paddingBottom: 7, width: 90 }}
        >
          <span
            className="inline-flex items-center rounded-[3px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
            style={{
              color: badge.color,
              borderColor: badge.color,
              background: `color-mix(in srgb, ${badge.color} 12%, transparent)`,
            }}
          >
            {badge.label}
          </span>
        </td>

        {/* Balance */}
        <td
          className="whitespace-nowrap border-b border-[--border] text-right"
          style={{ paddingLeft: 8, paddingRight: 12, paddingTop: 7, paddingBottom: 7, width: 140 }}
          onClick={(e) => e.stopPropagation()}
        >
          <MoneyDisplay value={account.current_balance} showZero={false} />
        </td>

        {/* Active toggle */}
        {isAdmin && (
          <td
            className="whitespace-nowrap border-b border-[--border] text-center"
            style={{ paddingLeft: 8, paddingRight: 12, paddingTop: 7, paddingBottom: 7, width: 70 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={toggleActive}
              role="switch"
              aria-checked={account.is_active}
              title={account.is_active ? "Active — click to deactivate" : "Inactive — click to activate"}
              className="relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors duration-[150ms]"
              style={{
                backgroundColor: account.is_active ? "var(--accent)" : "var(--surface)",
                borderColor: account.is_active ? "var(--accent)" : "var(--border-strong)",
              }}
            >
              <span
                className={cn(
                  "pointer-events-none mt-[1px] inline-block h-3 w-3 rounded-full shadow transition-transform duration-[150ms]",
                  account.is_active ? "translate-x-[14px]" : "translate-x-[1px]"
                )}
                style={{ backgroundColor: "#fff" }}
              />
            </button>
          </td>
        )}
      </tr>

      {hasChildren && !isCollapsed &&
        children.map((child) => (
          <TreeNode
            key={child.code}
            account={child}
            childMap={childMap}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            isAdmin={isAdmin}
            onUpdate={onUpdate}
            onNavigate={onNavigate}
          />
        ))}
    </>
  );
}

export function AccountTree({ accounts, isAdmin, onUpdate, onNavigate }: AccountTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hashReady, setHashReady] = useState(false);

  useEffect(() => {
    setCollapsed(parseCollapsed(window.location.hash));
    setHashReady(true);
  }, []);

  const toggle = useCallback((code: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      const hash = serializeCollapsed(next);
      window.history.replaceState(
        null,
        "",
        hash || window.location.pathname + window.location.search
      );
      return next;
    });
  }, []);

  const childMap = React.useMemo(() => buildChildMap(accounts), [accounts]);
  const roots = childMap.get(null) ?? [];

  if (!hashReady) return null;

  return (
    <div className="overflow-hidden rounded-[6px] border border-[--border] bg-[--bg-elevated]">
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th
              className="border-b border-[--border] bg-[--bg-elevated] text-left"
              style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", width: 200 }}
            >
              Code
            </th>
            <th
              className="border-b border-[--border] bg-[--bg-elevated] text-left"
              style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Name
            </th>
            <th
              className="border-b border-[--border] bg-[--bg-elevated] text-left"
              style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", width: 90 }}
            >
              Type
            </th>
            <th
              className="border-b border-[--border] bg-[--bg-elevated] text-right"
              style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", width: 140 }}
            >
              Balance
            </th>
            {isAdmin && (
              <th
                className="border-b border-[--border] bg-[--bg-elevated] text-center"
                style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", width: 70 }}
              >
                Active
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {roots.map((root) => (
            <TreeNode
              key={root.code}
              account={root}
              childMap={childMap}
              depth={0}
              collapsed={collapsed}
              onToggle={toggle}
              isAdmin={isAdmin}
              onUpdate={onUpdate}
              onNavigate={onNavigate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

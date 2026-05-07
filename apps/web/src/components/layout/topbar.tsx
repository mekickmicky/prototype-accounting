"use client";

import { useState } from "react";
import { Menu, ChevronDown, LogOut, User } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const BRANCHES = [
  { code: "TL", label: "ทองหล่อ (TL)" },
  { code: "EK", label: "เอกมัย (EK)" },
  { code: "RAMA9", label: "พระราม 9 (RAMA9)" },
] as const;

type BranchCode = (typeof BRANCHES)[number]["code"];

const MONTH_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m} (${MONTH_TH[now.getMonth()]})`;
}

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const [branch, setBranch] = useState<BranchCode>("TL");
  const period = getCurrentPeriod();
  const selectedBranch = BRANCHES.find((b) => b.code === branch)!;

  return (
    <header
      style={{
        height: 56,
        minHeight: 56,
        background: "var(--bg-elevated)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 10,
        flexShrink: 0,
      }}
    >
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          color: "var(--text-muted)",
          background: "none",
          border: "none",
          borderRadius: 4,
          cursor: "pointer",
          flexShrink: 0,
        }}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <Menu size={16} strokeWidth={1.5} />
      </button>

      {/* Logo */}
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 16,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        WIND<span style={{ color: "var(--accent)" }}>·</span>Accounting
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Period indicator */}
      <span
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          whiteSpace: "nowrap",
          padding: "3px 8px",
          background: "var(--surface)",
          borderRadius: 4,
          border: "1px solid var(--border)",
        }}
        title="Current accounting period"
      >
        งวด {period}
      </span>

      {/* Branch picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              color: "var(--text-primary)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 8px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <span>{selectedBranch.code}</span>
            <ChevronDown size={12} strokeWidth={1.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {BRANCHES.map((b) => (
            <DropdownMenuItem
              key={b.code}
              onClick={() => setBranch(b.code)}
              style={{
                fontSize: 12,
                fontWeight: b.code === branch ? 500 : 400,
                color:
                  b.code === branch ? "var(--accent)" : "var(--text-primary)",
              }}
            >
              {b.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* User menu */}
      <UserMenu />

      {/* Theme toggle */}
      <ThemeToggle />
    </header>
  );
}

function UserMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--text-primary)",
            background: "none",
            border: "none",
            borderRadius: 4,
            padding: "3px 6px",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          <User size={14} strokeWidth={1.5} style={{ color: "var(--text-muted)" }} />
          <span style={{ color: "var(--text-muted)" }}>—</span>
          <ChevronDown size={12} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled style={{ fontSize: 12, color: "var(--text-muted)" }}>
          ยังไม่ได้เข้าสู่ระบบ
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          style={{ fontSize: 12, color: "var(--error)" }}
          onClick={() => {
            window.location.href = "/login";
          }}
        >
          <LogOut size={12} strokeWidth={1.5} style={{ marginRight: 6 }} />
          ออกจากระบบ
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

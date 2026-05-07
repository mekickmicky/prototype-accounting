"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  FileText,
  CreditCard,
  Calculator,
  Landmark,
  BarChart3,
  Webhook,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  ready?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  Icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    Icon: LayoutDashboard,
    items: [{ label: "Overview", href: "/dashboard", ready: true }],
  },
  {
    id: "gl",
    label: "General Ledger",
    Icon: BookOpen,
    items: [
      { label: "Chart of Accounts", href: "/gl/accounts" },
      { label: "Journal Entries", href: "/gl/journal-entries" },
      { label: "Periods", href: "/gl/periods" },
    ],
  },
  {
    id: "ar",
    label: "Accounts Receivable",
    Icon: FileText,
    items: [
      { label: "Customers", href: "/ar/customers" },
      { label: "Sales Invoices", href: "/ar/invoices" },
      { label: "Receipts", href: "/ar/receipts" },
      { label: "AR Aging", href: "/ar/aging" },
    ],
  },
  {
    id: "ap",
    label: "Accounts Payable",
    Icon: CreditCard,
    items: [
      { label: "Vendors", href: "/ap/vendors" },
      { label: "Bills", href: "/ap/bills" },
      { label: "Payments", href: "/ap/payments" },
      { label: "AP Aging", href: "/ap/aging" },
    ],
  },
  {
    id: "tax",
    label: "Tax",
    Icon: Calculator,
    items: [
      { label: "VAT Register", href: "/tax/vat-register" },
      { label: "ภพ.30", href: "/tax/pp30" },
      { label: "ภงด.3 / 53", href: "/tax/pnd" },
      { label: "Withholding Certs", href: "/tax/wht-certs" },
    ],
  },
  {
    id: "bank",
    label: "Bank",
    Icon: Landmark,
    items: [
      { label: "Accounts", href: "/bank/accounts" },
      { label: "Reconciliation", href: "/bank/reconciliation" },
      { label: "Import", href: "/bank/import" },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    Icon: BarChart3,
    items: [
      { label: "Trial Balance", href: "/reports/trial-balance" },
      { label: "P&L", href: "/reports/pl" },
      { label: "Balance Sheet", href: "/reports/balance-sheet" },
      { label: "Cash Flow", href: "/reports/cash-flow" },
      { label: "General Ledger", href: "/reports/general-ledger" },
      { label: "Branch P&L", href: "/reports/branch-pl" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    Icon: Webhook,
    items: [{ label: "Webhook Log", href: "/integrations/webhooks" }],
  },
  {
    id: "settings",
    label: "Settings",
    Icon: Settings2,
    items: [
      { label: "Company", href: "/settings/company" },
      { label: "Account Map", href: "/settings/account-map" },
      { label: "Users", href: "/settings/users" },
      { label: "Audit Log", href: "/settings/audit-log" },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: collapsed ? 56 : 240,
        minWidth: collapsed ? 56 : 240,
        background: "var(--bg-base)",
        borderRight: "1px solid var(--border)",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        transition: "width 0.2s ease, min-width 0.2s ease",
        flexShrink: 0,
      }}
    >
      {NAV_GROUPS.map((group) => (
        <NavGroupSection
          key={group.id}
          group={group}
          pathname={pathname}
          collapsed={collapsed}
        />
      ))}
    </aside>
  );
}

interface NavGroupSectionProps {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
}

function NavGroupSection({ group, pathname, collapsed }: NavGroupSectionProps) {
  const { Icon, label, items } = group;
  const isGroupActive = items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );

  if (collapsed) {
    const firstReady = items.find((i) => i.ready);
    return (
      <div style={{ padding: "2px 0" }} title={label}>
        {firstReady ? (
          <Link
            href={firstReady.href}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 36,
              color: isGroupActive ? "var(--accent)" : "var(--text-muted)",
              borderLeft: isGroupActive
                ? "3px solid var(--accent)"
                : "3px solid transparent",
              textDecoration: "none",
            }}
          >
            <Icon size={16} strokeWidth={1.5} />
          </Link>
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 36,
              color: "var(--text-dim)",
              borderLeft: "3px solid transparent",
              cursor: "not-allowed",
            }}
            title="ยังไม่พร้อมใช้งาน"
          >
            <Icon size={16} strokeWidth={1.5} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
      <div
        style={{
          padding: "2px 12px 4px",
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-dim)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <NavItem key={item.href} item={item} isActive={isActive} />
        );
      })}
    </div>
  );
}

interface NavItemProps {
  item: NavItem;
  isActive: boolean;
}

function NavItem({ item, isActive }: NavItemProps) {
  const sharedStyle: React.CSSProperties = {
    display: "block",
    padding: "5px 12px 5px 16px",
    fontSize: 13,
    borderLeft: isActive
      ? "3px solid var(--accent)"
      : "3px solid transparent",
    background: isActive ? "var(--bg-hover)" : "transparent",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  if (!item.ready) {
    return (
      <span
        style={{
          ...sharedStyle,
          color: "var(--text-dim)",
          cursor: "not-allowed",
        }}
        title="ยังไม่พร้อมใช้งาน"
      >
        {item.label}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      style={{
        ...sharedStyle,
        color: isActive ? "var(--text-primary)" : "var(--text-muted)",
        textDecoration: "none",
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background =
            "var(--bg-hover)";
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }
      }}
    >
      {item.label}
    </Link>
  );
}

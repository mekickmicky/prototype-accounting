"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { D } from "@wind-acc/shared";
import type { ColumnDef } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/ui/money-display";
import { MoneyInput } from "@/components/ui/money-input";
import { StatusBadge, type DocumentStatus } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, FilterSelect } from "@/components/ui/filter-bar";
import { AccountPicker, type AccountOption } from "@/components/ui/account-picker";
import { BranchPicker } from "@/components/ui/branch-picker";
import { PeriodPicker, type PeriodOption } from "@/components/ui/period-picker";
import { DatePickerTH } from "@/components/ui/date-picker-th";

// ─── Sample data for T-2.28 pickers ───────────────────────────────

const SAMPLE_ACCOUNTS: AccountOption[] = [
  { code: "11010", name_th: "เงินสด", name_en: "Cash", is_postable: true, is_active: true },
  { code: "11020", name_th: "เงินฝากธนาคาร กสิกร", name_en: "KBank Current Account", is_postable: true, is_active: true },
  { code: "12010", name_th: "ลูกหนี้การค้า", name_en: "Trade Receivable", is_postable: true, is_active: true },
  { code: "12020", name_th: "ลูกหนี้อื่น", name_en: "Other Receivable", is_postable: true, is_active: true },
  { code: "15010", name_th: "ค่าใช้จ่ายจ่ายล่วงหน้า", name_en: "Prepaid Expenses", is_postable: true, is_active: true },
  { code: "20000", name_th: "หนี้สิน", name_en: "Liabilities", is_postable: false, is_active: true },
  { code: "21010", name_th: "เจ้าหนี้การค้า", name_en: "Trade Payable", is_postable: true, is_active: true },
  { code: "22010", name_th: "ภาษีมูลค่าเพิ่มค้างจ่าย", name_en: "VAT Payable", is_postable: true, is_active: true },
  { code: "41010", name_th: "รายได้จากบริการโบท็อกซ์", name_en: "Botox Revenue", is_postable: true, is_active: true },
  { code: "61010", name_th: "ค่าเช่า", name_en: "Rent Expense", is_postable: true, is_active: true },
  { code: "61020", name_th: "เงินเดือนพนักงาน", name_en: "Salaries", is_postable: true, is_active: false },
];

const SAMPLE_PERIODS: PeriodOption[] = [
  { code: "2026-01", status: "CLOSED" },
  { code: "2026-02", status: "CLOSED" },
  { code: "2026-03", status: "CLOSED" },
  { code: "2026-04", status: "CLOSED" },
  { code: "2026-05", status: "OPEN" },
  { code: "2026-06", status: "OPEN" },
];

// ─── Sample data for DataTable ─────────────────────────────────────

interface JournalRow {
  id: string;
  jeNo: string;
  date: string;
  description: string;
  totalDr: string;
  totalCr: string;
  status: DocumentStatus;
}

const SAMPLE_ROWS: JournalRow[] = [
  {
    id: "1",
    jeNo: "JE-2026-0001",
    date: "2026-05-01",
    description: "Opening entries",
    totalDr: "500000.00",
    totalCr: "500000.00",
    status: "POSTED",
  },
  {
    id: "2",
    jeNo: "JE-2026-0002",
    date: "2026-05-03",
    description: "Sales receipt — Thonglor branch",
    totalDr: "25000.00",
    totalCr: "25000.00",
    status: "POSTED",
  },
  {
    id: "3",
    jeNo: "JE-2026-0003",
    date: "2026-05-05",
    description: "Rent expense",
    totalDr: "85000.00",
    totalCr: "85000.00",
    status: "DRAFT",
  },
  {
    id: "4",
    jeNo: "JE-2026-0004",
    date: "2026-05-06",
    description: "Voided entry — duplicate",
    totalDr: "12000.00",
    totalCr: "12000.00",
    status: "VOID",
  },
  {
    id: "5",
    jeNo: "JE-2026-0005",
    date: "2026-05-07",
    description: "VAT payable accrual",
    totalDr: "9800.00",
    totalCr: "9800.00",
    status: "DRAFT",
  },
];

const COLUMNS: ColumnDef<JournalRow, unknown>[] = [
  {
    accessorKey: "jeNo",
    header: "JE No",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-[--accent]">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: "date",
    header: "Date",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
  },
  {
    accessorKey: "totalDr",
    header: "Debit",
    cell: ({ getValue }) => (
      <MoneyDisplay
        value={getValue() as string}
        className="text-[--debit]"
      />
    ),
  },
  {
    accessorKey: "totalCr",
    header: "Credit",
    cell: ({ getValue }) => (
      <MoneyDisplay
        value={getValue() as string}
        className="text-[--credit]"
      />
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ getValue }) => (
      <StatusBadge status={getValue() as DocumentStatus} />
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────

export default function ComponentsDemo() {
  const [moneyValue, setMoneyValue] = useState("0.00");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pickedAccount, setPickedAccount] = useState<string | null>(null);
  const [pickedBranch, setPickedBranch] = useState("TL");
  const [pickedPeriod, setPickedPeriod] = useState<string | null>(null);
  const [pickedDate, setPickedDate] = useState<string | null>("2026-05-08");

  const filteredRows = SAMPLE_ROWS.filter((r) => {
    const matchSearch =
      !search ||
      r.jeNo.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <main className="mx-auto max-w-5xl space-y-10 p-8">
      {/* ── PageHeader ── */}
      <PageHeader
        title="Component Gallery"
        description="T-1.7 — All 8 reusable UI primitives with sample data"
        breadcrumbs={[
          { label: "Dev", href: "/dev" },
          { label: "Components" },
        ]}
        actions={
          <Button size="sm" className="gap-1.5">
            <Plus size={14} />
            New
          </Button>
        }
      />

      {/* ── MoneyDisplay ── */}
      <Section title="MoneyDisplay">
        <div className="flex flex-wrap items-center gap-6 text-[13px]">
          <LabeledValue label="Positive">
            <MoneyDisplay value={D("1234567.89")} />
          </LabeledValue>
          <LabeledValue label="Zero (em-dash)">
            <MoneyDisplay value={D(0)} />
          </LabeledValue>
          <LabeledValue label="Zero (show)">
            <MoneyDisplay value={D(0)} showZero />
          </LabeledValue>
          <LabeledValue label="Negative">
            <MoneyDisplay value={D("-9876.50")} />
          </LabeledValue>
          <LabeledValue label="With currency">
            <MoneyDisplay value="42000.00" showCurrency />
          </LabeledValue>
          <LabeledValue label="Debit color">
            <MoneyDisplay value="85000.00" className="text-[--debit]" />
          </LabeledValue>
          <LabeledValue label="Credit color">
            <MoneyDisplay value="85000.00" className="text-[--credit]" />
          </LabeledValue>
          <LabeledValue label="Null">
            <MoneyDisplay value={null} />
          </LabeledValue>
        </div>
      </Section>

      {/* ── MoneyInput ── */}
      <Section title="MoneyInput">
        <div className="max-w-xs space-y-2">
          <MoneyInput
            value={moneyValue}
            onChange={(raw, d) => setMoneyValue(d.toFixed(2))}
          />
          <p className="text-[12px] text-[--text-muted]">
            Decimal value:{" "}
            <span className="tabular-nums text-[--text-primary]">
              {moneyValue}
            </span>
          </p>
        </div>
      </Section>

      {/* ── StatusBadge ── */}
      <Section title="StatusBadge">
        <div className="flex flex-wrap gap-2">
          {(
            [
              "DRAFT",
              "POSTED",
              "VOID",
              "PAID",
              "PARTIAL_PAID",
              "CLOSED",
              "LOCKED",
              "OVERDUE",
              "OPEN",
            ] as DocumentStatus[]
          ).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      {/* ── FilterBar + DataTable ── */}
      <Section title="FilterBar + DataTable">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search JE…"
          filters={
            <FilterSelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { label: "All", value: "all" },
                { label: "Draft", value: "DRAFT" },
                { label: "Posted", value: "POSTED" },
                { label: "Void", value: "VOID" },
              ]}
            />
          }
        />
        <DataTable
          columns={COLUMNS}
          data={filteredRows}
          pageSize={10}
          emptyMessage="No journal entries match the current filters."
        />
      </Section>

      {/* ── EmptyState ── */}
      <Section title="EmptyState">
        <div className="border border-dashed border-[--border-strong] rounded">
          <EmptyState
            title="No invoices yet"
            description="Create your first sales invoice to get started."
            action={
              <Button size="sm" variant="outline" className="gap-1.5">
                <Plus size={13} />
                New Invoice
              </Button>
            }
          />
        </div>
      </Section>

      {/* ── ConfirmDialog ── */}
      <Section title="ConfirmDialog">
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmResult(null);
              setConfirmOpen(true);
            }}
          >
            Open destructive confirm
          </Button>
          {confirmResult && (
            <span className="self-center text-[12px] text-[--text-muted]">
              Result: <strong>{confirmResult}</strong>
            </span>
          )}
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Void JE-2026-0003?"
          description="Voiding will create a reversing journal entry. This cannot be undone."
          confirmLabel="Void entry"
          cancelLabel="Cancel"
          destructive
          onConfirm={() => {
            setConfirmOpen(false);
            setConfirmResult("confirmed");
          }}
          onCancel={() => {
            setConfirmOpen(false);
            setConfirmResult("cancelled");
          }}
        />
      </Section>

      {/* ── T-2.28: AccountPicker ── */}
      <Section title="AccountPicker (T-2.28)">
        <div className="max-w-xs space-y-2">
          <AccountPicker
            value={pickedAccount}
            onChange={setPickedAccount}
            accounts={SAMPLE_ACCOUNTS}
            placeholder="เลือกบัญชี..."
          />
          <p className="text-[12px] text-[--text-muted]">
            Selected:{" "}
            <span className="tabular-nums text-[--text-primary]">
              {pickedAccount ?? "—"}
            </span>
          </p>
          <p className="text-[11px] text-[--text-dim]">
            Inactive (61020) and non-postable (20000) accounts are excluded.
            Type a code or Thai/English name to filter.
          </p>
        </div>
      </Section>

      {/* ── T-2.28: BranchPicker ── */}
      <Section title="BranchPicker (T-2.28)">
        <div className="flex flex-wrap items-start gap-6">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.04em] text-[--text-dim]">Single branch</p>
            <BranchPicker value={pickedBranch} onChange={setPickedBranch} />
            <p className="text-[12px] text-[--text-muted]">
              Value: <span className="text-[--text-primary]">{pickedBranch}</span>
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.04em] text-[--text-dim]">With "All" option</p>
            <BranchPicker value={pickedBranch} onChange={setPickedBranch} allowAll />
          </div>
        </div>
      </Section>

      {/* ── T-2.28: PeriodPicker ── */}
      <Section title="PeriodPicker (T-2.28)">
        <div className="max-w-xs space-y-2">
          <PeriodPicker
            value={pickedPeriod}
            onChange={setPickedPeriod}
            periods={SAMPLE_PERIODS}
          />
          <p className="text-[12px] text-[--text-muted]">
            Selected:{" "}
            <span className="tabular-nums text-[--text-primary]">
              {pickedPeriod ?? "—"}
            </span>
          </p>
          <p className="text-[11px] text-[--text-dim]">
            ✓ = OPEN, ✕ = CLOSED, ⊘ = LOCKED
          </p>
        </div>
      </Section>

      {/* ── T-2.28: DatePickerTH ── */}
      <Section title="DatePickerTH (T-2.28)">
        <div className="max-w-xs space-y-2">
          <DatePickerTH value={pickedDate} onChange={setPickedDate} />
          <p className="text-[12px] text-[--text-muted]">
            ISO value:{" "}
            <span className="tabular-nums text-[--text-primary]">
              {pickedDate ?? "—"}
            </span>
          </p>
          <p className="text-[11px] text-[--text-dim]">
            Stores Gregorian ISO, displays Buddhist Era (พ.ศ.) below.
          </p>
        </div>
      </Section>

      {/* ── ThemeToggle (T-1.9) ── */}
      <Section title="ThemeToggle">
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <span className="text-[12px] text-[--text-muted]">
            Persists to localStorage. Default: dark.
          </span>
        </div>
      </Section>

      {/* ── Existing shadcn/ui (T-1.2 carry-over) ── */}
      <Section title="shadcn/ui base (T-1.2)">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <Input placeholder="shadcn Input…" className="max-w-xs" />
        </div>
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[--text-muted]">
        {title}
      </h2>
      <div>{children}</div>
    </section>
  );
}

function LabeledValue({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[11px] text-[--text-dim] uppercase tracking-[0.04em]">
        {label}
      </span>
      {children}
    </div>
  );
}

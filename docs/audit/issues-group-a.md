# Page Audit — Group A
_Audited: 2026-05-09_

## / — apps/web/src/app/page.tsx

_No issues found._

---

## /login — apps/web/src/app/login/page.tsx

_No issues found._

---

## /dev/components — apps/web/src/app/dev/components/page.tsx

- **Issue**: Hardcoded mock data (`SAMPLE_ROWS`, `SAMPLE_ACCOUNTS`) — intentional for a dev component gallery; not a production route. `D()` (Decimal wrapper) is used correctly for all monetary values in the samples. Noted as accepted dev-only behavior, not a defect.

---

## /dashboard — apps/web/src/app/(authenticated)/dashboard/page.tsx

- **Issue**: UI completeness — all metric cards show "Available in Phase X" stub text, even for phases already completed (Phase 2–6). The dashboard fetches no real data and displays no live KPIs despite the underlying modules being fully built. This is the primary entry point for all users and currently provides no actionable information.

---

## /gl/dashboard — apps/web/src/app/(authenticated)/gl/dashboard/page.tsx

_No issues found._

---

## /gl/accounts — apps/web/src/app/(authenticated)/gl/accounts/page.tsx

- **Issue**: Unhandled async rejection — `handleUpdate` is declared `async` and calls `patchAccount(...)` but has no `try/catch`. A network or server error will result in an unhandled promise rejection with no user-visible feedback; the modal may remain open without any error message shown.
- **Issue**: Form validation — the new-account modal shows a global `formError` string but no field-level validation messages. Required fields (`code`, `name`) are enforced only by HTML5 `required`; server-side validation errors (e.g., duplicate account code) surface only as the top-level `formError`, making it unclear which field caused the failure.

---

## /gl/accounts/[code] — apps/web/src/app/(authenticated)/gl/accounts/[code]/page.tsx

- **Issue**: Inaccurate period picker status — derived `PeriodOption` entries are always constructed with `status: "OPEN"` regardless of the actual period status from the API. This causes the `PeriodPicker` component to display every period as open (showing open-period icons), even for closed or locked periods, giving the user a misleading selection UI.

---

## /gl/journal-entries — apps/web/src/app/(authenticated)/gl/journal-entries/page.tsx

_No issues found._

---

## /gl/journal-entries/new — apps/web/src/app/(authenticated)/gl/journal-entries/new/page.tsx

_No issues found._

---

## /gl/journal-entries/[id] — apps/web/src/app/(authenticated)/gl/journal-entries/[id]/page.tsx

_No issues found._

---

## /gl/periods — apps/web/src/app/(authenticated)/gl/periods/page.tsx

- **Issue**: Missing role guard on close-period action — the "ปิดงวด" (Close Period) button is rendered for all authenticated users including those with the `VIEWER` role. Only the reopen action checks `isAdmin`. A `VIEWER` can trigger the close-period API call, which is a destructive operation (locks all postings into the period). The role check present on reopen should be applied symmetrically to close.

---

## /ar/dashboard — apps/web/src/app/(authenticated)/ar/dashboard/page.tsx

- **Issue**: Money handling — `parseFloat` used to sum monthly invoice totals: `monthInvoices.reduce((acc, inv) => acc + parseFloat(inv.total), 0)` (line ~199). Violates the project rule "Never `parseFloat`. Never `number`." Result stored in JS `number` state variable `monthRevenue`.
- **Issue**: Money handling — overdue total computed with raw JS addition: `const overdueTotal = parseFloat(aging.totals.b1_30) + parseFloat(aging.totals.b31_60) + parseFloat(aging.totals.b61_90) + parseFloat(aging.totals.b91plus)` (lines ~219–222). Floating-point arithmetic on monetary values; must use `Decimal.js`.
- **Issue**: Money handling — local `fmtMoney` helper: `function fmtMoney(val: string | number): string { const n = typeof val === "string" ? parseFloat(val) : val; ... }`. All display calls in the dashboard use this helper, which converts Decimal strings to JS `number` before formatting. Replace with `new Decimal(val).toFormat(...)` or the shared `formatTHB` / `MoneyDisplay` utility.
- **Issue**: State type — `monthRevenue`, `overdueAmount`, and `monthReceipts` are declared as `number` state variables. Monetary state must be `Decimal` to prevent precision loss.

---

## /ar/customers — apps/web/src/app/(authenticated)/ar/customers/page.tsx

_No issues found._

---

## /ar/customers/new — apps/web/src/app/(authenticated)/ar/customers/new/page.tsx

- **Issue**: Form validation — field-level validation relies solely on HTML5 `required` attributes. Server-side or Zod schema errors (e.g., duplicate tax ID, invalid format) surface only as a top-level error message without highlighting the offending field.

---

## /ar/customers/[id] — apps/web/src/app/(authenticated)/ar/customers/[id]/page.tsx

- **Issue**: Money handling — outstanding balance parsed with `parseFloat`: `const balance = parseFloat(customer.open_invoices.outstanding_balance); const hasBalance = balance > 0;` (line ~242). Comparison on a JS `number` instead of `Decimal`; must use `new Decimal(customer.open_invoices.outstanding_balance).gt(0)`.
- **Issue**: Money handling — balance displayed directly via `parseFloat(...).toLocaleString("th-TH", ...)` at lines ~640–641 and ~715–716. Must use `new Decimal(...)` then format, or the shared `MoneyDisplay` component.

---

## /ar/invoices — apps/web/src/app/(authenticated)/ar/invoices/page.tsx

- **Issue**: Money handling — local `fmtMoney` helper uses `parseFloat`: `function fmtMoney(val: string | number): string { const n = typeof val === "string" ? parseFloat(val) : val; return n.toLocaleString(...); }`. All monetary display in this list goes through this helper.
- **Issue**: Money handling — `balance()` helper returns JS `number`: `function balance(invoice: SalesInvoice): number { return parseFloat(invoice.total) - parseFloat(invoice.paid_amount); }`. Floating-point subtraction of monetary values; must use `new Decimal(invoice.total).minus(invoice.paid_amount)`.

---

## /ar/invoices/new — apps/web/src/app/(authenticated)/ar/invoices/new/page.tsx

_No issues found._ (Thin wrapper; money handling and form validation delegated to `InvoiceForm` component.)

---

## /ar/invoices/[id] — apps/web/src/app/(authenticated)/ar/invoices/[id]/page.tsx

- **Issue**: Money handling — outstanding balance computed with `parseFloat`: `const balance = parseFloat(invoice.total) - parseFloat(invoice.paid_amount);` (line ~214). Must use `new Decimal(invoice.total).minus(invoice.paid_amount)`.
- **Issue**: Money handling — float comparison on monetary value: `balance > 0.005` (line ~582). Floating-point threshold comparison on a JS `number` derived from Decimal strings. Must compare via `Decimal` (e.g., `.gt(new Decimal("0.005"))`).
- **Issue**: Money handling — line quantity displayed via `parseFloat(l.qty).toLocaleString(...)` (line ~492). While `qty` is not strictly a monetary field, `Decimal` should be used consistently for any numeric Prisma `Decimal` column to avoid precision issues.

---

## /ar/receipts — apps/web/src/app/(authenticated)/ar/receipts/page.tsx

- **Issue**: Money handling — local `fmtMoney` helper uses `parseFloat` identically to the invoices list page; all monetary display in the receipt list flows through it.
- **Issue**: Money handling — `sumApplied` computed via `parseFloat` reduce: applied amounts summed using `arr.reduce((s, a) => s + parseFloat(a.applied_amount), 0)`. Must use `Decimal` accumulator.
- **Issue**: Money handling — advance/excess check: `advance > 0.005` float comparison on a JS `number` derived from `parseFloat`. Must use `Decimal.gt`.

---

## /ar/receipts/new — apps/web/src/app/(authenticated)/ar/receipts/new/page.tsx

- **Issue**: Money handling — invoice balance computed with `parseFloat`: `const bal = (parseFloat(found.total) - parseFloat(found.paid_amount)).toFixed(2)` (line ~177). Chaining `.toFixed()` on a float produces a string from an already-imprecise intermediate value. Must use `new Decimal(found.total).minus(found.paid_amount).toFixed(2)`.
- **Issue**: Money handling — allocation total summed with `parseFloat` reduce: `Object.values(selectedInvoices).reduce((s, v) => s + parseFloat(v || "0"), 0)` (line ~200–201). Must use `Decimal` accumulator.
- **Issue**: Money handling — a second balance calculation: `const bal = parseFloat(inv.total) - parseFloat(inv.paid_amount)` (line ~381). Same pattern; must use `Decimal`.

---

## /ar/receipts/[id] — apps/web/src/app/(authenticated)/ar/receipts/[id]/page.tsx

- **Issue**: Money handling — `fmtMoney` helper uses `parseFloat`; identical pattern to receipts list and invoices list pages.
- **Issue**: Money handling — total applied computed via `parseFloat` reduce: `receipt.applications.reduce((s, a) => s + parseFloat(a.applied_amount), 0)`. Must use `Decimal` accumulator.
- **Issue**: Money handling — unapplied advance calculated: `parseFloat(receipt.total_amount) - totalApplied` where `totalApplied` is already a JS `number` from the reduce above. Both operands must be `Decimal`.
- **Issue**: Money handling — advance display check: `advance > 0.005` float comparison. Must use `new Decimal(receipt.total_amount).minus(totalApplied).gt(new Decimal("0.005"))`.

---

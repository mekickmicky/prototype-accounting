# Audit Summary
_Compressed from 171 issues across 60 pages — 2026-05-09_

---

## Patterns (recurring across multiple pages)

### P-1: parseFloat / fmtMoney violation
- **Affected pages:** 35 (AR:8, AP:8, Bank:2, Tax:10, Reports:10, Settings:1 — wht-certs)
- **Root cause:** Local `fmtMoney`/`fmt` helpers all use `parseFloat(val)` then pass to `.toLocaleString`; monetary totals and comparisons use raw JS number arithmetic instead of `Decimal.js`.
- **Worst case:** `/tax/pnd53/[id]` line 229: `const totalWht = parseFloat(filing.withholding_total)` used in arithmetic and `.toFixed(2)` display; floating-point imprecision can render wrong WHT amount for large sums.
- **Severity:** High (worst case Critical) — violates CLAUDE.md invariant "Never `parseFloat`. Never `number`." across virtually the entire codebase. `/tax/pnd53/[id]` is Critical: wrong financial data can be displayed for large WHT amounts.

Affected routes: `/ar/dashboard`, `/ar/customers/[id]`, `/ar/invoices`, `/ar/invoices/[id]`, `/ar/receipts`, `/ar/receipts/new`, `/ar/receipts/[id]`, `/ap/dashboard`, `/ap/vendors/[id]`, `/ap/bills`, `/ap/bills/[id]`, `/ap/payments`, `/ap/payments/new`, `/ap/payments/[id]`, `/bank/accounts`, `/bank/accounts/[id]`, `/tax/dashboard`, `/tax/pp30`, `/tax/pp30/new`, `/tax/pp30/[id]`, `/tax/pnd3`, `/tax/pnd3/new`, `/tax/pnd3/[id]`, `/tax/pnd53`, `/tax/pnd53/new`, `/tax/pnd53/[id]`, `/tax/wht-certs`, `/reports/trial-balance`, `/reports/profit-loss`, `/reports/general-ledger`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/ap-aging`, `/reports/ar-aging`, `/reports/vat-summary`, `/reports/branch-pnl`, `/reports/cash-position`

---

### P-2: Raw `fetch` bypassing `apiClient`
- **Affected pages:** 11 (Reports:9, Settings:2)
- **Root cause:** Report and settings pages use raw `fetch(..., { credentials: "include" })` in `run`, `triggerExport`, and `send` handlers instead of the project's `apiClient`; bypasses centralized auth-error handling and response normalization.
- **Worst case:** `/reports/general-ledger` bypasses `apiClient` for three separate calls (report run, export, accounts list).
- **Severity:** Medium — no data corruption risk, but auth errors and 401s are silently swallowed.

Affected routes: `/reports/trial-balance`, `/reports/profit-loss`, `/reports/general-ledger`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/ap-aging`, `/reports/ar-aging`, `/reports/vat-summary`, `/reports/branch-pnl`, `/reports/cash-position`, `/settings/integrations/test`

---

### P-3: No skeleton loading state (spinner-only)
- **Affected pages:** 9 (AP:2, Bank:1, Tax:2, Reports:4)
- **Root cause:** Loading state renders a small Loader2 spinner above an empty content area; no skeleton rows or full-area placeholder gives a table-shaped loading state.
- **Worst case:** `/reports/balance-sheet` — entire content area is blank while fetching; looks frozen on slow connections.
- **Severity:** Low — UX degradation only.

Affected routes: `/ap/bills`, `/ap/payments`, `/bank/accounts`, `/tax/pp30`, `/tax/pnd53`, `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/cash-flow`, `/reports/cash-position`

---

### P-4: Stranded error screens (no back navigation)
- **Affected pages:** 3 (AP:1, Tax:2)
- **Root cause:** Error render returns a text message with no back button or link to parent route; user is stuck.
- **Worst case:** `/tax/pp30/[id]` and `/tax/pnd3/[id]` — both show text-only error with no link back.
- **Severity:** Medium — visibly broken UX for error paths.

Affected routes: `/ap/payments/[id]`, `/tax/pp30/[id]`, `/tax/pnd3/[id]`

---

### P-5: Form validation — no field-level error messages
- **Affected pages:** 6 (GL:1, AR:1, AP:2, Tax:2)
- **Root cause:** Forms rely on HTML5 `required` attributes or submit-button disabling; no inline error messages adjacent to invalid fields; server-side errors surface only as top-level strings.
- **Worst case:** `/ap/payments/new` — vendor, date, and bill-selection fields all fail silently without per-field messages.
- **Severity:** Medium — spec deviation, poor UX.

Affected routes: `/gl/accounts`, `/ar/customers/new`, `/ap/vendors/new`, `/ap/payments/new`, `/tax/pnd53/new`, `/tax/pnd53/[id]`

---

### P-6: `subtractMonths` NaN risk on malformed period code
- **Affected pages:** 3 (Reports)
- **Root cause:** `const [y, m] = code.split("-").map(Number)` — if period code is malformed, `y`/`m` become `NaN` and subsequent arithmetic silently produces `NaN` period strings.
- **Worst case:** `/reports/vat-summary` uses it for default period range with non-null assertions `y!` / `m!`.
- **Severity:** Medium — silent wrong output if input is bad.

Affected routes: `/reports/general-ledger`, `/reports/vat-summary`, `/reports/branch-pnl`

---

## Unique Issues (non-repeating, one page only)

| Route | Issue | Severity |
|---|---|---|
| `/gl/periods` | VIEWER can trigger close-period API — role guard only on reopen, not on close | Critical |
| `/tax/wht-certs` | Stale closure in `handleFilterChange`: `applyFilters` executes with pre-update state via `setTimeout(0)`; filter change silently ignored on first click | High |
| `/settings/account-map` | `apiClient.get<AccountOption[]>("/api/v1/accounts")` may return unwrapped array or `{ data: [...] }` shape — inconsistent with raw-fetch counterpart; risk of every `AccountPicker` receiving broken accounts list | High |
| `/dashboard` | All metric cards show "Available in Phase X" stubs despite phases 2–6 being complete; zero live data on primary entry point | Medium |
| `/gl/accounts` | `handleUpdate` is `async` with no `try/catch`; unhandled promise rejection on network error; modal stays open with no error feedback | Medium |
| `/gl/accounts/[code]` | `PeriodOption` always constructed with `status: "OPEN"` regardless of actual API period status; all periods appear open in the picker | Medium |
| `/reports/ar-aging` | `inv.issue_date` / `inv.due_date` rendered as raw strings without tz-aware formatting → UTC off-by-one-day for Bangkok (UTC+7) | Medium |
| `/reports/ap-aging` | Same UTC date formatting issue as AR aging for `bill.issue_date` / `bill.due_date` | Medium |
| `/settings/account-map` | `rowsToRecord` silently skips rows with empty `code` — admin save may silently drop mappings | Medium |
| `/settings/audit-log` | Stats row counts WEBHOOK_RECEIVED / WEBHOOK_REJECTED from current page (≤50 rows) only; misleadingly labelled without "(this page)" qualifier | Medium |
| `/settings/audit-log` | `useEffect` depending on `load` callback fires on every filter keystroke; loads before user clicks Filter | Medium |
| `/settings/integrations/dashboard` | Same auto-refetch-on-filter pattern as audit-log; changing `from`/`to` fires two back-to-back requests | Medium |
| `/ap/vendors` | "AP Balance" column always renders `—` hardcoded stub; entire column non-functional | Medium |
| `/bank/accounts/[id]` | `apiReq` helper returns raw `{ data: ..., meta: ... }` wrapper inconsistently with `apiClient.get` which unwraps `.data`; silent shape mismatch risk | Medium |
| `/reports/balance-sheet` | `drillToGL` extracts year/month via `lastParams.asOf.substring(0,4)` — if `asOf` is not `YYYY-MM-DD`, silently produces garbage period strings | Medium |
| `/reports/vat-summary` | `<a href=...>` raw anchor tags for internal navigation instead of Next.js `<Link>` → full-page reload | Medium |
| `/tax/pp30/[id]` | Account codes in JE preview are hardcoded (11020, 21110, etc.) and may not match seeded chart of accounts | Low |
| `/tax/pp30/new` | `effectiveInputVat` computed but never referenced in JSX — dead code from partial refactor | Low |
| `/reports/trial-balance` | `useEffect` missing `fetchReport` dependency (suppressed with eslint-disable); stale fetch on remount | Low |
| `/reports/profit-loss` | No loading indicator in main content area during fetch; only filter bar Run button state changes | Low |
| `/reports/branch-pnl` | Branch columns hardcoded to TL, EK, RAMA9 in table header; out of sync if branch list changes | Low |
| `/settings/integrations/dashboard` | No pagination for webhook events; silent truncation if event count exceeds API limit | Low |
| `/settings/integrations/test` | No loading indicator in page body during sending; only button label changes | Low |
| `/bank/import` | Emoji 🏦 in JSX violates project convention ("no emojis unless user requests") | Low |
| `/ap/bills/new` | Thin wrapper only; BillForm component (`@/components/ap/bill-form`) untestable at page layer | Low |
| `/dev/components` | Hardcoded mock data (`SAMPLE_ROWS`, `SAMPLE_ACCOUNTS`) — accepted dev-only behavior, not a defect | Info |

---

## Clean Pages (no issues)

`/`, `/login`, `/gl/dashboard`, `/gl/journal-entries`, `/gl/journal-entries/new`, `/gl/journal-entries/[id]`, `/ar/customers`, `/ar/invoices/new`, `/bank/reconcile/[account_id]`

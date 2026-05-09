# Page Audit — Group C
_Audited: 2026-05-09_

> **Note on page count:** The task spec heading says "19 pages" but lists exactly 18 files in the **Reads** section. This file covers all 18 listed pages. The discrepancy appears to be a copy-paste error in the spec.

---

## /tax/pnd53 — apps/web/src/app/(authenticated)/tax/pnd53/page.tsx

- **Issue**: Money handling — `fmtMoney` (line 36) uses `parseFloat(val)` to convert the `withholding_total` string before calling `.toLocaleString`. Rule from CLAUDE.md: "Never `parseFloat`. Never `number`." Must use `new Decimal(val)` and call `.toNumber()` only at the `toLocaleString` boundary, or use a Decimal-aware formatter.
- **Issue**: Money handling — `typeof val === "string" ? parseFloat(val) : val` pattern in `fmtMoney` (line 36) accepts `number` as input type, encouraging callers to pass raw JS numbers for monetary values.
- **Issue**: Loading state partial — during initial load, while `loading === true` the table body shows nothing (no skeleton rows). Only the count row above the table shows a spinner (line 133-138). The table itself is blank during load, which may look broken.

---

## /tax/pnd53/new — apps/web/src/app/(authenticated)/tax/pnd53/new/page.tsx

- **Issue**: Money handling — `fmtMoney` (line 52) uses `parseFloat(val)` — same violation as the list page.
- **Issue**: Money handling — `fmtPct` (line 62) uses `parseFloat(rate) * 100`. Must use `new Decimal(rate).times(100).toFixed(0)`.
- **Issue**: Money handling — Summary box (line 361) does `parseFloat(aggregate!.total_gross)` to create a plain JS `number`, stores it as `val`, then calls `(val as number).toFixed(2)` inside `fmtMoney`. This converts the Decimal-string API response into an imprecise JS float before display.
- **Issue**: Form validation — period field has no visual "required" indicator or error message; the "Generate Preview" and "Save as Draft" buttons simply stay disabled when `period` is empty with no explanation to the user.

---

## /tax/pnd53/[id] — apps/web/src/app/(authenticated)/tax/pnd53/[id]/page.tsx

- **Issue**: Money handling — `fmtMoney` (line 68) uses `parseFloat(val)` — same pattern.
- **Issue**: Money handling — `fmtPct` (line 86) uses `parseFloat(rate) * 100`.
- **Issue**: Money handling — **CRITICAL**: line 229 `const totalWht = parseFloat(filing.withholding_total)` converts the server-returned Decimal string into a raw JS `number`. This value is then used in arithmetic comparisons (`totalWht > 0`, line 542) and passed to `.toFixed(2)` for display (lines 567, 568, 574, 575, 579, 580). For large WHT amounts, floating-point imprecision could produce incorrect display values (e.g., `123456.78` may display as `123456.77999...`).
- **Issue**: Form validation — the "Mark Submitted" submit button in FINALIZED state is disabled when `submissionRef` is empty, but there is no inline validation message shown to the user explaining what is missing.

---

## /tax/wht-certs — apps/web/src/app/(authenticated)/tax/wht-certs/page.tsx

- **Issue**: Money handling — `fmtMoney` (line 58) uses `parseFloat(val)`.
- **Issue**: Money handling — WHT rate column cell renderer (line 304): `parseFloat(getValue() as string).toFixed(0)` — must use `new Decimal(val).toFixed(0)`.
- **Issue**: Stale closure bug in filter application — `handleFilterChange` (line 228) calls `setter(val)` to update state, then immediately schedules `applyFilters(1)` via `setTimeout(..., 0)`. At the point `applyFilters` executes, React's state update from `setter(val)` has not yet been committed, so `applyFilters` calls `fetchCerts` with the *previous* values of `q`, `status`, `period`, `dateFrom`, `dateTo`. The filter change is effectively ignored on the first click; the user must trigger the filter a second time to see correct results.
- **Issue**: Import correctness — `useRef` (line 3) is imported and used only for `debounceRef`; the ref type `ReturnType<typeof setTimeout>` works fine in both browser and Node environments, so no issue here, but the pattern of calling `applyFilters` inside a stale closure (see above) makes the debounce ref ineffective for the non-search filter controls.

---

## /reports/trial-balance — apps/web/src/app/(authenticated)/reports/trial-balance/page.tsx

- **Issue**: Money handling — `formatMoney` (lines 61–68) uses `parseFloat(value)` and raw JS number arithmetic including `Math.abs(num)` and `.toLocaleString`. All monetary operations must use `Decimal.js`.
- **Issue**: Money handling — `isZero` (line 72) and `isNeg` (line 75) use `parseFloat(value) === 0` and `parseFloat(value) < 0`. Must use `new Decimal(value).isZero()` and `new Decimal(value).isNegative()`.
- **Issue**: API call bypasses `apiClient` — `fetchReport` and `triggerExport` use raw `fetch` (lines 127, 91) with `credentials: "include"`. If `apiClient` implements auth-error handling or centralized error normalization, those are bypassed. Inconsistent with other pages that use `apiClient`.
- **Issue**: `useEffect(() => { fetchReport(asOf, branch); }, [])` (line 141) omits `fetchReport` from the dependency array (suppressed with eslint-disable comment). While intentional, the missing deps means the initial fetch uses stale `fetchReport` if the component remounts — though this is unlikely to cause a visible bug.

---

## /reports/profit-loss — apps/web/src/app/(authenticated)/reports/profit-loss/page.tsx

- **Issue**: Money handling — `formatMoney` (lines 50–62) uses `parseFloat(value)` and raw `Math.abs` / `.toLocaleString`.
- **Issue**: Money handling — `computePctChange` (lines 66–74) uses `parseFloat(prev)` and `parseFloat(cur)` for percentage calculation, then raw JS subtraction and division. Should use `new Decimal(cur).minus(prev).div(Decimal.abs(prev)).times(100)`.
- **Issue**: Money handling — `PctSpan` (line 89) does `const n = parseFloat(pct)` for display formatting.
- **Issue**: API call bypasses `apiClient` — `run` (line 487) and `triggerExport` (line 113) use raw `fetch` with `credentials: "include"`.
- **Issue**: No loading spinner in the main content area while the report is being fetched. The `ReportFilterBar` receives `loading={loading}` which presumably disables the Run button, but no skeleton or Loader2 is shown in the report body area during fetch.

---

## /reports/general-ledger — apps/web/src/app/(authenticated)/reports/general-ledger/page.tsx

- **Issue**: Money handling — `formatMoney` (lines 61–68) and `formatMoneyBalance` (lines 72–79) both use `parseFloat(value)`.
- **Issue**: Money handling — lines 462–463: `parseFloat(row.debit) > 0` and `parseFloat(row.credit) > 0` used for conditional rendering of debit/credit cells.
- **Issue**: Suspense boundary ✓ (correctly wraps inner component that calls `useSearchParams()`).
- **Issue**: API call bypasses `apiClient` — `run` (line 244) and `triggerExport` (line 107) use raw `fetch`. The accounts-list fetch (line 208) also uses raw `fetch`.
- **Issue**: `subtractMonths` function (lines 52–58) uses `const [y, m] = code.split("-").map(Number)` — if `code` is malformed, `y` and `m` are `NaN` and the arithmetic silently produces `NaN`. No validation on the period input.

---

## /reports/balance-sheet — apps/web/src/app/(authenticated)/reports/balance-sheet/page.tsx

- **Issue**: Money handling — `formatMoney` (lines 51–58) uses `parseFloat(value)`.
- **Issue**: Money handling — `pctColor` (line 66) uses `parseFloat(pct)` for sign check.
- **Issue**: Money handling — `PctBadge` (lines 74–82) uses `parseFloat(pct)`.
- **Issue**: No main-content loading indicator — while `loading === true`, the content area shows nothing (no spinner, no skeleton). Only the `ReportFilterBar` button is updated via the `loading` prop. On slow connections, the page appears frozen.
- **Issue**: Suspense boundary ✓ (inner component uses `useSearchParams()` and is wrapped correctly).
- **Issue**: API call bypasses `apiClient` — `run` (line 303) and `triggerExport` (line 86) use raw `fetch`.
- **Issue**: `drillToGL` (line 341) extracts year and month from `lastParams.asOf` using `substring` (string slicing): `const year = lastParams.asOf.substring(0, 4)`. If `asOf` is not in `YYYY-MM-DD` format, this silently produces garbage. No validation.

---

## /reports/cash-flow — apps/web/src/app/(authenticated)/reports/cash-flow/page.tsx

- **Issue**: Money handling — `fmt` (lines 55–62) uses `parseFloat(value)` and raw `Math.abs`.
- **Issue**: Money handling — `amountColor` (lines 64–67) uses `parseFloat(value)` for sign detection.
- **Issue**: Money handling — `CashBox` (line 198) does `const num = parseFloat(value)` for color and display logic.
- **Issue**: No main-content loading indicator — same as balance-sheet: while the fetch is in-flight, the body area is empty.
- **Issue**: API call bypasses `apiClient` — `run` (line 229) and `triggerExport` (line 71) use raw `fetch`.
- **Issue**: Suspense wrapper ✓ (wraps `CashFlowPageInner` with fallback — `CashFlowPageInner` does not actually call `useSearchParams`, so the Suspense is precautionary but harmless).

---

## /reports/ap-aging — apps/web/src/app/(authenticated)/reports/ap-aging/page.tsx

- **Issue**: Money handling — `fmt` (lines 66–69) uses `parseFloat(value)`.
- **Issue**: Money handling — `isZero` (line 72) uses `parseFloat(v) === 0`.
- **Issue**: API call bypasses `apiClient` — `run` (line 196) and `triggerExport` (line 78) use raw `fetch`.
- **Issue**: `BillRow` (lines 94–109) renders raw date strings from the API (`bill.issue_date`, `bill.due_date`) directly without timezone-aware formatting. If dates arrive as ISO UTC timestamps, the displayed date may be off by one day for Bangkok timezone (UTC+7).
- **Issue**: No missing Suspense boundary — page does not use `useSearchParams`, so not needed.

---

## /reports/ar-aging — apps/web/src/app/(authenticated)/reports/ar-aging/page.tsx

- **Issue**: Money handling — `fmt` (lines 65–68) uses `parseFloat(value)`.
- **Issue**: Money handling — `isZero` (line 71) uses `parseFloat(v) === 0`.
- **Issue**: API call bypasses `apiClient` — `run` (line 196) and `triggerExport` (line 77) use raw `fetch`.
- **Issue**: `InvoiceRow` (lines 94–109) renders `inv.issue_date` and `inv.due_date` directly without timezone-aware formatting — same UTC-offset risk as AP Aging.
- **Issue**: No missing Suspense boundary needed.

---

## /reports/vat-summary — apps/web/src/app/(authenticated)/reports/vat-summary/page.tsx

- **Issue**: Money handling — `fmt` (lines 54–58) uses `parseFloat(value)` and raw `Math.abs`.
- **Issue**: Money handling — `subtractMonths` (line 47) uses `const [y, m] = code.split("-").map(Number)` with non-null assertions `y!` and `m!` — if the period code is malformed, arithmetic silently produces `NaN`.
- **Issue**: API call bypasses `apiClient` — `run` (line 149) and `triggerExport` (line 77) use raw `fetch`.
- **Issue**: No missing Suspense boundary (no `useSearchParams`).
- **Issue**: The `PeriodRow` component uses `<a href={pp30Href}>` and `<a href={filedHref}>` (lines 116–122) — raw `<a>` tags instead of Next.js `<Link>` component for internal navigation. This causes a full-page reload instead of a client-side navigation.

---

## /reports/branch-pnl — apps/web/src/app/(authenticated)/reports/branch-pnl/page.tsx

- **Issue**: Money handling — `fmt` (lines 68–73) uses `parseFloat(value)` and raw `Math.abs`.
- **Issue**: Money handling — `amountColor` (lines 75–79) uses `parseFloat(value)`.
- **Issue**: Money handling — `subtractMonths` (lines 60–65) uses `y!` and `m!` non-null assertions with `.map(Number)` — same `NaN` risk as vat-summary.
- **Issue**: API call bypasses `apiClient` — `run` (line 181) and `triggerExport` (line 82) use raw `fetch`.
- **Issue**: No missing Suspense boundary.
- **Issue**: Branch columns are hardcoded to `TL`, `EK`, `RAMA9` in the table header (lines 282–285) — if the branch list changes, the UI is out of sync with the data. No dynamic branch label mapping.

---

## /reports/cash-position — apps/web/src/app/(authenticated)/reports/cash-position/page.tsx

- **Issue**: Money handling — `fmt` (lines 57–60) uses `parseFloat(value)` and raw `Math.abs`.
- **Issue**: Money handling — `fmtSigned` (lines 63–67) uses `parseFloat(value)`.
- **Issue**: API call bypasses `apiClient` — `run` (line 131) and `triggerExport` (line 71) use raw `fetch`.
- **Issue**: TypeScript loose typing — `branch` state (line 122) is typed as `string` but `BranchFilter` type is defined at line 11. The `setBranch` setter in the `<select>` onChange (line 176) receives `e.target.value` which is `string`, not `BranchFilter`. Minor: no runtime impact because the select options only emit valid values.
- **Issue**: No missing Suspense boundary.

---

## /settings/account-map — apps/web/src/app/(authenticated)/settings/account-map/page.tsx

- **Issue**: API response type mismatch — `loadData` (line 342) calls `apiClient.get<AccountOption[]>("/api/v1/accounts")` and assigns the result directly to `setAccounts(accs)`. However, the general-ledger page (which also fetches accounts) uses `fetch` and expects the shape `{ data: AccountOption[] }` (GL page line 211: `(body as { data?: AccountOption[] })?.data`). If `apiClient.get` unwraps the `data` field automatically, this is fine; if not, `accs` would be an object `{ data: [...], meta: {...} }` rather than an array, and every `AccountPicker` would receive an empty or broken accounts list. The inconsistency between how the two pages handle this response is a bug risk.
- **Issue**: No Suspense needed.
- **Issue**: Loading state ✓ (Loader2 shown while loading).
- **Issue**: Error state ✓ (loadError displayed).
- **Issue**: No money handling concerns.
- **Issue**: Form validation — non-admin users see a read-only view with no field-level validation. Admin users have no validation that account codes are non-empty before saving; `rowsToRecord` (line 36) silently skips rows with empty `code`, which may cause silent data loss.

---

## /settings/audit-log — apps/web/src/app/(authenticated)/settings/audit-log/page.tsx

- **Issue**: `useEffect(() => { void load(1); }, [load])` where `load` is a `useCallback` that depends on `[filterAction, filterFrom, filterTo]` (line 137). Changing any filter input causes `load` to recreate, which fires the effect and triggers an immediate reload — before the user clicks "Filter". This means every date-input keystroke that produces a valid date triggers a network request. For a `type="date"` input this only fires on full date completion, so the UX impact is low but the behavior is non-obvious.
- **Issue**: The stats row (lines 143–144) counts `WEBHOOK_RECEIVED` and `WEBHOOK_REJECTED` from the current page's rows only (up to 50 rows), not from the full dataset. These counts are misleadingly labelled "Webhooks received" / "Webhooks rejected" without a "(this page)" qualifier.
- **Issue**: No money handling concerns.
- **Issue**: No Suspense needed.
- **Issue**: Loading state ✓ (Loader2 shown).
- **Issue**: Error state ✓.
- **Issue**: Empty state ✓.

---

## /settings/integrations/test — apps/web/src/app/(authenticated)/settings/integrations/test/page.tsx

- **Issue**: API call bypasses `apiClient` — both `VisitSection.send` (line 439) and `StockSection.send` (line 543) use raw `fetch` directly. No centralized auth/error handling.
- **Issue**: No loading indicator in the page body for the `sending` state — only the button label changes to "Sending…". The existing result panel (if any) is replaced with `null` (`setResult(null)`) so there is no visible indication that a request is in-flight beyond the button text.
- **Issue**: TypeScript — `SAMPLES_VISIT[sampleKeys[0]!]!()` (line 415) relies on non-null assertion. Since `SAMPLES_VISIT` is a non-empty const object, this is safe in practice but brittle if keys are ever removed.
- **Issue**: No Suspense needed.
- **Issue**: No money handling concerns.

---

## /settings/integrations/dashboard — apps/web/src/app/(authenticated)/settings/integrations/dashboard/page.tsx

- **Issue**: Auto-refetch on filter change — `useEffect(() => { load(); }, [load])` where `load` depends on `[source, from, to]` (line 252). Changing the `source` select or the date inputs immediately triggers a reload without requiring the user to click a button. For `type="date"` inputs this fires on every valid-date selection. While arguably by design, there is no debouncing and changing `from` then `to` triggers two back-to-back network requests.
- **Issue**: No pagination — the API returns `rows` and `stats` but there is no indication of total count or pagination controls. If there are many webhook events, the table silently shows only however many the API returns without informing the user there are more.
- **Issue**: No money handling concerns.
- **Issue**: No Suspense needed.
- **Issue**: Loading state ✓ (Loader2 shown in table body cell while loading).
- **Issue**: Error state ✓.
- **Issue**: Empty state ✓.

---

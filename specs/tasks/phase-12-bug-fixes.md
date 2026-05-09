# Phase 12 — Audit Bug Fixes

**Goal:** Resolve issues catalogued in `docs/audit/summary.md` (171 issues across 60 pages, distilled into 6 patterns + 26 unique issues).
**Reads:** `docs/audit/summary.md` (canonical source for every task in this phase)
**Acceptance:** All Critical and High severity issues from the audit summary are fixed; pattern P-1 (parseFloat / fmtMoney) is eliminated across all 35 affected pages; pattern P-2 (raw fetch) is replaced with `apiClient` across all 11 affected pages.

## Conventions

- **Language:** All code, identifiers, and comments must be **English**.
- **Status checkbox:** Each task starts as `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md`.
- **Money rule (referenced by every P-1 task):** Replace local `fmtMoney`/`fmt(val)` helpers whose body is `parseFloat(val).toLocaleString(...)` with the project-standard money helper. The replacement body MUST be: `new Decimal(val ?? 0).toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`. Replace any direct `parseFloat(x)` arithmetic with `new Decimal(x)`. Replace `>`/`<`/`===` comparisons on monetary values with `.gt()`/`.lt()`/`.eq()`. Import `Decimal from "decimal.js"`.
- **apiClient rule (referenced by every P-2 task):** Replace `await fetch(url, { credentials: "include", ... })` and the subsequent `res.ok` / `res.json()` handling with `await apiClient.get<T>(url)` / `apiClient.post<T>(url, body)` / etc. The `apiClient` helper is at `apps/web/src/lib/api-client.ts`. Read its signature first.

## Dependency Graph

```
T-12.1 (Critical: /gl/periods role guard) ───────────────────────────┐
T-12.2 (P-1 AR pages) ───────────────────────────────────────────────┤
T-12.3 (P-1 AP pages + AP unique issues) ────────────────────────────┤
T-12.4 (P-1 + P-2 + P-3 + P-6 Reports part 1: TB/PL/GL/BS/CF) ──────┤
T-12.5 (P-1 + P-2 + P-3 + P-6 Reports part 2: aging/VAT/branch/cash)┤── (independent, parallel)
T-12.6 (P-1 + P-4 + dead-code Tax part 1: pp30 + pnd3) ──────────────┤
T-12.7 (P-1 + P-5 + stale-closure Tax part 2: pnd53 + wht-certs) ────┤
T-12.8 (P-1 + emoji + apiReq Bank pages) ────────────────────────────┤
T-12.9 (GL unique issues: accounts, accounts/[code]) ────────────────┤
T-12.10 (Settings: account-map + audit-log + integrations) ──────────┤
T-12.11 (Dashboard live data) ───────────────────────────────────────┘
```

All tasks are independent — no `Depends on` chains. Each task touches a disjoint file set.

---

## Tasks

### T-12.1 — Critical: VIEWER role can close fiscal period

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/periods/page.tsx`, possibly `apps/api/src/routes/periods.ts` (verify server-side guard)
- **Reads:** `docs/audit/summary.md` (Unique Issues table — `/gl/periods`), `specs/04-modules.md` (Period management section), `specs/05-api-contracts.md` (period close/reopen endpoint contracts)
- **Spec:**
  Audit summary states: "VIEWER can trigger close-period API — role guard only on reopen, not on close" (Critical).
  1. Open `/gl/periods` page. Locate the close-period button handler. Confirm it lacks the same role-guard wrapper that the reopen-period handler uses.
  2. Apply the SAME role guard pattern that protects the reopen handler — disable the button (or hide it) for non-ADMIN/non-ACCOUNTANT roles, AND short-circuit the click handler so an authenticated `VIEWER` calling the API directly is also rejected client-side.
  3. Verify the API route handler (`apps/api/src/routes/periods.ts` or equivalent) ALSO enforces the role check server-side. If missing, add it. The client-side guard alone is insufficient — server-side enforcement is the security boundary.
  4. Add a brief inline comment on the handler explaining WHY the guard exists (audit finding reference).
- **Depends on:** —
- **Blocks:** —
- **Done when:** A VIEWER session cannot close a period via the UI button (button hidden/disabled), AND a direct POST to `/api/v1/periods/:code/close` from a VIEWER session returns 403. Reopen and close handlers share the same guard pattern.
- **Budget USD:** 2.00
- **Timeout Min:** 40

---

### T-12.2 — Eliminate P-1 (parseFloat/fmtMoney) in AR pages

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/ar/customers/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ar/invoices/page.tsx`, `apps/web/src/app/(authenticated)/ar/invoices/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/new/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/[id]/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1), `CLAUDE.md` Money Handling section
- **Spec:**
  Apply the **Money rule** from this file's Conventions to every file listed.
  1. In each file, find the local `fmtMoney`/`fmt` helper. Replace the body to use `new Decimal(val ?? 0)` as documented in Conventions.
  2. Find every `parseFloat(<monetary value>)` outside that helper (in arithmetic, comparisons, .toFixed calls). Replace with `new Decimal(...)`. Use `.plus()`, `.minus()`, `.times()`, `.div()` for arithmetic and `.gt()/.lt()/.eq()/.gte()/.lte()` for comparisons.
  3. Add `import Decimal from "decimal.js";` to any file that didn't already import it.
  4. Do NOT change visual output (number formatting must remain identical); only change the underlying representation.
- **Depends on:** —
- **Blocks:** —
- **Done when:** `grep -r "parseFloat" apps/web/src/app/\(authenticated\)/ar/` returns zero matches in monetary contexts. All 7 AR pages import `decimal.js`. Money displays still render identically (manually verify on `/ar/dashboard` and `/ar/invoices/[id]`).
- **Budget USD:** 2.50
- **Timeout Min:** 40

---

### T-12.3 — Eliminate P-1 in AP pages + AP unique issues

- [!] **Status:** Blocked (2026-05-09) — wall-clock timeout (40m > 40m cap)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ap/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/ap/vendors/page.tsx`, `apps/web/src/app/(authenticated)/ap/vendors/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ap/bills/page.tsx`, `apps/web/src/app/(authenticated)/ap/bills/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/new/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/[id]/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1, P-3 `/ap/bills` `/ap/payments`, P-4 `/ap/payments/[id]`, P-5 `/ap/vendors/new` `/ap/payments/new`, Unique row `/ap/vendors`)
- **Spec:**
  1. Apply the **Money rule** to all 8 files for P-1 (same procedure as T-12.2).
  2. `/ap/vendors`: replace the hardcoded `—` placeholder in the "AP Balance" column with the actual outstanding balance computed from the vendor's open bills. Either fetch a balance from the vendors list endpoint (preferred, add `?include=balance` if supported) or call `/api/v1/ap/vendors/:id/balance` per row. If neither endpoint exists, mark this sub-item with a TODO comment and surface in PROGRESS.md — do NOT silently leave the stub.
  3. `/ap/bills`, `/ap/payments`: replace the spinner-only loading state with a skeleton-rows table (P-3). Use the same `<TableSkeleton rows={8} />` pattern from `apps/web/src/components/ui/table-skeleton.tsx` if present; otherwise inline a div grid of pulsing placeholders.
  4. `/ap/payments/[id]`: error render path must include a `<Link href="/ap/payments">← Back to payments</Link>` anchor (P-4).
  5. `/ap/vendors/new`, `/ap/payments/new`: add field-level error messages adjacent to required inputs (P-5). Use a `errors[fieldName]` map populated from server response on submit and from client-side validation onChange.
- **Depends on:** —
- **Blocks:** —
- **Done when:** `grep -r "parseFloat" apps/web/src/app/\(authenticated\)/ap/` returns zero monetary matches. AP Balance column on `/ap/vendors` shows real numbers (or a TODO surfaced in PROGRESS.md). Loading skeletons render on `/ap/bills` and `/ap/payments`. Error path on `/ap/payments/[id]` shows a back link. New-vendor and new-payment forms display per-field errors when fields are invalid.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.4 — Reports part 1: TB / PL / GL / BS / CF (P-1 + P-2 + P-3 + P-6)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/trial-balance/page.tsx`, `apps/web/src/app/(authenticated)/reports/profit-loss/page.tsx`, `apps/web/src/app/(authenticated)/reports/general-ledger/page.tsx`, `apps/web/src/app/(authenticated)/reports/balance-sheet/page.tsx`, `apps/web/src/app/(authenticated)/reports/cash-flow/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1, P-2, P-3, P-6, Unique rows for trial-balance, profit-loss, balance-sheet)
- **Spec:**
  1. Apply the **Money rule** (P-1) to all 5 files.
  2. Apply the **apiClient rule** (P-2) to every `fetch()` call in `run`, `triggerExport`, and accounts-list handlers. Replace with `apiClient.get/post`. Read `apps/web/src/lib/api-client.ts` to confirm the method signature first. For binary export downloads, use `apiClient.getBlob` (or follow whichever pattern other working pages already use — check `/reports/ar-aging/page.tsx` post-fix for reference).
  3. P-3: Replace spinner-only loading on `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/cash-flow` with a skeleton table.
  4. P-6 NaN risk in `/reports/general-ledger`: locate the `subtractMonths(code, n)` helper or the inline `code.split("-").map(Number)`. Add a guard: if either `y` or `m` is `NaN` or `m < 1` or `m > 12`, throw `new Error(\`Invalid period code: \${code}\`)`. Remove any `y!`/`m!` non-null assertions.
  5. `/reports/trial-balance`: add `fetchReport` to the `useEffect` dependency array; remove the `eslint-disable` comment.
  6. `/reports/balance-sheet`: replace `lastParams.asOf.substring(0,4)` with proper parsing — use `new Date(lastParams.asOf)` and validate it's a real date before drilling to GL. If invalid, show an error toast instead of generating a garbage period string.
- **Depends on:** —
- **Blocks:** —
- **Done when:** Zero `parseFloat` and zero raw `fetch(` calls in these 5 files. Skeleton renders on the three pages above during initial load. Malformed period codes throw a visible error rather than producing NaN strings. `/reports/balance-sheet` drill-to-GL handles malformed `asOf` gracefully.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.5 — Reports part 2: aging / VAT / branch / cash position (P-1 + P-2 + P-3 + P-6)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/ap-aging/page.tsx`, `apps/web/src/app/(authenticated)/reports/ar-aging/page.tsx`, `apps/web/src/app/(authenticated)/reports/vat-summary/page.tsx`, `apps/web/src/app/(authenticated)/reports/branch-pnl/page.tsx`, `apps/web/src/app/(authenticated)/reports/cash-position/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1, P-2, P-3, P-6, Unique rows for ap-aging/ar-aging/vat-summary/branch-pnl)
- **Spec:**
  1. Apply the **Money rule** (P-1) to all 5 files.
  2. Apply the **apiClient rule** (P-2) to every raw `fetch` in these files.
  3. P-3: Replace spinner-only loading on `/reports/cash-position` with skeleton rows.
  4. P-6 NaN risk in `/reports/vat-summary` and `/reports/branch-pnl`: same guard as in T-12.4 (validate `y`/`m` before use; remove `y!`/`m!`).
  5. `/reports/ar-aging` and `/reports/ap-aging`: format `issue_date`/`due_date` with `formatInTimeZone(date, 'Asia/Bangkok', 'd MMM yyyy')` from `date-fns-tz`. Read the project's existing date helper (likely `apps/web/src/lib/date.ts`) and use it; only add a new util if none exists.
  6. `/reports/vat-summary`: replace `<a href=...>` internal navigation anchors with Next.js `<Link href=...>`. Add `import Link from "next/link";`.
  7. `/reports/branch-pnl`: replace the hardcoded `["TL", "EK", "RAMA9"]` table header with branches derived from API response (use unique branch codes from the report rows, sorted).
- **Depends on:** —
- **Blocks:** —
- **Done when:** Zero `parseFloat` and zero raw `fetch(` calls in these 5 files. AR/AP aging dates render in Bangkok TZ (no UTC off-by-one). VAT summary uses `<Link>`. Branch PnL columns derive from data, not hardcoded.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.6 — Tax part 1: pp30 + pnd3 (P-1 + P-4 + dead-code + hardcoded codes)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/[id]/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/[id]/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1, P-3 `/tax/pp30`, P-4 `/tax/pp30/[id]` + `/tax/pnd3/[id]`, Unique rows for tax/pp30/[id], tax/pp30/new), `specs/03-thai-tax.md` (chart-of-account codes for VAT/WHT)
- **Spec:**
  1. Apply the **Money rule** (P-1) to all 7 files.
  2. P-3: Replace spinner-only loading on `/tax/pp30` with a skeleton table.
  3. P-4: Error render on `/tax/pp30/[id]` and `/tax/pnd3/[id]` must include `<Link href="/tax/pp30">← Back</Link>` (or `/tax/pnd3` respectively).
  4. `/tax/pp30/[id]`: the JE preview hardcodes account codes (`11020`, `21110`, etc.). Replace with constants imported from a shared constants file. If no such file exists, create `apps/web/src/lib/account-codes.ts` exporting named constants like `VAT_OUTPUT_CODE`, `VAT_INPUT_CODE`, `VAT_PAYABLE_CODE` whose values come from the seeded chart of accounts (read `prisma/seed/accounts.ts` or wherever the seed lives). Reference the constants in the JSX.
  5. `/tax/pp30/new`: remove the unused `effectiveInputVat` computed value (dead code).
- **Depends on:** —
- **Blocks:** —
- **Done when:** Zero `parseFloat` in these 7 files. Skeleton renders on `/tax/pp30`. Error paths on the two `[id]` pages show back links. JE preview uses named constants. `effectiveInputVat` is gone from `/tax/pp30/new`.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.7 — Tax part 2: pnd53 + wht-certs (P-1 + P-5 + stale closure + Critical pnd53 sub-issue)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/pnd53/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd53/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd53/[id]/page.tsx`, `apps/web/src/app/(authenticated)/tax/wht-certs/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1 worst case `/tax/pnd53/[id]`, P-3 `/tax/pnd53`, P-5 `/tax/pnd53/new` + `/tax/pnd53/[id]`, Unique row `/tax/wht-certs`)
- **Spec:**
  1. Apply the **Money rule** (P-1) to all 4 files. **Pay extra attention** to `/tax/pnd53/[id]` line ~229 — `const totalWht = parseFloat(filing.withholding_total)` is the worst-case Critical instance from the audit. Replace with `const totalWht = new Decimal(filing.withholding_total ?? 0);` and update every downstream `.toFixed(2)`/`.toLocaleString` and arithmetic accordingly.
  2. P-3: Replace spinner-only loading on `/tax/pnd53` with a skeleton table.
  3. P-5: Add field-level error messages on `/tax/pnd53/new` and `/tax/pnd53/[id]` forms (same pattern as T-12.3 step 5 — `errors[fieldName]` map shown adjacent to inputs).
  4. `/tax/wht-certs`: fix the stale-closure bug in `handleFilterChange`. Currently it does `setFilters(...); setTimeout(() => applyFilters(), 0);` which captures the OLD filter state. Fix by EITHER (a) calling `applyFilters(newFilters)` directly with the new value as an argument, OR (b) moving the `applyFilters` invocation into a `useEffect` that depends on `filters`. Pick whichever matches the codebase's existing pattern in similar pages (e.g., `/settings/audit-log`).
- **Depends on:** —
- **Blocks:** —
- **Done when:** Zero `parseFloat` in these 4 files. The Critical pnd53 line is converted to `Decimal`. `/tax/pnd53` shows skeleton during load. Per-field errors render on the two pnd53 forms. `/tax/wht-certs` filter changes apply on the FIRST click (verify by changing a filter and seeing the table update without a second click).
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.8 — Bank pages: P-1 + apiReq inconsistency + emoji + skeleton

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/bank/accounts/page.tsx`, `apps/web/src/app/(authenticated)/bank/accounts/[id]/page.tsx`, `apps/web/src/app/(authenticated)/bank/import/page.tsx`
- **Reads:** `docs/audit/summary.md` (P-1, P-3 `/bank/accounts`, Unique rows for `/bank/accounts/[id]` and `/bank/import`)
- **Spec:**
  1. Apply the **Money rule** (P-1) to `/bank/accounts/page.tsx` and `/bank/accounts/[id]/page.tsx`.
  2. P-3: Replace spinner-only loading on `/bank/accounts` with skeleton rows.
  3. `/bank/accounts/[id]`: locate the `apiReq` helper (or inline fetch wrapper) returning the raw `{ data, meta }` envelope. Either (a) replace its callers with `apiClient.get(...)` (which already unwraps `.data`) and access `meta` separately if needed, OR (b) update `apiReq` to return `.data` and surface `meta` via a side channel. Prefer (a) for consistency.
  4. `/bank/import`: remove the 🏦 emoji from JSX (project convention prohibits emojis unless user-requested). Replace with the appropriate Lucide icon (e.g., `<Landmark className="h-5 w-5" />` from `lucide-react`).
- **Depends on:** —
- **Blocks:** —
- **Done when:** Zero `parseFloat` in bank pages. Skeleton renders on `/bank/accounts`. The `apiReq` shape inconsistency is gone — all bank pages use the same data-access pattern. Zero emoji characters in `bank/import/page.tsx` JSX.
- **Budget USD:** 2.50
- **Timeout Min:** 40

---

### T-12.9 — GL unique issues: accounts try/catch + period status

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/accounts/page.tsx`, `apps/web/src/app/(authenticated)/gl/accounts/[code]/page.tsx`
- **Reads:** `docs/audit/summary.md` (Unique rows for `/gl/accounts` + `/gl/accounts/[code]`, P-5 `/gl/accounts`)
- **Spec:**
  1. `/gl/accounts`: wrap `handleUpdate`'s API call in `try/catch`. On error, set a local `error` state and render it inside the modal (do NOT close the modal on failure). On success, close modal and refresh list.
  2. `/gl/accounts`: P-5 — add field-level error messages on the account create/edit modal form fields (same pattern as T-12.3 step 5).
  3. `/gl/accounts/[code]`: locate the `PeriodOption` construction. Currently every option is built with `status: "OPEN"`. Replace with the actual `status` from the API period record (likely `period.status`). If the API does not return status, add it to the response shape (server-side change in `apps/api/src/routes/periods.ts` to include `status` in the list endpoint).
- **Depends on:** —
- **Blocks:** —
- **Done when:** `handleUpdate` rejection no longer produces an unhandled promise warning; user sees an inline error in the modal. Account create form shows per-field errors. Period picker on `/gl/accounts/[code]` correctly shows OPEN vs CLOSED states for each period.
- **Budget USD:** 2.50
- **Timeout Min:** 40

---

### T-12.10 — Settings: account-map + audit-log + integrations

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/settings/account-map/page.tsx`, `apps/web/src/app/(authenticated)/settings/audit-log/page.tsx`, `apps/web/src/app/(authenticated)/settings/integrations/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/settings/integrations/test/page.tsx`, possibly `apps/web/src/components/account-picker.tsx`
- **Reads:** `docs/audit/summary.md` (Unique rows for `/settings/account-map` x2, `/settings/audit-log` x2, `/settings/integrations/dashboard` x2, `/settings/integrations/test`, P-2 `/settings/integrations/test`)
- **Spec:**
  1. `/settings/account-map`: investigate `apiClient.get<AccountOption[]>("/api/v1/accounts")`. Determine whether the endpoint returns `AccountOption[]` directly or `{ data: AccountOption[] }`. Verify by reading the API route. Pin down the contract — adjust either the call site or the apiClient generic so AccountPicker reliably receives the array. Also test by loading a page that uses AccountPicker.
  2. `/settings/account-map`: in `rowsToRecord`, when a row has empty `code`, do NOT silently skip — instead surface a validation error to the user (e.g., "Row N: code required") and block save. Save should be all-or-nothing.
  3. `/settings/audit-log`: stats row labels for WEBHOOK_RECEIVED / WEBHOOK_REJECTED counts must include "(this page)" qualifier OR the stats must compute over the full filtered set via a separate API call. Pick the simpler path: just append "(this page)" to the label.
  4. `/settings/audit-log`: the `useEffect` depending on `load` callback fires on every keystroke. Either (a) memoize `load` with `useCallback` over only stable deps (not the filter object), OR (b) remove `load` from the effect deps and trigger load only on explicit Filter button click. Prefer (b) — match the user's intent ("click Filter to apply").
  5. `/settings/integrations/dashboard`: same auto-refetch fix as audit-log; changing `from`/`to` should NOT fire requests until the user clicks Apply/Filter.
  6. `/settings/integrations/dashboard`: add pagination controls for webhook events (next/prev page or "load more"); follow the same pagination pattern as `/gl/journal-entries` if present.
  7. `/settings/integrations/test`: P-2 — replace raw `fetch` in `send` handler with `apiClient.post`. Add a centered loading spinner in the page body during send (not just the button label).
- **Depends on:** —
- **Blocks:** —
- **Done when:** AccountPicker reliably receives the accounts array (verify by opening account-map page). Empty-code rows produce a validation error instead of being silently dropped. Audit-log stats labels show "(this page)". Audit-log and integrations dashboard no longer auto-fetch on keystroke. Integrations dashboard supports pagination beyond the first 50 events. `/settings/integrations/test` uses `apiClient` and shows a body-level spinner during send.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

### T-12.11 — Dashboard: replace "Available in Phase X" stubs with live data

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/dashboard/page.tsx` (and any per-card components imported by it)
- **Reads:** `docs/audit/summary.md` (Unique row `/dashboard`), `specs/04-modules.md` (which metrics each module exposes)
- **Spec:**
  Audit summary: "All metric cards show 'Available in Phase X' stubs despite phases 2–6 being complete". Phases 2–6 cover GL, AR, AP, Tax, Bank.
  1. Identify each stub card. For each, find the appropriate API endpoint that already exists (phases 2–8 are complete — the data is available).
  2. Suggested mappings (verify endpoints exist before wiring):
     - **Today's revenue** → sum of posted invoices `issue_date = today` from `/api/v1/ar/invoices?from=today&to=today`
     - **Outstanding AR** → from `/api/v1/reports/ar-aging` total
     - **Outstanding AP** → from `/api/v1/reports/ap-aging` total
     - **Cash on hand** → from `/api/v1/reports/cash-position` total
     - **VAT due (current period)** → from `/api/v1/tax/pp30/preview?period=<current>`
     - **Open period** → from `/api/v1/periods?status=OPEN`
  3. Use `apiClient` for all calls (no raw fetch). Use `Decimal` for all money displayed (no parseFloat).
  4. If a metric truly has no backing endpoint, leave its stub but file a TODO comment with the missing endpoint name and surface in PROGRESS.md.
  5. Add a skeleton card during initial load.
- **Depends on:** —
- **Blocks:** —
- **Done when:** Every dashboard card either shows live data from the API or has a documented TODO for a missing endpoint. Zero "Available in Phase X" placeholder text remains for phases 2–6. Dashboard uses `apiClient` and `Decimal`.
- **Budget USD:** 3.50
- **Timeout Min:** 40

---

## Issues NOT covered by this phase

The following audit findings are intentionally deferred (Low severity, accepted, or outside Phase 12 scope):

- `/dev/components` hardcoded mock data — flagged Info (intentional dev-only behavior).
- `/ap/bills/new` thin-wrapper testability concern — architectural refactor, not a bug. Defer.

All other issues from `docs/audit/summary.md` (171 total) are covered by tasks T-12.1 through T-12.11.

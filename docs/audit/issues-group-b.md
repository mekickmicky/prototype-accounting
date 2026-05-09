# Page Audit — Group B
_Audited: 2026-05-09_

## /ap/dashboard — apps/web/src/app/(authenticated)/ap/dashboard/page.tsx

- **Issue**: Money handling — `parseFloat()` used for all monetary state and arithmetic. State variables `monthExpenses`, `overdueAmount`, and `monthWht` are typed and stored as JS `number`, not `Decimal`. The `fmtMoney` helper calls `parseFloat(val)` internally. The `b31plus` overdue-bucket sum iterates with `acc + parseFloat(v.total)`. All of this violates the CLAUDE.md rule: "Never `parseFloat`. Never `number`."
- **Issue**: Money handling — `totalWht` is accumulated via `c.wht_amount` arithmetic without `Decimal.js`. The accumulator pattern `wht += parseFloat(c.wht_amount || "0")` uses raw float addition on a monetary field.

---

## /ap/vendors — apps/web/src/app/(authenticated)/ap/vendors/page.tsx

- **Issue**: UI completeness — The "AP Balance" column always renders `—` (em dash) as a hardcoded stub. The column definition returns a placeholder string instead of fetching or computing the outstanding balance from the API response. This is visible stub content that leaves an entire column non-functional.

---

## /ap/vendors/new — apps/web/src/app/(authenticated)/ap/vendors/new/page.tsx

- **Issue**: Form validation — No field-level validation error messages are rendered. The submit button is disabled when the vendor name is empty, but there are no inline error messages (e.g., `<p>Name is required</p>` adjacent to the field) when the user blurs a required field without filling it. The form fails silently from the user's perspective.

---

## /ap/vendors/[id] — apps/web/src/app/(authenticated)/ap/vendors/[id]/page.tsx

- **Issue**: Money handling — `parseFloat(vendor.open_bills.outstanding_balance)` is used to compute the boolean `hasBalance` (determines whether the deactivate button is shown). A monetary comparison must use `new Decimal(vendor.open_bills.outstanding_balance).gt(0)`.
- **Issue**: Money handling — `parseFloat(...).toLocaleString(...)` is used for display of outstanding balance (approximately lines 806 and 915). Even display-only conversion must go through `Decimal.js` to preserve correctness: `new Decimal(val).toFixed(2)` then format.

---

## /ap/bills — apps/web/src/app/(authenticated)/ap/bills/page.tsx

- **Issue**: Money handling — The `fmtMoney` helper calls `parseFloat(val)` and passes the result to `toLocaleString`. All money display goes through this function, violating the Decimal.js rule.
- **Issue**: Money handling — `parseFloat(getValue() as string)` is used in the WHT column cell renderer to compare whether the WHT amount is greater than zero (approximately line 211). Must use `new Decimal(val).gt(0)`.
- **Issue**: Loading state — The loading indicator is a small inline spinner rendered inside a near-empty `<div>` alongside the page header. There is no skeleton or full-area loading block to indicate the table data is loading. The page shows an empty table frame with only a small spinning icon, which provides poor UX feedback.

---

## /ap/bills/new — apps/web/src/app/(authenticated)/ap/bills/new/page.tsx

- **Issue**: UI completeness — This page is a thin 47-line wrapper that delegates entirely to `<BillForm>` from `@/components/ap/bill-form`. The page itself cannot be meaningfully audited for money handling, form validation, or loading/error states without reading the BillForm component, which is out of scope for this page file audit. Any issues in BillForm will surface as issues in this route's UX but are not traceable to this file.

---

## /ap/bills/[id] — apps/web/src/app/(authenticated)/ap/bills/[id]/page.tsx

- **Issue**: Money handling — `balance` is computed as `parseFloat(bill.total) - parseFloat(bill.paid_amount)` (approximately line 198). This is raw float subtraction on monetary amounts. Must use `new Decimal(bill.total).minus(bill.paid_amount)`.
- **Issue**: Money handling — `parseFloat(l.qty)` is used to format line-item quantities (approximately line 354). If qty is used in any arithmetic context it must be Decimal; even for display, the pattern leaks.
- **Issue**: Money handling — `parseFloat(l.vat_rate) === 7` comparison (approximately line 360) uses float equality on a rate that is stored as a Decimal string. Must use `new Decimal(l.vat_rate).eq(7)`.
- **Issue**: Money handling — `parseFloat(bill.total) - parseFloat(bill.withholding_amount)` is used to compute net payable (approximately line 403). Raw float arithmetic on monetary fields.
- **Issue**: Money handling — `balance > 0.005` float comparison (approximately line 200) to determine if a bill has remaining balance. Float comparison on a monetary value is unreliable. Must use `new Decimal(balance).gt("0.005")` after computing balance with Decimal.

---

## /ap/payments — apps/web/src/app/(authenticated)/ap/payments/page.tsx

- **Issue**: Money handling — `parseFloat(w.wht_amount)` is used inside a column `accessorFn` to sum WHT amounts (approximately line 203). Reduces over monetary values using raw float addition.
- **Issue**: Money handling — `parseFloat(row.total_amount) - row.withholding.reduce(...)` computes net amount in a column `accessorFn` (approximately line 218). Mixed parseFloat and reduce on monetary fields; must use Decimal throughout.
- **Issue**: Loading state — Loading indicator is a small inline spinner only, providing minimal visual feedback while the payments table is loading.

---

## /ap/payments/new — apps/web/src/app/(authenticated)/ap/payments/new/page.tsx

- **Issue**: Money handling — `parseFloat(found.net_payable) - parseFloat(found.paid_amount)` computes remaining balance when a bill is selected (approximately line 175). Raw float subtraction on monetary fields.
- **Issue**: Money handling — In `toggleBill`, `parseFloat(netPaid - paid)` (approximately lines 203–204) applies `parseFloat` to the result of a JS subtraction — double violation (arithmetic then parse). Must use Decimal throughout.
- **Issue**: Money handling — `Object.values(selectedBills).reduce((s, v) => s + parseFloat(v || "0"), 0)` (approximately line 197) accumulates selected bill amounts using float addition. Must use Decimal accumulator.
- **Issue**: Form validation — No per-field validation error messages. The form only disables the submit button when required fields are empty; there are no inline error messages adjacent to fields like vendor selector, payment date, or bill selection.

---

## /ap/payments/[id] — apps/web/src/app/(authenticated)/ap/payments/[id]/page.tsx

- **Issue**: Money handling — `parseFloat(w.wht_amount)` is used to accumulate `totalWht` (approximately line 235). Float accumulation of monetary WHT amounts.
- **Issue**: Money handling — `parseFloat(payment.total_amount) - totalWht` computes `netPaid` (approximately line 236). Float subtraction after float accumulation on monetary fields.
- **Issue**: Error state — When the payment fails to load, the error UI displays only a text message with no navigation option (approximately lines 228–230). There is no back button or link to `/ap/payments`, leaving the user stranded on an error screen.

---

## /bank/accounts — apps/web/src/app/(authenticated)/bank/accounts/page.tsx

- **Issue**: Money handling — `fmtMoney` calls `parseFloat(val)` and passes it to `toLocaleString` (line 37). All balance display goes through this function.
- **Issue**: Money handling — In the balance column cell renderer, `parseFloat(val)` is used to check whether the balance is negative for color styling (approximately line 134). Must use `new Decimal(val).lt(0)`.
- **Issue**: Loading state — The loading spinner is rendered inside a `<div>` that only contains the spinner (approximately lines 204–206). When data is loading the table area is empty and only the small spinner appears above it; no skeleton rows or placeholder block provides a table-shaped loading state.

---

## /bank/accounts/[id] — apps/web/src/app/(authenticated)/bank/accounts/[id]/page.tsx

- **Issue**: Money handling — `parseFloat(account.balance)` is used to determine text color for the balance display (approximately line 203). Must use `new Decimal(account.balance).lt(0)`.
- **Issue**: Money handling — `parseFloat(txn.debit)` and `parseFloat(txn.credit)` are used in transaction list cells to conditionally format debit/credit values (approximately lines 507–508). Even display comparisons must use Decimal.
- **Issue**: API alignment — The `apiReq` helper returns `body as T` (approximately line 56) where `body` is the raw fetch response parsed as JSON. Callers type `T` as the full wrapper response `{ data: BankAccount, ... }` which works, but the helper does not unwrap `.data` — this is an unusual pattern inconsistent with how `apiClient.get<T>` works elsewhere (which unwraps automatically). If a caller ever passes a narrower `T` expecting just the data payload, this will silently return the wrong shape.

---

## /bank/import — apps/web/src/app/(authenticated)/bank/import/page.tsx

- **Issue**: UI completeness — Minor: emoji character 🏦 appears in JSX (approximately line 633). Per project conventions, emojis should not be used unless explicitly requested by the user.

---

## /bank/reconcile/[account_id] — apps/web/src/app/(authenticated)/bank/reconcile/[account_id]/page.tsx

_No issues found._ (This is a 10-line server component that awaits `params` and passes `account_id` to `<ReconcileWorkspace>`. All logic and rendering is delegated to the component. No money handling, fetch calls, or state management exist at this layer.)

---

## /tax/dashboard — apps/web/src/app/(authenticated)/tax/dashboard/page.tsx

- **Issue**: Money handling — `parseFloat(c.wht_amount || "0")` is used to accumulate `totalWht` (approximately line 246). Float accumulation of monetary WHT amounts.
- **Issue**: Money handling — `parseFloat(vatPayable)` is used to convert the VAT payable string to a number for display and comparison (approximately line 335). Must use Decimal.
- **Issue**: Money handling — `Math.abs(vatPayableNum)` is applied to a monetary value (approximately line 544) after it has already been converted via parseFloat. `Math.abs` on a float monetary value is a double violation.

---

## /tax/pp30 — apps/web/src/app/(authenticated)/tax/pp30/page.tsx

- **Issue**: Money handling — The `fmtMoney` helper calls `parseFloat(val)` and passes the result to `toLocaleString`. All monetary display on this page goes through this function.
- **Issue**: Loading state — The loading indicator is a small inline spinner rendered outside the table area. No skeleton provides a table-shaped loading state.

---

## /tax/pp30/new — apps/web/src/app/(authenticated)/tax/pp30/new/page.tsx

- **Issue**: Money handling — Extensive parseFloat usage throughout data processing: `parseFloat(aggregate.vat_payable)` (approximately line 127); `parseFloat(r.vat_amount)` and `parseFloat(r.net_amount)` in forEach loops; all aggregate field reads go through parseFloat before arithmetic.
- **Issue**: Money handling — `effectiveInputVat` and `displayInputVat` are computed via parseFloat chains (approximately lines 131–149), performing conditional arithmetic on monetary values using raw float operations.
- **Issue**: UI completeness — Dead code: `effectiveInputVat` is computed (approximately lines 130–138) but never referenced in the JSX — only `displayInputVat` is rendered. The unused variable suggests a partially-refactored calculation that left dead state.

---

## /tax/pp30/[id] — apps/web/src/app/(authenticated)/tax/pp30/[id]/page.tsx

- **Issue**: Money handling — `parseFloat(filing.output_vat)`, `parseFloat(filing.input_vat)`, and `parseFloat(filing.vat_payable)` (approximately lines 243–245) are used to compute summary totals with subsequent arithmetic. All monetary fields from the API response must be parsed with `new Decimal(...)`.
- **Issue**: Error state — The error UI shows only text with no navigation option (approximately lines 233–235). There is no back button or link to `/tax/pp30`, leaving the user stranded.
- **Issue**: UI completeness — Account codes used in the JE preview section are hardcoded (e.g., 11020, 21110, 14010, 14020). These may not match the seeded chart of accounts, making the JE preview potentially misleading or incorrect.

---

## /tax/pnd3 — apps/web/src/app/(authenticated)/tax/pnd3/page.tsx

- **Issue**: Money handling — The `fmtMoney` helper calls `parseFloat(val)` and passes the result to `toLocaleString`. All monetary display on this page goes through this function.

---

## /tax/pnd3/new — apps/web/src/app/(authenticated)/tax/pnd3/new/page.tsx

- **Issue**: Money handling — `parseFloat(val)` in the `fmtMoney` helper used for all monetary display.
- **Issue**: Money handling — `parseFloat(aggregate!.total_gross)` (approximately line 361) reads the aggregate gross amount from the API and converts it via parseFloat for arithmetic. Must use `new Decimal(aggregate.total_gross)`.
- **Issue**: Money handling — `parseFloat(rate) * 100` in the `fmtPct` helper (approximately line 62) performs float multiplication on a rate field. Even percentage formatting must avoid raw float arithmetic on Decimal-sourced values.

---

## /tax/pnd3/[id] — apps/web/src/app/(authenticated)/tax/pnd3/[id]/page.tsx

- **Issue**: Money handling — `parseFloat(filing.withholding_total)` (approximately line 229) converts the filing total to a float for display arithmetic. Must use `new Decimal(filing.withholding_total)`.
- **Issue**: Money handling — `parseFloat(rate) * 100` in the `fmtPct` helper (approximately lines 85–87) performs float multiplication on a rate sourced from a Decimal field.
- **Issue**: Error state — The error UI shows only text with no navigation option (approximately lines 220–222). No back button or link to `/tax/pnd3`, leaving the user stranded on the error screen.

---

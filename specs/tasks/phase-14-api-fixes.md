# Phase 14 — API Fix Tasks

**Goal:** Fix every FAIL found in Phase 13 API testing. All fixes are surgical — change only the failing code, do not refactor surrounding logic.
**Pre-condition:** API server running at `http://localhost:3001`.
**Acceptance:** Every `Done when` curl in each task returns the expected status.

## Source Reports

| Report | FAILs | Severity |
|---|---|---|
| `docs/test/api-gl.md` | DELETE /accounts 500; POST /journal-entries spec gap | Critical, Medium |
| `docs/test/api-ar.md` | POST /sales-invoices 422 (wrong account code) | Medium |
| `docs/test/api-ap.md` | GET /payments/:id/pdf returns text stub | Low |
| `docs/test/api-tax-bank.md` | Bank import + reconcile route path mismatch vs spec | High, High |
| `docs/test/api-reports.md` | GET /reports/general-ledger 500 | Critical |

## Conventions

- **Language:** English only.
- **Status checkbox:** `- [ ]` Not started → `- [~]` In progress → `- [x]` Done.
- **Model assignment:** Haiku = mechanical fix; Sonnet = logic/route/query fix.

---

## Tasks

### T-14.1 — Fix general-ledger report 500 error

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts`, `apps/api/src/services/` (whichever file handles GL report)
- **Reads:** `docs/test/api-reports.md` (general-ledger section), `apps/api/src/routes/reports.ts`
- **Spec:**

  `GET /api/v1/reports/general-ledger` returns HTTP 500 for any valid request:
  ```
  {"success": false, "error": {"code": "INTERNAL_ERROR", "message": "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง"}}
  ```
  The tester confirmed the endpoint accepts `account` param (not `account_code`) and `period_from`/`period_to` (YYYY-MM format). An example failing call:
  ```
  GET /api/v1/reports/general-ledger?account=1000&period_from=2026-01&period_to=2026-05&branch=ALL&format=json
  ```

  Steps:
  1. Read the general-ledger route handler in `apps/api/src/routes/reports.ts`.
  2. Read the underlying service function that queries JE lines for an account.
  3. Identify the thrown error: check for missing null-guard on account lookup, invalid Prisma query, or Decimal conversion error.
  4. Fix the root cause. Wrap any unguarded code in try/catch and throw a proper `BusinessRuleError` with a stable code (e.g., `ACCOUNT_NOT_FOUND`) when the account code does not exist in the chart of accounts.
  5. Ensure the response is the GL drilldown JSON shape (account info, opening balance, line-by-line entries, closing balance).

- **Depends on:** —
- **Blocks:** —
- **Done when:**
  ```bash
  curl -s -H "Cookie: $(cat docs/test/auth.txt)" \
    "http://localhost:3001/api/v1/reports/general-ledger?account=11010&period_from=2026-01&period_to=2026-05&branch=ALL&format=json" \
    | head -c 100
  # Must return 200 with {"success":true,...} — not 500
  ```
- **Budget USD:** 1.50
- **Timeout Min:** 40

---

### T-14.2 — Add soft-delete handler for accounts (fix 500 on DELETE)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/accounts.ts`
- **Reads:** `docs/test/api-gl.md` (DELETE section), `apps/api/src/routes/accounts.ts`, `specs/02-business-rules.md` (soft delete section)
- **Spec:**

  `DELETE /api/v1/accounts/99901` returns HTTP 500:
  ```
  {"code":"INTERNAL_ERROR","message":"เกิดข้อผิดพลาดในระบบ"}
  ```
  Root cause: no DELETE handler exists in `apps/api/src/routes/accounts.ts`. Elysia returns 500 for unhandled methods.

  Add a DELETE route handler for `/:code` that:
  1. Verifies the account exists — return 404 with `ACCOUNT_NOT_FOUND` if not.
  2. Verifies the account has no posted JE lines referencing it — return 422 with `ACCOUNT_HAS_TRANSACTIONS` if it does.
  3. Sets `is_active = false` and `deleted_at = now()` (soft delete per business rules — no raw DELETE).
  4. Returns 200 `{"success": true}`.

  Pattern: match the soft-delete pattern already used for customers and vendors in their respective route files.

- **Depends on:** —
- **Blocks:** —
- **Done when:**
  ```bash
  # Create a leaf account, then delete it
  COOKIE=$(cat docs/test/auth.txt)
  curl -s -X POST http://localhost:3001/api/v1/accounts \
    -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
    -d '{"code":"99910","name_en":"Test Delete","name_th":"Test Delete","type":"EXPENSE","parent_code":"50000","is_postable":true}' \
    | grep -o '"code":"99910"'
  curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    -H "Cookie: $COOKIE" http://localhost:3001/api/v1/accounts/99910
  # Must print 200
  ```
- **Budget USD:** 1.50
- **Timeout Min:** 40

---

### T-14.3 — Update API spec to document actual bank route paths

- [x] **Status:** Done (2026-05-09)
- **Model:** Haiku
- **Files:** `specs/05-api-contracts.md`
- **Reads:** `docs/test/api-tax-bank.md` (Bank section), `apps/api/src/routes/bank.ts` (or equivalent bank route file)
- **Spec:**

  T-13.4 found two route path mismatches between the spec and the implementation:

  | Spec path | Actual working path |
  |---|---|
  | `POST /bank-accounts/:id/import` | `POST /bank/import` |
  | `GET /bank-accounts/:id/reconcile` | `GET /bank/reconciliation/:account_id` |

  The actual endpoints work correctly (both returned 200 when called at the correct path). The spec document is wrong.

  Steps:
  1. Open `specs/05-api-contracts.md`.
  2. Find the Bank section. Locate the import and reconcile endpoint entries.
  3. Update the documented paths and parameter descriptions to match the actual implementation:
     - `POST /bank/import` (body: `{ bank_account_id, use_mock_data }` or CSV)
     - `GET /bank/reconciliation/:account_id`
  4. Also verify the full bank route list in the spec matches what `apps/api/src/routes/bank.ts` actually exports; update any other mismatched paths.
  5. Do NOT change any code — spec document only.

- **Depends on:** —
- **Blocks:** —
- **Done when:**
  ```bash
  grep -n "bank/import\|bank/reconciliation" specs/05-api-contracts.md
  # Must show both paths present in the document
  ```
- **Budget USD:** 0.30
- **Timeout Min:** 20

---

### T-14.4 — Fix spec contract discrepancies for JE and sales-invoice endpoints

- [x] **Status:** Done (2026-05-09)
- **Model:** Haiku
- **Files:** `specs/05-api-contracts.md`
- **Reads:** `docs/test/api-gl.md` (POST /journal-entries section), `docs/test/api-ar.md` (POST /sales-invoices section), `apps/api/src/routes/journal-entries.ts`, `apps/api/src/routes/sales-invoices.ts`
- **Spec:**

  T-13.1 and T-13.2 found two spec/implementation gaps that caused confusion during testing. Both APIs are correctly implemented; the spec examples are misleading.

  **Gap 1 — POST /journal-entries missing `source_type`:**
  The spec example body does not include `source_type`, but the Zod schema requires it. Manual JEs should use `"MANUAL"`. Update the spec example body to include:
  ```json
  "source_type": "MANUAL"
  ```

  **Gap 2 — POST /sales-invoices `qty` must be string:**
  The spec example shows `qty: 1` (number), but the Zod schema requires `qty` as a decimal string. Update the spec example to use:
  ```json
  "qty": "1"
  ```
  Also verify the correct leaf account code for `income_account_code` by reading the seeded chart of accounts (a postable leaf under 410xx, e.g., `41100`). Document this in the spec example.

  **Gap 3 — Report endpoint parameter names:**
  T-13.5 confirmed that all date-range report endpoints use `period_from`/`period_to` (YYYY-MM) rather than `from`/`to` (YYYY-MM-DD). Update the spec's Reports section parameter tables to document the actual parameter names and formats used by the implementation.

  Steps:
  1. Open `specs/05-api-contracts.md`.
  2. Find the Journal Entries POST section → add `source_type` to the example body.
  3. Find the Sales Invoices POST section → fix `qty` to string, fix `income_account_code` to a postable leaf account.
  4. Find the Reports section → update `from`/`to` to `period_from`/`period_to` with YYYY-MM format note for profit-loss, cash-flow, GL, vat-summary, branch-pnl.
  5. No code changes — spec document only.

- **Depends on:** —
- **Blocks:** —
- **Done when:**
  ```bash
  grep -n "source_type\|period_from" specs/05-api-contracts.md | head -10
  # Must show both terms present in the spec
  ```
- **Budget USD:** 0.30
- **Timeout Min:** 20

---

### T-14.5 — Implement payment voucher PDF

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/payments.ts`, `apps/api/src/pdf/payment-voucher.tsx` (create if not exists)
- **Reads:** `docs/test/api-ap.md` (Payments: Get PDF section), `apps/api/src/pdf/bill.tsx` (use as template pattern), `apps/api/src/routes/payments.ts`
- **Spec:**

  `GET /api/v1/payments/:id/pdf` currently returns:
  ```
  HTTP 200  Content-Type: text/plain
  Payment voucher PDF not yet implemented.
  ```

  Implement the payment voucher PDF using `@react-pdf/renderer`, matching the pattern in `apps/api/src/pdf/bill.tsx`.

  The payment voucher should include:
  - Company header (WIND CLINIC, branch, address)
  - Document number (`payment_no`), payment date
  - Vendor name, vendor tax ID
  - Payment method (CASH / BANK_TRANSFER / CHEQUE)
  - Bank account name + number (if applicable)
  - Table of applied bills: bill_no, bill_date, original_amount, paid_amount
  - WHT total (if any withholding records exist)
  - Net payment amount
  - Signatory lines: Prepared by / Approved by

  Steps:
  1. Create `apps/api/src/pdf/payment-voucher.tsx` with a `PaymentVoucherPdf` component.
  2. Fetch the full payment record (including vendor, bank_account, applications, and wht_records) in the route handler.
  3. Replace the stub text response with a proper PDF stream (`Content-Type: application/pdf`).
  4. Follow the Decimal → `.toFixed(2)` string pattern for display (never `parseFloat`).

- **Depends on:** —
- **Blocks:** —
- **Done when:**
  ```bash
  COOKIE=$(cat docs/test/auth.txt)
  # Get a posted payment ID first
  PAY_ID=$(curl -s -H "Cookie: $COOKIE" "http://localhost:3001/api/v1/payments?status=POSTED" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id'])" 2>/dev/null || echo "NO_PAYMENT")
  curl -s -o /dev/null -w "%{http_code}" -H "Cookie: $COOKIE" \
    "http://localhost:3001/api/v1/payments/$PAY_ID/pdf"
  # Must print 200
  curl -sI -H "Cookie: $COOKIE" \
    "http://localhost:3001/api/v1/payments/$PAY_ID/pdf" | grep -i content-type
  # Must show application/pdf
  ```
- **Budget USD:** 1.50
- **Timeout Min:** 40

---

## NOT TESTED endpoints (from T-13.1 budget exhaustion)

The following GL endpoints were marked NOT TESTED in T-13.1 due to budget exhaustion. They are **not** confirmed failures; add a re-test pass as part of T-14.1 (the worker already has the API running):

- `POST /api/v1/journal-entries` (with correct `source_type: "MANUAL"` and postable accounts)
- `POST /api/v1/journal-entries/:id/post`
- `POST /api/v1/journal-entries/:id/void`
- `GET /api/v1/periods`
- `POST /api/v1/periods/:code/close`
- `POST /api/v1/periods/:code/reopen`

If any of these return unexpected errors during T-14.1, add a blocker note and create T-14.6.

---

## Dependency Graph

```
T-14.1 (Sonnet: fix GL report 500)
T-14.2 (Sonnet: add accounts DELETE handler)
T-14.3 (Haiku: update bank route paths in spec)
T-14.4 (Haiku: fix spec contract discrepancies)
T-14.5 (Sonnet: implement payment voucher PDF)
```

All tasks are independent and can run in parallel.

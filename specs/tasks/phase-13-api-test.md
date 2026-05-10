# Phase 13 — API Integration Test

**Goal:** Test every API endpoint with real HTTP calls (curl). Identify auth failures, missing routes, wrong response shapes, and seed-data gaps. Each Haiku worker tests one module; Sonnet synthesizes findings into a prioritized fix plan.
**Pre-condition:** API server running at `http://localhost:3001`, Web at `http://localhost:3000`.
**Acceptance:** `docs/test/api-*.md` exist for all modules; `specs/tasks/phase-14-api-fixes.md` produced by T-13.6.

## Conventions

- **Language:** English only.
- **Status checkbox:** `- [ ]` Not started → `- [~]` In progress → `- [x]` Done. NEVER mark `[x]` unless `Done when` verified.
- **Phase progress:** When all tasks `[x]`, mark done in `specs/tasks/PROGRESS.md`.

## Auth Setup

T-13.0 writes the session cookie to `docs/test/auth.txt` in this format:
```
wind-acc-session=<value>
```
All T-13.1–T-13.5 workers read this file and pass it as `-H "Cookie: $(cat docs/test/auth.txt)"` in every curl call.

## Report Format (all test tasks)

Each worker writes a markdown report with this structure per endpoint:

```markdown
### [METHOD] [path]
- **Status:** [actual HTTP status]
- **Expected:** [status from specs/05-api-contracts.md]
- **Result:** PASS | FAIL
- **Error:** [response body or error message if FAIL]
- **Severity:** Critical | High | Medium | Low | N/A
```

Severity guide:
- **Critical** — 500 server error or auth bypass
- **High** — 401/403 on an endpoint that should be accessible, or 404 on a required endpoint
- **Medium** — 200 but response shape missing required fields
- **Low** — Minor deviation (extra fields, slightly wrong format)

## Model Assignment Guide (for T-13.6)

When writing `phase-14-api-fixes.md`, T-13.6 MUST assign a model to each fix task using these rules:

- **Haiku** — mechanical fix: add missing response field, fix route URL typo, change HTTP method, add missing `await`, rename a variable
- **Sonnet** — logic fix: auth middleware gap, incorrect business logic, missing route handler, complex query bug, seed data generation
- **Opus** — do NOT use for Phase 14; all fixes should be Haiku or Sonnet

## Dependency Graph

```
T-13.0 (Sonnet: setup + login + seed check)
  ├─ T-13.1 (Haiku: GL + Periods)
  ├─ T-13.2 (Haiku: AR)
  ├─ T-13.3 (Haiku: AP)
  ├─ T-13.4 (Haiku: Tax + Bank)
  └─ T-13.5 (Haiku: Reports)
       └─ T-13.6 (Sonnet: synthesize → phase-14-api-fixes.md)
```

---

## Tasks

### T-13.0 — Environment setup, auth, seed verification

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/test/setup.md`, `docs/test/auth.txt`
- **Reads:** `apps/api/src/middleware/auth-guard.ts`, `apps/web/src/middleware.ts`, `apps/web/src/lib/api-client.ts`, `apps/api/src/routes/auth.ts`, `apps/api/prisma/seed.ts`, `.env`
- **Spec:**

  **Step 1 — Verify environment:**
  ```bash
  # Check .env NEXT_PUBLIC_API_URL is localhost
  grep NEXT_PUBLIC_API_URL .env
  # Check API is up
  curl -s http://localhost:3001/health
  # Check Web is up
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
  ```
  Write results to `docs/test/setup.md`.

  **Step 2 — Cookie name consistency check:**
  Read `apps/api/src/middleware/auth-guard.ts` — find the cookie name used (`cookie.xxx`).
  Read `apps/web/src/middleware.ts` — find the cookie name checked.
  Read `apps/web/src/lib/api-client.ts` — verify `credentials: "include"` is set.
  If cookie names mismatch between API and web middleware, document as Critical issue in `docs/test/setup.md`.

  **Step 3 — Seed verification:**
  ```bash
  # Count critical seed rows via API (no auth needed for health, use auth for data)
  # First: try to get accounts list without auth — expect 401
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/accounts
  ```

  **Step 4 — Login and capture session cookie:**
  ```bash
  # Try default seed credentials (check prisma/seed.ts for the admin user email/password)
  curl -s -c /tmp/wind-cookies.txt -X POST http://localhost:3001/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"<admin-email-from-seed>","password":"<admin-password-from-seed>"}'
  ```
  If login succeeds (200), extract the cookie:
  ```bash
  grep wind-acc-session /tmp/wind-cookies.txt | awk '{print "wind-acc-session="$NF}' > docs/test/auth.txt
  cat docs/test/auth.txt
  ```
  If login fails: try other seeded users. Document which credentials work.

  **Step 5 — Verify authenticated request works:**
  ```bash
  curl -s -H "Cookie: $(cat docs/test/auth.txt)" http://localhost:3001/api/v1/accounts | head -c 200
  ```
  If still 401: the cookie is not being accepted — document as Critical. Check if DB has seed data:
  ```bash
  # If psql available:
  psql "$DATABASE_URL" -c "SELECT count(*) FROM users;" 2>/dev/null || echo "psql not available"
  ```
  If DB is empty, run seed: `bun run --cwd apps/api db:seed`

  Write full findings (env status, cookie check, seed status, login result) to `docs/test/setup.md`.
  Write ONLY the cookie line (e.g. `wind-acc-session=eyJhbG...`) to `docs/test/auth.txt`.

- **Depends on:** —
- **Blocks:** T-13.1, T-13.2, T-13.3, T-13.4, T-13.5
- **Done when:** `docs/test/auth.txt` exists and contains a non-empty cookie value; `docs/test/setup.md` documents all 5 steps above.
- **Budget USD:** 1.00
- **Timeout Min:** 20

---

### T-13.1 — GL + Periods API test

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/test/api-gl.md`
- **Reads:** `docs/test/auth.txt`, `specs/05-api-contracts.md` (GL + Periods sections), `apps/api/src/routes/accounts.ts`, `apps/api/src/routes/journal-entries.ts`, `apps/api/src/routes/periods.ts`
- **Spec:**

  Read `docs/test/auth.txt` for the session cookie. Test every GL and Periods endpoint below with curl. Use `AUTH=$(cat docs/test/auth.txt)` and pass `-H "Cookie: $AUTH"`.

  **Endpoints to test:**

  GL Accounts:
  - `GET /api/v1/accounts` — list all accounts
  - `GET /api/v1/accounts?type=ASSET` — filter by type
  - `GET /api/v1/accounts/1000` — get account by code (use a real code from the list response)
  - `POST /api/v1/accounts` — create account (send minimal valid body from spec)
  - `PATCH /api/v1/accounts/TEST-001` — update (use the created account)
  - `DELETE /api/v1/accounts/TEST-001` — soft delete (if endpoint exists)

  Journal Entries:
  - `GET /api/v1/journal-entries` — list
  - `GET /api/v1/journal-entries?status=POSTED` — filter
  - `POST /api/v1/journal-entries` — create draft (balanced lines from spec)
  - `POST /api/v1/journal-entries/:id/post` — post it
  - `POST /api/v1/journal-entries/:id/void` — void it

  Periods:
  - `GET /api/v1/periods` — list all periods
  - `POST /api/v1/periods/:code/close` — close a period (use a past period code)
  - `POST /api/v1/periods/:code/reopen` — reopen it

  For each endpoint: run curl, capture status + first 300 chars of response body. Write report to `docs/test/api-gl.md` using the standard format. Note any 401, 403, 404, 500 as issues with severity.

- **Depends on:** T-13.0
- **Blocks:** T-13.6
- **Done when:** `docs/test/api-gl.md` exists with a result row for every endpoint listed above.
- **Budget USD:** 0.30
- **Timeout Min:** 30

---

### T-13.2 — AR API test

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/test/api-ar.md`
- **Reads:** `docs/test/auth.txt`, `specs/05-api-contracts.md` (AR section), `apps/api/src/routes/customers.ts`, `apps/api/src/routes/sales-invoices.ts`, `apps/api/src/routes/receipts.ts`
- **Spec:**

  Read `docs/test/auth.txt`. Test every AR endpoint:

  Customers:
  - `GET /api/v1/customers` — list
  - `POST /api/v1/customers` — create (minimal valid body)
  - `GET /api/v1/customers/:id` — get detail
  - `PATCH /api/v1/customers/:id` — update

  Sales Invoices:
  - `GET /api/v1/sales-invoices` — list
  - `GET /api/v1/sales-invoices?status=DRAFT` — filter
  - `POST /api/v1/sales-invoices` — create draft invoice (use seeded customer)
  - `POST /api/v1/sales-invoices/:id/post` — post it
  - `GET /api/v1/sales-invoices/:id` — get detail with lines
  - `POST /api/v1/sales-invoices/:id/void` — void it

  Receipts:
  - `GET /api/v1/receipts` — list
  - `POST /api/v1/receipts` — create (apply to a posted invoice)
  - `GET /api/v1/receipts/:id` — get detail

  AR Aging:
  - `GET /api/v1/reports/ar-aging?as_of=2026-05-09&branch=ALL&format=json`

  Write results to `docs/test/api-ar.md`.

- **Depends on:** T-13.0
- **Blocks:** T-13.6
- **Done when:** `docs/test/api-ar.md` exists with result rows for all endpoints above.
- **Budget USD:** 0.30
- **Timeout Min:** 30

---

### T-13.3 — AP API test

- [x] **Status:** Done (2026-05-09)
- **Model:** Haiku
- **Files:** `docs/test/api-ap.md`
- **Reads:** `docs/test/auth.txt`, `specs/05-api-contracts.md` (AP section), `apps/api/src/routes/vendors.ts`, `apps/api/src/routes/bills.ts`, `apps/api/src/routes/payments.ts`
- **Spec:**

  Read `docs/test/auth.txt`. Test every AP endpoint:

  Vendors:
  - `GET /api/v1/vendors` — list
  - `POST /api/v1/vendors` — create
  - `GET /api/v1/vendors/:id` — detail
  - `PATCH /api/v1/vendors/:id` — update

  Bills:
  - `GET /api/v1/bills` — list
  - `POST /api/v1/bills` — create draft bill
  - `GET /api/v1/bills/:id` — detail with lines
  - `POST /api/v1/bills/:id/post` — post
  - `POST /api/v1/bills/:id/void` — void

  Payments:
  - `GET /api/v1/payments` — list (check: is this `/ap/payments` or `/payments`? verify from route file)
  - `POST /api/v1/payments` — create (apply to posted bill)
  - `GET /api/v1/payments/:id` — detail

  AP Aging:
  - `GET /api/v1/reports/ap-aging?as_of=2026-05-09&branch=ALL&format=json`

  Write results to `docs/test/api-ap.md`.

- **Depends on:** T-13.0
- **Blocks:** T-13.6
- **Done when:** `docs/test/api-ap.md` exists with result rows for all endpoints above.
- **Budget USD:** 0.30
- **Timeout Min:** 30

---

### T-13.4 — Tax + Bank API test

- [x] **Status:** Done (2026-05-09)
- **Model:** Haiku
- **Files:** `docs/test/api-tax-bank.md`
- **Reads:** `docs/test/auth.txt`, `specs/05-api-contracts.md` (Tax + Bank sections), `apps/api/src/routes/tax-filings.ts`, `apps/api/src/routes/bank-accounts.ts`, `apps/api/src/routes/bank.ts`
- **Spec:**

  Read `docs/test/auth.txt`. Test:

  Tax — VAT (ภพ.30):
  - `GET /api/v1/tax/pp30` — list filings
  - `GET /api/v1/tax/pp30/aggregate?period=2026-05` — VAT aggregate for period
  - `POST /api/v1/tax/pp30` — create filing draft
  - `GET /api/v1/tax/pp30/:id`
  - `POST /api/v1/tax/pp30/:id/finalize`

  Tax — WHT ภงด.3:
  - `GET /api/v1/tax/pnd3` — list
  - `POST /api/v1/tax/pnd3` — create
  - `GET /api/v1/tax/pnd3/:id`

  Tax — WHT ภงด.53:
  - `GET /api/v1/tax/pnd53` — list
  - `POST /api/v1/tax/pnd53` — create
  - `GET /api/v1/tax/pnd53/:id`

  Tax — WHT Certs:
  - `GET /api/v1/tax/wht-certs` — list

  Bank Accounts:
  - `GET /api/v1/bank-accounts` — list
  - `GET /api/v1/bank-accounts/:id` — detail with transactions
  - `POST /api/v1/bank-accounts/:id/import` — mock import (send empty or mock payload per spec)

  Bank Reconciliation:
  - `GET /api/v1/bank-accounts/:id/reconcile` — get reconciliation state

  Write results to `docs/test/api-tax-bank.md`.

- **Depends on:** T-13.0
- **Blocks:** T-13.6
- **Done when:** `docs/test/api-tax-bank.md` exists with result rows for all endpoints above.
- **Budget USD:** 0.30
- **Timeout Min:** 30

---

### T-13.5 — Reports API test

- [x] **Status:** Done (2026-05-09)
- **Model:** Haiku
- **Files:** `docs/test/api-reports.md`
- **Reads:** `docs/test/auth.txt`, `specs/05-api-contracts.md` (Reports section), `apps/api/src/routes/reports.ts`
- **Spec:**

  Read `docs/test/auth.txt`. Test all report endpoints with `format=json`:

  - `GET /api/v1/reports/trial-balance?as_of=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/profit-loss?from=2026-01-01&to=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/profit-loss?from=2026-01-01&to=2026-05-09&compare_from=2025-01-01&compare_to=2025-12-31&branch=ALL&format=json`
  - `GET /api/v1/reports/balance-sheet?as_of=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/cash-flow?from=2026-01-01&to=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/general-ledger?account_code=1000&from=2026-01&to=2026-05&branch=ALL&format=json`
  - `GET /api/v1/reports/ar-aging?as_of=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/ap-aging?as_of=2026-05-09&branch=ALL&format=json`
  - `GET /api/v1/reports/vat-summary?from=2026-01&to=2026-05&format=json`
  - `GET /api/v1/reports/branch-pnl?from=2026-01-01&to=2026-05-09&format=json`
  - `GET /api/v1/reports/cash-position?as_of=2026-05-09&format=json`

  Also test export formats for one report:
  - `GET /api/v1/reports/trial-balance?as_of=2026-05-09&branch=ALL&format=csv` — check Content-Type: text/csv
  - `GET /api/v1/reports/trial-balance?as_of=2026-05-09&branch=ALL&format=xlsx` — check Content-Type header

  Write results to `docs/test/api-reports.md`.

- **Depends on:** T-13.0
- **Blocks:** T-13.6
- **Done when:** `docs/test/api-reports.md` exists with result rows for all 13 calls above.
- **Budget USD:** 0.30
- **Timeout Min:** 30

---

### T-13.6 — Synthesize test results → Phase 14 fix plan

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `specs/tasks/phase-14-api-fixes.md`
- **Reads:** `docs/test/setup.md`, `docs/test/api-gl.md`, `docs/test/api-ar.md`, `docs/test/api-ap.md`, `docs/test/api-tax-bank.md`, `docs/test/api-reports.md`, `docs/audit/summary.md`
- **Spec:**

  Read all 6 test result files. Identify every FAIL result. Group by root cause. Write `specs/tasks/phase-14-api-fixes.md`.

  **Grouping strategy:**
  - Group all 401/403 auth failures together if same root cause (e.g., missing middleware on a router)
  - Group all 404s for a module together (missing route handler)
  - Group 500s by error type
  - Group "wrong shape" (200 but missing fields) by module

  **Task sizing:** Each fix task covers ONE cohesive root cause across related endpoints. Max 10 file edits per task.

  **Required fields per task** (same format as Phase 12):
  ```
  ### T-14.N — [Title]
  - [ ] **Status:** Not started
  - **Model:** Haiku | Sonnet   ← assign per Model Assignment Guide
  - **Files:** `apps/api/src/routes/...`
  - **Reads:** `docs/test/api-X.md` (relevant sections), `specs/05-api-contracts.md`
  - **Spec:** [Precise instructions quoting the failing endpoint and expected fix]
  - **Depends on:** — or T-14.X
  - **Blocks:** —
  - **Done when:** [curl command that should now return expected status]
  - **Budget USD:** 0.30 (Haiku) | 1.50 (Sonnet)
  - **Timeout Min:** 20 (Haiku) | 40 (Sonnet)
  ```

  If ALL endpoints PASS (no failures): write `specs/tasks/phase-14-api-fixes.md` with a note "All endpoints passed — no fix tasks required" and mark this task done.

- **Depends on:** T-13.1, T-13.2, T-13.3, T-13.4, T-13.5
- **Blocks:** —
- **Done when:** `specs/tasks/phase-14-api-fixes.md` exists and covers every FAIL from the test reports, with correct model assignments.
- **Budget USD:** 2.00
- **Timeout Min:** 40

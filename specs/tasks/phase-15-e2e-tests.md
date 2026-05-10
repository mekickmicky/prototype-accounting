# Phase 15 — End-to-End UI Tests (Playwright)

**Goal:** Test every web page and user-facing feature with real browser automation against the running stack. Each test verifies both UI behavior AND data accuracy (numbers rendered must match API response). No mocking — real DB, real API, real browser.

**Pre-condition:** Docker running. E2E stack (3× isolated DB + API + Web instances) started by Playwright `globalSetup`. Production dev servers on 3000/3001 are NOT used.

**Acceptance:** All spec files in `apps/web/e2e/flows/` pass. CRITICAL test cases (marked 🔴 in each task) MUST pass 100%. Other cases ≥95% pass rate. Any failure produces fix task in T-15.8.

## Conventions

- **Language:** English only.
- **Status checkbox:** `- [ ]` Not started → `- [~]` In progress → `- [x]` Done.
- **Test file format:** Each spec file uses `test.describe.serial` (sequential within file) + `test()` blocks. `beforeAll` calls `data.ts` helpers to seed THIS spec's data via API. No cross-spec data dependencies.
- **Data isolation:** Tests run in 3 parallel isolated stacks (see Docker section). Within a stack, data persists between tests in the same spec file but is reset before next full run.
- **Assertion precision:** All monetary assertions use `toContainText` on the formatted string (e.g., `"1,000.00"`) — never parse numbers back to floats.
- **Selector priority:** (1) `data-testid="..."` — preferred. (2) ARIA role + accessible name. (3) Text content (English only — Thai labels are too brittle). (4) CSS — last resort.

## Auth Mechanism

Login is mock (no password). Flow:
1. `GET /api/v1/auth/users` → get list of users with IDs
2. Web login page shows user selector — find user by email, click/select, submit
3. Session cookie `wind-acc-session` is set — all subsequent requests are authenticated

Users available:
- `admin@wind` — ADMIN role (full access)
- `aow@wind` — ACCOUNTANT role
- `viewer1@wind` — VIEWER role (read-only)

## Test Environment Isolation (Docker)

To enable Playwright `workers=3` without race conditions, each worker runs against its own isolated stack: independent DB + API process + Web process.

**Port allocation (worker index 0/1/2):**

| Worker | Database | API port | Web port |
|---|---|---|---|
| 0 | `wind_e2e_w0` | 4001 | 4101 |
| 1 | `wind_e2e_w1` | 4002 | 4102 |
| 2 | `wind_e2e_w2` | 4003 | 4103 |

**Docker compose** (`docker-compose.e2e.yml`) starts 1 PostgreSQL on port `5434` with 3 pre-created databases. Sister postgres on 5433 (dev) is untouched.

**Lifecycle:**
1. `globalSetup` runs `docker compose -f docker-compose.e2e.yml up -d` then waits for postgres healthy.
2. `globalSetup` runs `prisma migrate deploy` + seed against each of the 3 DBs.
3. `globalSetup` spawns 3× API + 3× Web processes (background), each pinned to its DB and port. Waits for all `/health` to return 200.
4. Playwright tests run, each worker reads `process.env.TEST_PARALLEL_INDEX` (0/1/2) to pick its `baseURL`.
5. `globalTeardown` kills the 6 spawned processes and runs `docker compose -f docker-compose.e2e.yml down -v` (volume removal — ephemeral DB).

## Playwright Config (created by T-15.0)

```
apps/web/
  e2e/
    fixtures/
      auth.ts          ← storageState per role × per worker
      data.ts          ← helper to seed each spec's data via API
      stack.ts         ← maps worker index → API/Web URL
    flows/
      01-gl.spec.ts
      02-ar.spec.ts
      03-ap.spec.ts
      04-tax.spec.ts
      05-bank.spec.ts
      06-reports.spec.ts
      07-dashboard-settings-guards.spec.ts
      08-pdf-exports.spec.ts        ← T-15.9
      09-webhook-integration.spec.ts ← T-15.10
    global-setup.ts                  ← starts docker + 6 servers
    global-teardown.ts               ← kills servers + tears down docker
    playwright.config.ts
docker-compose.e2e.yml
scripts/
  e2e-init.sql                       ← creates 3 DBs
  e2e-stack.ts                       ← spawns/kills API+Web processes
```

## Dependency Graph

```
T-15.0  (Sonnet: docker + isolated-stack infra + auth fixture)
  └─ T-15.0b (Sonnet: data-testid attributes on tested pages)
       ├─ T-15.1  (Sonnet: GL)
       ├─ T-15.2  (Sonnet: AR + dynamic line items)
       ├─ T-15.3  (Sonnet: AP + dynamic line items)
       ├─ T-15.4  (Sonnet: Tax)
       ├─ T-15.5  (Sonnet: Bank)
       ├─ T-15.6  (Opus:  Reports + cross-validation)
       ├─ T-15.7  (Sonnet: Dashboard + Settings + Guards)
       ├─ T-15.9  (Sonnet: PDF exports — Invoice, PP30, PND3/53, WHT cert)
       └─ T-15.10 (Sonnet: Webhook integration — wind-clinic visit.completed)
            └─ T-15.8 (Haiku/Sonnet: fix failures from any of the above)
```

---

## Tasks

### T-15.0 — Docker E2E stack, isolated DBs, Playwright config, fixtures

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/playwright.config.ts`, `apps/web/e2e/global-setup.ts`, `apps/web/e2e/global-teardown.ts`, `apps/web/e2e/fixtures/auth.ts`, `apps/web/e2e/fixtures/data.ts`, `apps/web/e2e/fixtures/stack.ts`, `docker-compose.e2e.yml`, `scripts/e2e-init.sql`, `scripts/e2e-stack.ts`, `apps/web/package.json` (add `test:e2e` script)
- **Reads:** `apps/web/src/app/login/page.tsx`, `apps/api/src/routes/auth.ts`, `apps/web/src/lib/api-client.ts`, `apps/api/prisma/seed.ts`, `docker-compose.yml` (existing dev compose for reference), `.env`
- **Spec:**

  **Step 1 — Install Playwright:**
  ```bash
  bun add -D @playwright/test --cwd apps/web
  cd apps/web && bunx playwright install chromium --with-deps
  ```

  **Step 2 — Create `docker-compose.e2e.yml` at repo root:**
  ```yaml
  services:
    postgres-e2e:
      image: postgres:16-alpine
      environment:
        POSTGRES_USER: wind
        POSTGRES_PASSWORD: wind_dev
        POSTGRES_DB: wind_e2e_w0
      ports:
        - "5434:5432"
      volumes:
        - ./scripts/e2e-init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U wind -d wind_e2e_w0"]
        interval: 2s
        timeout: 3s
        retries: 30
  ```

  **Step 3 — Create `scripts/e2e-init.sql`:**
  ```sql
  CREATE DATABASE wind_e2e_w1;
  CREATE DATABASE wind_e2e_w2;
  GRANT ALL PRIVILEGES ON DATABASE wind_e2e_w1 TO wind;
  GRANT ALL PRIVILEGES ON DATABASE wind_e2e_w2 TO wind;
  ```

  **Step 4 — Create `scripts/e2e-stack.ts`:**
  - Exports `start()` and `stop()` functions
  - `start()`: for each worker index 0/1/2, spawns 1 API process and 1 Web process with the right env:
    - API: `DATABASE_URL=postgresql://wind:wind_dev@localhost:5434/wind_e2e_w{N} PORT={4001+N} JWT_SECRET=test-secret bun run --cwd apps/api start`
    - Web: `NEXT_PUBLIC_API_URL=http://localhost:{4001+N} PORT={4101+N} bun run --cwd apps/web start`
  - Use `child_process.spawn`, store PIDs in `.e2e-pids.json` for teardown
  - Wait for all 6 processes to be healthy: `GET http://localhost:{port}/health` for API; `GET http://localhost:{port}` for Web (200/307 OK)
  - `stop()`: read `.e2e-pids.json`, kill all PIDs, delete the file

  **Step 5 — Create `apps/web/e2e/global-setup.ts`:**
  ```ts
  import { execSync } from 'node:child_process';
  import { start } from '../../../scripts/e2e-stack';

  export default async function globalSetup() {
    console.log('[e2e] Starting docker postgres...');
    execSync('docker compose -f docker-compose.e2e.yml up -d --wait', { stdio: 'inherit', cwd: '../..' });

    console.log('[e2e] Running migrations + seed on each worker DB...');
    for (const w of [0, 1, 2]) {
      const url = `postgresql://wind:wind_dev@localhost:5434/wind_e2e_w${w}`;
      execSync(`DATABASE_URL=${url} bun run --cwd apps/api db:migrate:deploy`, { stdio: 'inherit', cwd: '../..' });
      execSync(`DATABASE_URL=${url} bun run --cwd apps/api db:seed`, { stdio: 'inherit', cwd: '../..' });
    }

    console.log('[e2e] Spawning 3× API + 3× Web...');
    await start();

    console.log('[e2e] Pre-creating auth storageState for each role × worker...');
    // For each (worker, role) combo: programmatically log in and save storageState
    // to apps/web/e2e/fixtures/.auth-{role}-w{N}.json
    // (implementation in fixtures/auth.ts — call from here)
  }
  ```

  **Step 6 — Create `apps/web/e2e/global-teardown.ts`:**
  ```ts
  import { execSync } from 'node:child_process';
  import { stop } from '../../../scripts/e2e-stack';

  export default async function globalTeardown() {
    await stop();
    if (!process.env.E2E_KEEP_DB) {
      execSync('docker compose -f docker-compose.e2e.yml down -v', { cwd: '../..', stdio: 'inherit' });
    }
  }
  ```

  **Step 7 — Create `apps/web/e2e/fixtures/stack.ts`:**
  ```ts
  // Maps worker index → URLs for that worker's isolated stack
  export function stackForWorker(workerIndex: number) {
    return {
      apiUrl: `http://localhost:${4001 + workerIndex}`,
      webUrl: `http://localhost:${4101 + workerIndex}`,
      dbName: `wind_e2e_w${workerIndex}`,
    };
  }
  ```

  **Step 8 — Create `apps/web/e2e/fixtures/auth.ts`:**
  - For each role × worker combination, log in via API directly and save cookie to `storageState` JSON file (`fixtures/.auth-{role}-w{N}.json`)
  - Login flow: `GET ${apiUrl}/api/v1/auth/users` → find user by email → `POST ${apiUrl}/api/v1/auth/login` with `{user_id}` → capture `Set-Cookie` header → write Playwright storageState
  - Export Playwright fixtures: `adminTest`, `accountantTest`, `viewerTest` — each extends `test` and provides a context with the right storageState for the worker
  - Read `apps/web/src/app/login/page.tsx` ONLY to confirm UI shape — actual login for fixture is API-direct (faster, more reliable)

  **Step 9 — Create `apps/web/e2e/fixtures/data.ts`:**
  Helpers that call the worker's isolated API directly (with admin cookie) to seed prerequisite data BEFORE a spec runs:
  ```ts
  export async function ensureCustomer(workerIndex, name) { ... }
  export async function ensureVendor(workerIndex, name, whtRate) { ... }
  export async function ensurePostedInvoice(workerIndex, customerId, lines) { ... }
  export async function ensurePostedBill(workerIndex, vendorId, lines) { ... }
  export async function ensurePostedReceipt(workerIndex, invoiceId, amount) { ... }
  export async function ensurePostedPayment(workerIndex, billId, amount) { ... }
  export async function ensureClosedPeriod(workerIndex, periodCode) { ... }
  export async function resetWorkerData(workerIndex) {
    // Truncates only test-created rows (where document_no LIKE 'TEST-%') — NOT seed data
    // Called optionally from beforeAll when a spec needs a clean slate
  }
  ```
  Each function is idempotent: returns existing record if already created, or creates new with deterministic name like `E2E-{spec-id}-{purpose}`.

  **Step 10 — Create `apps/web/playwright.config.ts`:**
  ```ts
  import { defineConfig, devices } from '@playwright/test';
  export default defineConfig({
    testDir: './e2e/flows',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 3,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    globalSetup: require.resolve('./e2e/global-setup'),
    globalTeardown: require.resolve('./e2e/global-teardown'),
    reporter: [['html', { open: 'never' }], ['list']],
    use: {
      // baseURL is set per-test from the worker index — see fixtures/auth.ts
      trace: 'on-first-retry',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  });
  ```

  **Step 11 — Add to `apps/web/package.json`:**
  ```json
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
  ```

  **Step 12 — Verify the entire stack boots:**
  ```bash
  cd apps/web && bun run test:e2e --list
  # Should print: list of test cases from spec files (created by T-15.1+)
  # Then run a tiny smoke test: navigate to /login on each worker's web URL
  ```

- **Depends on:** —
- **Blocks:** T-15.0b, T-15.1, T-15.2, T-15.3, T-15.4, T-15.5, T-15.6, T-15.7, T-15.9, T-15.10
- **Done when:**
  ```bash
  cd apps/web && bun run test:e2e --list
  # Exits 0 (lists tests if any exist, or empty list if no spec files yet)
  docker ps | grep postgres-e2e         # postgres-e2e container running
  curl -s http://localhost:4001/health  # API worker 0 healthy
  curl -s http://localhost:4101         # Web worker 0 returns 200/307
  ls apps/web/e2e/fixtures/.auth-*.json # 9 storageState files (3 roles × 3 workers)
  ```
- **Budget USD:** 3.00
- **Timeout Min:** 60

---

### T-15.0b — Add `data-testid` attributes to all pages used by E2E tests

- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** edits to all `apps/web/src/app/(authenticated)/**/page.tsx` and shared components in `apps/web/src/components/`
- **Reads:** `apps/web/src/components/ui/data-table.tsx`, `apps/web/src/components/ui/page-header.tsx`, all page files listed in T-15.1–T-15.7 + T-15.9–T-15.10 Reads sections
- **Spec:**

  Add stable `data-testid` attributes to ALL elements that E2E tests will locate. This eliminates brittle text/Thai-label selectors.

  **Required `data-testid` patterns:**

  | Element | Pattern | Example |
  |---|---|---|
  | Page heading | `page-heading` | `<h1 data-testid="page-heading">บัญชีลูกค้า</h1>` |
  | Action button (primary) | `action-{verb}` | `data-testid="action-post"`, `action-void`, `action-save`, `action-submit`, `action-export-pdf`, `action-export-csv`, `action-export-xlsx`, `action-add-line`, `action-remove-line`, `action-close-period`, `action-reopen-period`, `action-finalize` |
  | Form field (input) | `field-{name}` | `data-testid="field-name"`, `field-tax-id`, `field-amount`, `field-date`, `field-customer`, `field-vendor`, `field-account`, `field-period`, `field-branch`, `field-from-date`, `field-to-date`, `field-vat-rate`, `field-qty`, `field-unit-price`, `field-description` |
  | Status badge | `status-badge` | (single element per row — combine with row context) |
  | Data table | `data-table` (root), `data-table-row` (each row), `data-table-cell-{column}` | `<tr data-testid="data-table-row" data-row-id="INV-2026-0001">` |
  | Total/sum cells | `total-{name}` | `data-testid="total-debit"`, `total-credit`, `total-vat`, `total-net`, `total-grand` |
  | Empty state | `empty-state` | |
  | Error message | `error-message` | (page-level) or `field-error-{name}` (per field) |
  | Loading skeleton | `loading` | |
  | Filter bar | `filter-bar`, plus `filter-{name}` per filter | |
  | Pagination | `pagination`, `pagination-next`, `pagination-prev`, `pagination-page-{n}` | |
  | Modal/Dialog | `dialog-{name}` | `data-testid="dialog-confirm-void"` |
  | KPI metric card | `metric-{name}` | `data-testid="metric-ar-outstanding"`, `metric-ap-outstanding` |

  **Concrete pages to update (priority order):**

  1. `gl/journal-entries/[id]/page.tsx` — JE detail (action-post, action-void, total-debit, total-credit)
  2. `gl/journal-entries/new/page.tsx` — JE form (field-date, field-description, field-account-{idx}, field-debit-{idx}, field-credit-{idx}, action-add-line, action-submit)
  3. `gl/accounts/page.tsx` — list (data-table, action-new-account, filter-type)
  4. `gl/periods/page.tsx` — list (action-close-period-{code}, action-reopen-period-{code})
  5. `ar/customers/new/page.tsx`, `ar/invoices/new/page.tsx`, `ar/receipts/new/page.tsx`
  6. `ar/invoices/[id]/page.tsx`, `ar/receipts/[id]/page.tsx`
  7. `ap/vendors/new/page.tsx`, `ap/bills/new/page.tsx`, `ap/payments/new/page.tsx`
  8. `ap/bills/[id]/page.tsx`, `ap/payments/[id]/page.tsx`
  9. `tax/pp30/new/page.tsx`, `tax/pp30/[id]/page.tsx`, `tax/pnd3/[id]/page.tsx`, `tax/pnd53/[id]/page.tsx`, `tax/wht-certs/page.tsx`
  10. `bank/import/page.tsx`, `bank/reconcile/[account_id]/page.tsx`
  11. All 9 reports pages — `filter-{name}`, `action-export-csv`, `action-export-xlsx`, `total-debit`/`total-credit`/`total-net-income`, `metric-{name}`
  12. `dashboard/page.tsx` — `metric-{name}` for each KPI card
  13. `settings/account-map/page.tsx`, `settings/audit-log/page.tsx`, `settings/integrations/test/page.tsx`, `settings/integrations/dashboard/page.tsx`
  14. `login/page.tsx` — `field-user-select`, `action-login`

  **Convention enforcement:**
  - Reuse the same testid name across pages (e.g., `action-save` always means primary submit)
  - For elements rendered in a list (table rows), put testid on the wrapper and add a `data-row-id` data attribute for the unique identifier
  - Don't add testids to elements that tests won't locate (avoid noise)

- **Depends on:** T-15.0
- **Blocks:** T-15.1, T-15.2, T-15.3, T-15.4, T-15.5, T-15.6, T-15.7, T-15.9, T-15.10
- **Done when:**
  ```bash
  # All listed pages contain at least one data-testid
  for p in gl/journal-entries/[id] ar/invoices/[id] ap/bills/[id] tax/pp30/[id]; do
    grep -l "data-testid" "apps/web/src/app/(authenticated)/$p/page.tsx" || echo "MISSING: $p"
  done
  # No "MISSING" output
  ```
- **Budget USD:** 2.50
- **Timeout Min:** 50

---

### T-15.1 — GL module: Accounts, Journal Entries, Periods

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/01-gl.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/e2e/fixtures/data.ts`, `apps/web/src/app/(authenticated)/gl/accounts/page.tsx`, `apps/web/src/app/(authenticated)/gl/accounts/[code]/page.tsx`, `apps/web/src/app/(authenticated)/gl/journal-entries/page.tsx`, `apps/web/src/app/(authenticated)/gl/journal-entries/new/page.tsx`, `apps/web/src/app/(authenticated)/gl/journal-entries/[id]/page.tsx`, `apps/web/src/app/(authenticated)/gl/periods/page.tsx`, `specs/02-business-rules.md`
- **Spec:**

  Write `apps/web/e2e/flows/01-gl.spec.ts`. Use `adminTest` fixture (from `fixtures/auth.ts`). Use `test.describe.serial` so cases within this file run in order (this file's stack is isolated from other workers, so this is safe).

  **Pre-condition (in `beforeAll` block):**
  - Receive `workerIndex` from `testInfo.parallelIndex`
  - This spec needs ONLY seed data (91 accounts, 60 periods) which `globalSetup` already created. No additional data needed.
  - Set `page.context()` baseURL to `http://localhost:${4101 + workerIndex}`.

  **Critical cases (must pass 100%):** GL-04, GL-09, GL-10, GL-11, GL-12, GL-15, GL-16

  **Detailed step-by-step interactions** (referenced from generic `data-testid` set by T-15.0b):

  **Test cases (minimum 15):**

  **GL-01: Chart of Accounts list renders**
  - Navigate to `/gl/accounts`
  - Assert: page heading visible, account rows present (≥91 rows from seed)
  - Assert: type filter dropdown renders with options ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  - Verify: at least one account with code `11000` visible in the list

  **GL-02: Filter accounts by type**
  - On `/gl/accounts`, select type filter = `ASSET`
  - Assert: all visible rows show type badge = "Asset" (or Thai equivalent)
  - Assert: no EXPENSE/REVENUE rows visible
  - Clear filter → all accounts return

  **GL-03: Account detail page — balance and hierarchy**
  - Navigate to `/gl/accounts/11000`
  - Assert: account name, code, type render correctly
  - Assert: current_balance displays as a formatted number (e.g., `0.00` or non-null)
  - Assert: parent/children breadcrumb or section present

  **GL-04: Create new account — valid 🔴**
  - Click `[data-testid="action-new-account"]` (or navigate directly to `/gl/accounts/new` if no button)
  - Fill `[data-testid="field-code"]` → `TEST01`
  - Fill `[data-testid="field-name-en"]` → `E2E Test Account`
  - Fill `[data-testid="field-name-th"]` → `บัญชีทดสอบ E2E`
  - Select `[data-testid="field-type"]` → `EXPENSE`
  - Select `[data-testid="field-parent"]` → `50000` (use search/typeahead if present)
  - Check `[data-testid="field-postable"]` (if checkbox)
  - Click `[data-testid="action-submit"]`
  - Assert: URL changes to `/gl/accounts` OR success message appears
  - Assert: `[data-testid="data-table"]` contains a row where `[data-row-id="TEST01"]` exists
  - Cleanup is unnecessary (worker DB is reset between full runs)

  **GL-05: Create account — duplicate code error**
  - Click new-account, fill code = `11000` (already exists from seed), name = `Dup`, type = `ASSET`, parent = `10000`
  - Click `[data-testid="action-submit"]`
  - Assert: `[data-testid="error-message"]` OR `[data-testid="field-error-code"]` is visible with text containing `duplicate` OR `already exists` OR `code`
  - Assert: still on form page (URL contains `/new`)

  **GL-06: Edit account name**
  - Navigate to `/gl/accounts/TEST01` (created in GL-04)
  - Click edit button OR find inline editable field
  - Change name to `E2E Test Account Updated`
  - Click `[data-testid="action-save"]`
  - Assert: page reloads/updates, the new name is visible (`page.getByText('E2E Test Account Updated')` is visible)

  **GL-07: GL Dashboard renders**
  - Navigate to `/gl/dashboard`
  - Listen for console errors via `page.on('pageerror', ...)` and `page.on('console', msg => ...)` filtered to `error`
  - Assert: at least one `[data-testid^="metric-"]` element is visible
  - Assert: no console errors of type `error` were emitted during navigation

  **GL-08: Journal Entry list — filter by status**
  - Navigate to `/gl/journal-entries`
  - Assert: `[data-testid="data-table"]` is visible
  - Assert: `[data-testid="filter-status"]` is visible
  - Select filter value `POSTED`
  - Wait for table to update (network idle)
  - Assert: every row's `[data-testid="status-badge"]` text === `POSTED` (loop through all rows)

  **GL-09: Create balanced DRAFT Journal Entry 🔴**
  - Navigate to `/gl/journal-entries/new`
  - Fill `[data-testid="field-date"]` → today (`new Date().toISOString().slice(0,10)`)
  - Fill `[data-testid="field-description"]` → `E2E GL-09 Manual JE`
  - Select `[data-testid="field-source-type"]` → `MANUAL` (if visible)
  - Line 1: select `[data-testid="field-account-0"]` → `11010`, fill `[data-testid="field-debit-0"]` → `1000.00`, leave credit empty
  - Click `[data-testid="action-add-line"]`
  - Line 2: select `[data-testid="field-account-1"]` → `41100`, leave debit empty, fill `[data-testid="field-credit-1"]` → `1000.00`
  - Assert (live recalculation): `[data-testid="total-debit"]` text contains `1,000.00`, `[data-testid="total-credit"]` text contains `1,000.00`
  - Click `[data-testid="action-submit"]`
  - Wait for redirect to `/gl/journal-entries/{id}`
  - Capture the JE id from URL → store in test variable `geNineId`
  - Assert: `[data-testid="status-badge"]` text === `DRAFT`
  - Assert: page heading contains JE number matching pattern `/JE-\d{4}-\d{4,}/`

  **GL-10: Create unbalanced JE — must reject 🔴**
  - Navigate to `/gl/journal-entries/new`
  - Fill date = today, description = `E2E GL-10 Unbalanced`
  - Line 1: account = `11010`, debit = `500.00`
  - Add line 2: account = `41100`, credit = `400.00`
  - Assert: `[data-testid="total-debit"]` shows `500.00`, `[data-testid="total-credit"]` shows `400.00`
  - Click `[data-testid="action-submit"]`
  - Assert: `[data-testid="error-message"]` visible, text contains `balance` OR `debit must equal credit` OR `unbalanced`
  - Assert: URL still contains `/new` (no redirect occurred)
  - Cross-check via API: `GET ${apiUrl}/api/v1/journal-entries?description=E2E GL-10` returns 0 rows

  **GL-11: Post the DRAFT Journal Entry 🔴**
  - Capture pre-balance: `GET ${apiUrl}/api/v1/accounts/11010` → save `current_balance` as `preBalance`
  - Navigate to `/gl/journal-entries/${geNineId}` (id from GL-09)
  - Click `[data-testid="action-post"]`
  - If `[data-testid="dialog-confirm-post"]` appears, click `[data-testid="action-confirm"]`
  - Assert: `[data-testid="status-badge"]` text === `POSTED`
  - Assert: `[data-testid="action-post"]` is no longer visible
  - Assert: `[data-testid="action-void"]` IS visible
  - Cross-check via API: `GET ${apiUrl}/api/v1/accounts/11010` → `current_balance` = `preBalance + 1000.00` (use Decimal compare to the cent)

  **GL-12: Void a POSTED Journal Entry 🔴**
  - On the JE from GL-11 (still on detail page or navigate back to it)
  - Click `[data-testid="action-void"]`
  - In `[data-testid="dialog-confirm-void"]`: fill `[data-testid="field-void-reason"]` → `E2E test void`, click `[data-testid="action-confirm"]`
  - Assert: `[data-testid="status-badge"]` text === `VOID`
  - Navigate to `/gl/journal-entries`, filter description contains `Reversal` OR navigate to the void detail page where reversing JE link is visible
  - Assert: a reversing JE exists with debit/credit lines flipped from original
  - Cross-check via API: `GET ${apiUrl}/api/v1/accounts/11010` → balance returned to original `preBalance`

  **GL-13: JE detail page — full field check**
  - Navigate to a POSTED JE (use `data.ts` helper `ensurePostedJournalEntry()` to create one if none exist, OR pick from list)
  - Assert each visible: `[data-testid="page-heading"]` (contains JE number), `[data-testid="field-date"]`, `[data-testid="field-branch"]`, `[data-testid="field-source-type"]`, `[data-testid="status-badge"]`
  - Assert: `[data-testid="data-table"]` contains 2+ line rows
  - For each line row: assert account code, account name, debit OR credit are non-empty
  - Assert: `[data-testid="total-debit"]` text === `[data-testid="total-credit"]` text (string equality after stripping commas/spaces)

  **GL-14: Periods list**
  - Navigate to `/gl/periods`
  - Assert: `[data-testid="data-table"]` has ≥12 rows
  - Assert: a row with `data-row-id="2026-05"` exists and its `[data-testid="status-badge"]` shows `OPEN`
  - Assert: each row's period code matches regex `/^\d{4}-\d{2}$/`

  **GL-15: Close and reopen a period 🔴**
  - On `/gl/periods`, find row with `data-row-id="2026-01"`
  - Verify status is `OPEN`. If `CLOSED`, the test environment is dirty — fail with clear message.
  - Click `[data-testid="action-close-period-2026-01"]`
  - In confirm dialog, click `[data-testid="action-confirm"]`
  - Assert: status badge for that row updates to `CLOSED` (network idle wait)
  - Click `[data-testid="action-reopen-period-2026-01"]`
  - Confirm dialog → assert status returns to `OPEN`

  **GL-16: Post JE into closed period — must reject**
  - Close period `2026-02` via API (`POST /api/v1/periods/2026-02/close`)
  - Attempt to create a new JE dated `2026-02-15` (in closed period)
  - Submit → assert error: "period is closed" or equivalent
  - Assert: JE not created

- **Depends on:** T-15.0
- **Blocks:** T-15.8
- **Done when:** `bunx playwright test e2e/flows/01-gl.spec.ts` exits 0 with ≥14 of 16 tests passing.
- **Budget USD:** 3.00
- **Timeout Min:** 60

---

### T-15.2 — AR module: Customers, Invoices, Receipts

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/02-ar.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/ar/customers/page.tsx`, `apps/web/src/app/(authenticated)/ar/customers/new/page.tsx`, `apps/web/src/app/(authenticated)/ar/customers/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ar/invoices/page.tsx`, `apps/web/src/app/(authenticated)/ar/invoices/new/page.tsx`, `apps/web/src/app/(authenticated)/ar/invoices/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/new/page.tsx`, `apps/web/src/app/(authenticated)/ar/receipts/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ar/dashboard/page.tsx`, `specs/02-business-rules.md`, `specs/03-thai-tax.md`
- **Spec:**

  Write `apps/web/e2e/flows/02-ar.spec.ts`. Use `adminTest` fixture. `test.describe.serial`.

  **Pre-condition (in `beforeAll`):**
  - This spec creates its own customer + uses seeded accounts. No dependency on T-15.1 data.
  - Use `data.ts` helpers if needed: `ensureCustomer(workerIndex, "AR Test Customer")` returns the customer record.

  **Critical cases (must pass 100%):** AR-07, AR-08, AR-09, AR-11, AR-12, AR-15, AR-17, AR-18

  **Test cases (minimum 18 — extended for dynamic line items + branch filter):**

  **AR-01: AR Dashboard loads with metrics**
  - Navigate to `/ar/dashboard`
  - Assert: page renders without error
  - Assert: at least one metric card or summary section is visible (not all stubs)
  - Assert: no `parseFloat` artifacts visible (numbers formatted with commas, not raw floats)

  **AR-02: Customer list renders**
  - Navigate to `/ar/customers`
  - Assert: table with columns Name, Phone, Outstanding Balance (or similar)
  - Assert: ≥2 rows from seed data (3 customers seeded per setup.md)
  - Assert: search input present

  **AR-03: Search customer by name**
  - Type partial name in search box
  - Assert: list filters to matching rows only
  - Clear search → full list returns

  **AR-04: Create new customer**
  - Navigate to `/ar/customers/new`
  - Fill: name = `E2E Customer AR`, phone = `0812345678`, payment_terms = `30`, tax_id = `1234567890123`
  - Submit → assert redirect to customer detail or list
  - Assert: customer appears in list

  **AR-05: Customer detail shows open invoices**
  - Navigate to created customer's detail page
  - Assert: customer name, phone, payment terms visible
  - Assert: "Open Invoices" section exists (shows count = 0 or populated)
  - Assert: outstanding_balance displayed as `0.00` (no invoices yet)

  **AR-06: Edit customer — If-Match header required**
  - Click edit on customer
  - Change payment terms to `45`
  - Save → assert success (system auto-sends If-Match header from current updated_at)
  - Assert: updated value displays on detail page

  **AR-07: Create sales invoice — single line, no VAT 🔴**
  - Navigate to `/ar/invoices/new`
  - Select `[data-testid="field-customer"]` → customer from AR-04 (use typeahead or click)
  - Fill `[data-testid="field-issue-date"]` → today
  - Line 0 (initial line): fill `[data-testid="field-description-0"]` → `Consulting`, `[data-testid="field-qty-0"]` → `1`, `[data-testid="field-unit-price-0"]` → `5000.00`, select `[data-testid="field-vat-rate-0"]` → `0`
  - Wait for live recalculation (network idle, 200ms debounce)
  - Assert: `[data-testid="total-subtotal"]` text contains `5,000.00`
  - Assert: `[data-testid="total-vat"]` text contains `0.00`
  - Assert: `[data-testid="total-grand"]` text contains `5,000.00`
  - Click `[data-testid="action-submit"]`
  - Wait for redirect to `/ar/invoices/{id}` — capture id as `arSevenId`
  - Assert: `[data-testid="status-badge"]` text === `DRAFT`
  - Assert: page heading contains pattern `/INV-\d{4}-\d{4,}/`

  **AR-08: Create sales invoice — multiple lines + VAT 7% 🔴**
  - Navigate to `/ar/invoices/new`
  - Select same customer, issue_date = today
  - Line 0: description = `Service A`, qty = `2`, unit_price = `3000.00`, vat_rate = `7`
  - Click `[data-testid="action-add-line"]`
  - Line 1: description = `Service B`, qty = `1`, unit_price = `1000.00`, vat_rate = `7`
  - Assert (precise to the cent):
    - `[data-testid="total-subtotal"]` contains `7,000.00`
    - `[data-testid="total-vat"]` contains `490.00` (7% × 7,000)
    - `[data-testid="total-grand"]` contains `7,490.00`
  - Click `[data-testid="action-submit"]` → capture invoice id as `arEightId`
  - Cross-check via API: `GET ${apiUrl}/api/v1/sales-invoices/${arEightId}` → `total = "7490.00"`, `vat_amount = "490.00"`, status = `DRAFT`

  **AR-09: Post invoice 🔴**
  - Pre-fetch via API: customer's outstanding_balance before posting → save as `preBalance`
  - Navigate to `/ar/invoices/${arEightId}`
  - Click `[data-testid="action-post"]`
  - Confirm dialog if present
  - Assert: `[data-testid="status-badge"]` text === `POSTED`
  - Assert: a JE link is visible (e.g., `[data-testid="linked-je"]` href starts with `/gl/journal-entries/`)
  - Click the JE link → on JE detail page, assert debit total === credit total === `7,490.00`
  - Cross-check API: customer's outstanding_balance now = `preBalance + 7490.00`

  **AR-10: Invoice list — filter by status**
  - Navigate to `/ar/invoices`
  - Filter by `DRAFT` → assert only DRAFT invoices shown
  - Filter by `POSTED` → assert only POSTED invoices shown (includes AR-08's invoice)

  **AR-11: Create partial receipt**
  - Navigate to `/ar/receipts/new`
  - Select customer from AR-04
  - Select the POSTED invoice from AR-08
  - Amount received = `3,000.00` (partial — less than 7,490.00)
  - Submit → assert receipt created with status POSTED
  - Assert: invoice detail shows remaining balance = `4,490.00`
  - Assert: customer outstanding_balance = `4,490.00`

  **AR-12: Create full receipt — invoice cleared**
  - Create another receipt for remaining `4,490.00`
  - Assert: invoice status = `PAID` (or equivalent fully-settled status)
  - Assert: customer outstanding_balance = `0.00`

  **AR-13: Receipt detail page — full field check**
  - Navigate to receipt detail from AR-11
  - Assert: receipt number, date, customer name, amount all visible
  - Assert: applied invoices section shows which invoice was applied
  - Assert: JE linked to receipt exists

  **AR-14: Void posted invoice**
  - Post the DRAFT invoice from AR-07 (no receipts applied)
  - Click "Void" on that invoice
  - Assert: status = `VOID`
  - Assert: a reversing JE created
  - Assert: customer balance unchanged (this invoice had no receipt)

  **AR-15: AR Aging report — data matches outstanding invoices**
  - Navigate to `/reports/ar-aging?as_of=<today>&branch=ALL`
  - Assert: page renders without error
  - Assert: the customer from AR-04 appears in the aging table
  - Assert: amount in "Current" or correct aging bucket matches outstanding balance from AR-11/AR-12
  - Assert: dates rendered as `DD/MM/YYYY` (Bangkok TZ), not raw UTC strings

  **AR-16: Receipts list renders**
  - Navigate to `/ar/receipts`
  - Assert: `[data-testid="data-table"]` rendered with ≥2 rows from AR-11 + AR-12
  - Each row has: receipt no matching `/RCT-\d{4}-\d+/`, date, customer name, amount

  **AR-17: Dynamic line items — add and remove with live recalculation 🔴**
  - Navigate to `/ar/invoices/new`, select customer
  - Add line 0: qty = `1`, unit_price = `100.00`, vat_rate = `7`
  - Assert: `[data-testid="total-grand"]` contains `107.00`
  - Click `[data-testid="action-add-line"]` to add line 1
  - Line 1: qty = `2`, unit_price = `50.00`, vat_rate = `7`
  - Assert: `[data-testid="total-subtotal"]` contains `200.00` (100 + 100), `[data-testid="total-vat"]` contains `14.00`, `[data-testid="total-grand"]` contains `214.00`
  - Click `[data-testid="action-add-line"]` to add line 2
  - Line 2: qty = `1`, unit_price = `75.00`, vat_rate = `7`
  - Assert: `[data-testid="total-grand"]` contains `294.25` (subtotal 275 × 1.07)
  - Click `[data-testid="action-remove-line-2"]` to remove line 2
  - Assert: total reverts to `214.00`
  - Click `[data-testid="action-remove-line-1"]`
  - Assert: total reverts to `107.00`
  - Do NOT submit (this is a UI-only test for recalculation)

  **AR-18: Mixed VAT rates in single invoice 🔴**
  - Navigate to `/ar/invoices/new`, select customer
  - Line 0: qty = `1`, unit_price = `1000.00`, vat_rate = `0` (e.g., zero-rated export)
  - Add line 1: qty = `1`, unit_price = `2000.00`, vat_rate = `7`
  - Add line 2: qty = `1`, unit_price = `500.00`, vat_rate = `0`
  - Assert: `[data-testid="total-subtotal"]` contains `3,500.00`
  - Assert: `[data-testid="total-vat"]` contains `140.00` (only 7% × 2,000)
  - Assert: `[data-testid="total-grand"]` contains `3,640.00`
  - Submit → capture id, verify on detail page that VAT amount per line matches (0, 140.00, 0)
  - Cross-check via API: `vat_amount` per line in response

  **AR-19: Branch filter on AR Aging**
  - Navigate to `/reports/ar-aging`, set `[data-testid="filter-branch"]` to `ALL`, run
  - Capture total outstanding amount (let it be `X`)
  - Change branch to `TL`, run
  - Assert: total ≤ X
  - Assert: header shows `branch = TL` text
  - Change to `EK` → similar check
  - If branch sums match X → branch filter is working

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/02-ar.spec.ts` exits 0
  - All 🔴 critical cases (AR-07, AR-08, AR-09, AR-11, AR-12, AR-15, AR-17, AR-18) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 3.50
- **Timeout Min:** 70

---

### T-15.3 — AP module: Vendors, Bills, Payments, WHT Certs

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/03-ap.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/ap/vendors/page.tsx`, `apps/web/src/app/(authenticated)/ap/vendors/new/page.tsx`, `apps/web/src/app/(authenticated)/ap/vendors/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ap/bills/page.tsx`, `apps/web/src/app/(authenticated)/ap/bills/new/page.tsx`, `apps/web/src/app/(authenticated)/ap/bills/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/new/page.tsx`, `apps/web/src/app/(authenticated)/ap/payments/[id]/page.tsx`, `apps/web/src/app/(authenticated)/ap/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/tax/wht-certs/page.tsx`, `specs/02-business-rules.md`, `specs/03-thai-tax.md`
- **Spec:**

  Write `apps/web/e2e/flows/03-ap.spec.ts`. Use `adminTest` fixture. `test.describe.serial`.

  **Pre-condition (in `beforeAll`):**
  - This spec creates its own vendors. No dependency on T-15.1 or T-15.2.
  - Reuse the same data interaction patterns as T-15.2 (data-testid selectors).

  **Critical cases (must pass 100%):** AP-06, AP-08, AP-11, AP-12, AP-13, AP-17

  **Test cases (minimum 17 — extended for dynamic lines):**

  **AP-01: AP Dashboard loads**
  - Navigate to `/ap/dashboard`
  - Assert: page renders without JS errors
  - Assert: at least one metric or summary section visible

  **AP-02: Vendor list — empty state then populated**
  - Navigate to `/ap/vendors`
  - Assert: empty state renders correctly if no vendors (0 vendors per setup.md — don't crash)
  - Assert: "New Vendor" button present

  **AP-03: Create new vendor — individual with WHT**
  - Navigate to `/ap/vendors/new`
  - Fill: name = `E2E Vendor 01`, tax_id = `0123456789012`, vendor_type = `INDIVIDUAL`, wht_rate = `3`
  - Submit → assert redirect or success
  - Assert: vendor appears in list

  **AP-04: Create second vendor — corporate, no WHT**
  - Create vendor: name = `E2E Corp Vendor`, tax_id = `0987654321098`, vendor_type = `JURISTIC`, wht_rate = `0`
  - Assert: vendor in list

  **AP-05: Vendor detail page**
  - Navigate to `E2E Vendor 01` detail
  - Assert: name, tax_id, wht_rate visible
  - Assert: outstanding_balance = `0.00` (no bills yet)
  - Assert: bills history section exists (empty)

  **AP-06: Create draft bill — with WHT 3% 🔴**
  - Navigate to `/ap/bills/new`
  - Select `[data-testid="field-vendor"]` → `E2E Vendor 01` (WHT rate 3%)
  - Fill `[data-testid="field-issue-date"]` → today
  - Line 0: `[data-testid="field-description-0"]` = `Office Supplies`, `[data-testid="field-qty-0"]` = `1`, `[data-testid="field-amount-0"]` = `10000.00`
  - Wait for live recalculation
  - Assert: `[data-testid="total-wht"]` contains `300.00` (3% × 10,000)
  - Assert: `[data-testid="total-net-payable"]` contains `9,700.00`
  - Click `[data-testid="action-submit"]` → capture bill id as `apSixId`
  - Assert: `[data-testid="status-badge"]` text === `DRAFT`
  - Assert: page heading matches pattern `/BILL-\d{4}-\d{4,}/`

  **AP-07: Create draft bill — no WHT**
  - Navigate to `/ap/bills/new`
  - Select `E2E Corp Vendor` (WHT rate 0%)
  - Add line: amount = `5,000.00`
  - Assert: WHT = `0.00`, total = `5,000.00`
  - Submit → assert DRAFT

  **AP-08: Post a bill**
  - Open bill from AP-06, click "Post"
  - Assert: status = `POSTED`
  - Assert: JE linked (AP payable + expense accounts)
  - Assert: vendor outstanding_balance = `10,000.00` (gross amount owed)

  **AP-09: Bills list — filter by status**
  - Navigate to `/ap/bills`
  - Filter POSTED → assert only POSTED shown
  - Filter DRAFT → assert DRAFT bill from AP-07 shown

  **AP-10: Bill detail — full field check**
  - Navigate to posted bill from AP-06
  - Assert: bill_no, issue_date, vendor name, lines, WHT amount, net payable all render
  - Assert: no raw numbers — all formatted with commas and decimals

  **AP-11: Create payment — full settlement with WHT 🔴**
  - Navigate to `/ap/payments/new`
  - Select `[data-testid="field-vendor"]` → `E2E Vendor 01`
  - Fill `[data-testid="field-payment-date"]` → today
  - Select `[data-testid="field-payment-method"]` → `BANK_TRANSFER`
  - Select `[data-testid="field-bank-account"]` → first seeded bank account
  - In bills-to-apply table, find row with `data-row-id="${apSixId}"` → check the apply checkbox
  - Fill apply amount = `10000.00` (full bill)
  - Wait for recalculation
  - Assert: `[data-testid="total-wht"]` contains `300.00`
  - Assert: `[data-testid="total-net-transfer"]` contains `9,700.00` (gross 10,000 − WHT 300)
  - Click `[data-testid="action-submit"]` → capture payment id as `apElevenId`
  - Assert: status === `POSTED`
  - Cross-check API: vendor outstanding_balance now = `0.00`

  **AP-12: WHT cert auto-created and visible 🔴**
  - Navigate to `/tax/wht-certs`
  - Fill `[data-testid="filter-vendor"]` → `E2E Vendor 01`
  - Wait for table refresh
  - Assert: ≥1 row visible
  - Assert: row contains text `300.00` (the WHT amount from AP-11)
  - Assert: row contains text `1234567890123` OR vendor name matches

  **AP-13: Payment voucher PDF download 🔴**
  - Navigate to `/ap/payments/${apElevenId}`
  - Set up download listener: `const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="action-export-pdf"]')])`
  - Assert: download fires (10s timeout)
  - Save to temp: `const path = await download.path()`
  - Assert: file exists, size > 1000 bytes (sanity check — empty PDF would be tiny)
  - Assert: file's first 4 bytes === `%PDF` (binary check via `fs.readFileSync(path).slice(0,4).toString()`)

  **AP-14: Void a posted bill (no payments)**
  - Post bill from AP-07
  - Click "Void" → confirm
  - Assert: bill status = `VOID`
  - Assert: reversing JE created
  - Assert: vendor outstanding_balance did not increase (or returned to 0)

  **AP-15: AP Aging — data matches outstanding bills**
  - Navigate to `/reports/ap-aging?as_of=<today>&branch=ALL`
  - Assert: `E2E Vendor 01` does NOT appear (bill fully paid in AP-11)
  - Assert: totals render as formatted numbers

  **AP-16: Partial payment scenario**
  - Create a new bill for `E2E Corp Vendor` (`vendor_type=JURISTIC`, no WHT) with amount `8,000.00`, post it
  - Create payment for `4,000.00` (partial — apply amount = 4,000 against the 8,000 bill)
  - Assert via API: vendor outstanding_balance === `4,000.00`
  - Assert via API: bill `paid_amount` === `4,000.00`, `remaining` === `4,000.00`, status still `POSTED` (not fully paid)
  - Navigate to `/reports/ap-aging` → assert `E2E Corp Vendor` row's amount column contains `4,000.00`

  **AP-17: Dynamic line items in bill form 🔴**
  - Navigate to `/ap/bills/new`, select `E2E Corp Vendor`
  - Line 0: amount = `1000.00`
  - Add line 1: amount = `2500.00`
  - Add line 2: amount = `500.00`
  - Assert: `[data-testid="total-grand"]` contains `4,000.00`
  - Click `[data-testid="action-remove-line-1"]`
  - Assert: total reverts to `1,500.00`
  - Click `[data-testid="action-remove-line-1"]` (now line 2 became line 1)
  - Assert: total reverts to `1,000.00`
  - Do NOT submit (UI-only test)

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/03-ap.spec.ts` exits 0
  - All 🔴 critical cases (AP-06, AP-08, AP-11, AP-12, AP-13, AP-17) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 3.50
- **Timeout Min:** 70

---

### T-15.4 — Tax module: PP30, PND3, PND53, WHT Certs

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/04-tax.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/tax/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pp30/[id]/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd3/[id]/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd53/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd53/new/page.tsx`, `apps/web/src/app/(authenticated)/tax/pnd53/[id]/page.tsx`, `specs/03-thai-tax.md`
- **Spec:**

  Write `apps/web/e2e/flows/04-tax.spec.ts`. Use `adminTest` fixture. `test.describe.serial`.

  **Pre-condition (in `beforeAll` — MUST seed own data via `data.ts`):**
  - `await ensureCustomer(workerIndex, "Tax E2E Customer")`
  - `await ensureVendor(workerIndex, "Tax E2E Vendor", { whtRate: 3, vendorType: "INDIVIDUAL" })`
  - `await ensureVendor(workerIndex, "Tax E2E Corp", { whtRate: 3, vendorType: "JURISTIC" })`
  - `await ensurePostedInvoice(workerIndex, customerId, [{ qty: 1, price: 10000, vatRate: 7 }])` — produces VAT 700 for period 2026-05
  - `await ensurePostedPayment(workerIndex, vendorIndividualId, [{ amount: 5000 }])` — produces WHT 150
  - `await ensurePostedPayment(workerIndex, vendorJuristicId, [{ amount: 8000 }])` — produces WHT 240 (PND53 candidate)

  **Critical cases (must pass 100%):** TAX-04, TAX-06, TAX-08, TAX-09, TAX-12, TAX-13

  **Test cases (minimum 14):**

  **TAX-01: Tax Dashboard renders**
  - Navigate to `/tax/dashboard`
  - Assert: page loads, no crash
  - Assert: VAT and WHT summary sections visible

  **TAX-02: PP30 list page**
  - Navigate to `/tax/pp30`
  - Assert: table renders with columns Period, Status, Output VAT, Input VAT, Net
  - Assert: "New PP30" button present

  **TAX-03: PP30 aggregate — VAT pre-filled from transactions**
  - Navigate to `/tax/pp30/new`, select period `2026-05`
  - Assert: output_vat and input_vat fields are pre-filled from VAT register (not zeros)
  - Assert: net_vat = output_vat − input_vat displayed correctly
  - Assert: values are formatted numbers, not NaN or undefined

  **TAX-04: Create PP30 filing**
  - Submit the pre-filled PP30 for 2026-05
  - Assert: filing created with status DRAFT, pp30_no assigned
  - Assert: appears in the PP30 list

  **TAX-05: PP30 detail page — JE preview**
  - Navigate to PP30 detail
  - Assert: period, output_vat, input_vat, net_vat all visible
  - Assert: JE account codes shown (e.g., 21110 VAT payable) — note T-14.X may have fixed hardcoded codes
  - Assert: Finalize button present

  **TAX-06: Finalize PP30**
  - Click "Finalize" on PP30 from TAX-04
  - Assert: status changes to FINALIZED (or FILED)
  - Assert: Finalize button disappears after submission
  - Assert: PDF export button appears (or downloads correctly)

  **TAX-07: PND3 list page**
  - Navigate to `/tax/pnd3`
  - Assert: table with Period, Status, Vendor count, Total WHT columns
  - Assert: "New PND3" button present

  **TAX-08: Create PND3 filing**
  - Navigate to `/tax/pnd3/new`
  - Select period `2026-05`
  - Assert: WHT records from AP payments auto-populate (at least 1 record from AP tests)
  - Assert: total_wht amount is a formatted non-zero number
  - Submit → assert PND3 created

  **TAX-09: PND3 detail — lines accuracy**
  - Navigate to PND3 detail
  - Assert: each line shows vendor name, tax_id, income_type, wht_rate, base_amount, wht_amount
  - Assert: sum of wht_amount lines = total_wht displayed in header
  - Assert: no NaN or undefined values rendered

  **TAX-10: PND53 list page**
  - Navigate to `/tax/pnd53`
  - Assert: table renders without error
  - Assert: "New PND53" button present

  **TAX-11: Create PND53 filing**
  - Navigate to `/tax/pnd53/new`
  - Select period `2026-05`, vendor type = JURISTIC
  - Submit with at least one WHT line
  - Assert: PND53 created, pnd53_no assigned

  **TAX-12: PND53 detail — withholding_total accuracy 🔴 (regression test)**
  - Navigate to a PND53 detail page (e.g., the one created in TAX-11)
  - Assert: `[data-testid="total-withholding"]` contains a formatted number with 2 decimals (e.g., `240.00`)
  - Read each line's wht_amount via API → sum them with `Decimal.js`
  - Assert: API sum (formatted to 2dp) === text in `[data-testid="total-withholding"]` (after stripping commas)
  - This tests the CRITICAL parseFloat bug fixed in phase 12 — must catch regressions

  **TAX-13: WHT Certs list — filter by vendor**
  - Navigate to `/tax/wht-certs`
  - Assert: list renders with at least one cert from AP payments
  - Type vendor name in filter → assert list filters correctly (tests stale-closure fix from phase 12)
  - Clear filter → full list returns

  **TAX-14: Tax period filter — no NaN period strings**
  - On any tax list page, change the period filter using the picker
  - Listen to network: `page.waitForRequest(req => req.url().includes('/tax/'))`
  - Assert: query string contains `period=YYYY-MM` matching `/^\d{4}-\d{2}$/`
  - Assert: no `NaN` substring in the URL or in `[data-testid="period-display"]`

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/04-tax.spec.ts` exits 0
  - All 🔴 critical cases (TAX-04, TAX-06, TAX-08, TAX-09, TAX-12, TAX-13) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 3.00
- **Timeout Min:** 60

---

### T-15.5 — Bank module: Accounts, Import, Reconciliation

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/05-bank.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/bank/accounts/page.tsx`, `apps/web/src/app/(authenticated)/bank/accounts/[id]/page.tsx`, `apps/web/src/app/(authenticated)/bank/import/page.tsx`, `apps/web/src/app/(authenticated)/bank/reconcile/[account_id]/page.tsx`, `specs/07-bank-integration.md`
- **Spec:**

  Write `apps/web/e2e/flows/05-bank.spec.ts`. Use `adminTest` fixture. `test.describe.serial`.

  **Pre-condition (in `beforeAll`):**
  - 3 bank accounts exist from seed in worker DB.
  - Use `data.ts` to create 1 POSTED AR receipt and 1 POSTED AP payment so auto-match has candidates: `await ensurePostedReceipt(...)`, `await ensurePostedPayment(...)`

  **Critical cases (must pass 100%):** BANK-04, BANK-07, BANK-10

  **Test cases (minimum 11):**

  **BANK-01: Bank accounts list**
  - Navigate to `/bank/accounts`
  - Assert: table shows ≥3 rows (seeded bank accounts)
  - Assert: columns: Account Name, Bank, Account No, Current Balance visible
  - Assert: balance values are formatted numbers

  **BANK-02: Bank account detail — transactions**
  - Click into first bank account
  - Assert: detail page shows account name, bank name, account number
  - Assert: transactions section renders (may be empty before import)
  - Assert: current balance matches list page value

  **BANK-03: Import page loads**
  - Navigate to `/bank/import`
  - Assert: page renders with bank account selector
  - Assert: import button or "Use Mock Data" option visible

  **BANK-04: Import mock bank transactions**
  - Select first bank account on import page
  - Trigger mock import (click "Use Mock Data" or equivalent)
  - Assert: success message or redirect to bank account detail
  - Assert: transactions appear in the account's transaction list (≥1 new transaction)

  **BANK-05: Bank account detail — balance updated after import**
  - After BANK-04, navigate to bank account detail
  - Assert: transactions list is non-empty
  - Assert: each transaction shows: date, description, amount, type (DEBIT/CREDIT)
  - Assert: running balance or current balance reflects imported transactions

  **BANK-06: Reconciliation page loads**
  - Navigate to `/bank/reconcile/{account_id}` (use first bank account ID)
  - Assert: page renders with unmatched transactions list
  - Assert: "Auto Match" button present
  - Assert: unmatched transactions from import appear

  **BANK-07: Auto-match transactions**
  - Click "Auto Match" (matches bank transactions to receipts/payments with same amount/date)
  - Assert: matched count increases (or stays at 0 if no matching AR/AP data — assert no crash)
  - Assert: matched transactions move to "Matched" section

  **BANK-08: Manual match a transaction**
  - Select an unmatched bank transaction
  - Select a corresponding AR receipt or AP payment to match against
  - Click "Match" (or drag to matched)
  - Assert: transaction moves to matched list
  - Assert: reconciliation summary updates

  **BANK-09: Mark transaction as non-reconcilable**
  - Select an unmatched bank transaction with no corresponding AR/AP entry
  - Mark as "Unreconcilable" or "Ignore"
  - Assert: transaction removed from pending list
  - Assert: does not affect bank balance

  **BANK-10: Reconciliation balance check**
  - Assert: page shows "Opening Balance + Credits − Debits = Closing Balance"
  - Assert: closing balance matches the bank account balance shown on the accounts list
  - Assert: no NaN or undefined in any balance field

  **BANK-11: Cash position report after bank import**
  - Navigate to `/reports/cash-position?as_of=<today>`
  - Assert: report loads without 500 error
  - Assert: bank account from BANK-04 appears with correct balance
  - Assert: balance is a formatted number matching the bank account detail

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/05-bank.spec.ts` exits 0
  - All 🔴 critical cases (BANK-04, BANK-07, BANK-10) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 2.50
- **Timeout Min:** 45

---

### T-15.6 — Reports + Cross-Report Consistency

- [x] **Status:** Done (2026-05-09)
- **Model:** Opus
- **Files:** `apps/web/e2e/flows/06-reports.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/reports/trial-balance/page.tsx`, `apps/web/src/app/(authenticated)/reports/profit-loss/page.tsx`, `apps/web/src/app/(authenticated)/reports/balance-sheet/page.tsx`, `apps/web/src/app/(authenticated)/reports/cash-flow/page.tsx`, `apps/web/src/app/(authenticated)/reports/general-ledger/page.tsx`, `apps/web/src/app/(authenticated)/reports/vat-summary/page.tsx`, `apps/web/src/app/(authenticated)/reports/branch-pnl/page.tsx`, `apps/web/src/app/(authenticated)/reports/cash-position/page.tsx`, `specs/08-reports.md`, `specs/02-business-rules.md`
- **Spec:**

  Write `apps/web/e2e/flows/06-reports.spec.ts`. Use `adminTest` fixture. `test.describe.serial`.

  **Pre-condition (in `beforeAll` — comprehensive seed via `data.ts`):**
  This spec needs a rich dataset to verify cross-report consistency. Seed in `beforeAll`:
  - 1 customer + 2 POSTED invoices (one with VAT, one without) + 1 POSTED receipt covering one invoice
  - 1 vendor + 1 POSTED bill + 1 POSTED payment with WHT
  - 1 mock bank import + auto-match
  - All in current period (2026-05) so reports for that period have non-zero values

  **Cross-validation approach:** For monetary accuracy, each test does:
  1. Read the rendered number from UI via `[data-testid="..."]` `textContent`
  2. Call the same data via API JSON endpoint
  3. Assert UI value === API value formatted with the same util (use `Decimal.js` to compare to the cent)

  **Critical cases (must pass 100%):** RPT-01, RPT-05, RPT-07, RPT-08, RPT-09, RPT-10

  **Test cases (minimum 15):**

  **RPT-01: Trial Balance — loads and debits = credits**
  - Navigate to `/reports/trial-balance`
  - Set as_of = today, branch = ALL, click Run
  - Assert: "Debit Total" = "Credit Total" (rendered in footer row)
  - Assert: both totals are the same formatted number (e.g., both show `15,490.00`)
  - Cross-validate: fetch `GET /api/v1/reports/trial-balance?as_of=<today>&branch=ALL&format=json` → sum all debit_balance → assert matches UI total

  **RPT-02: Trial Balance — branch filter**
  - Run Trial Balance with branch = `TL`
  - Assert: total differs from ALL (or equals if only TL transactions)
  - Assert: header shows branch = TL
  - Assert: no rows from EK or RAMA9 branches (if branch filter is working)

  **RPT-03: Trial Balance — CSV export with content verification**
  - Set up download listener; click `[data-testid="action-export-csv"]`
  - Save downloaded file; read first line (headers) and assert it contains `Account Code`, `Debit`, `Credit` (or Thai equivalents per spec)
  - Read all rows; assert ≥1 data row exists
  - For one specific account (e.g., `11010`), find its row in CSV → assert debit/credit values match what UI table shows for that account

  **RPT-04: Trial Balance — XLSX export with content verification**
  - Click `[data-testid="action-export-xlsx"]`, save file
  - Sniff first 4 bytes — must be `PK` ZIP signature (XLSX = zip container)
  - Assert: file size > 2KB
  - (Optional: use `xlsx` library if installed to parse and verify content; otherwise binary signature check is sufficient)

  **RPT-05: Profit & Loss — revenue − expenses = net income**
  - Navigate to `/reports/profit-loss`
  - Set from = `2026-01-01`, to = today, branch = ALL, click Run
  - Assert: Net Income row = Total Revenue − Total Expenses
  - Assert: arithmetic correct to the cent (no rounding artifact)
  - Cross-validate against JSON API response

  **RPT-06: P&L — compare period**
  - Run P&L with comparison period `2025-01-01` to `2025-12-31`
  - Assert: both current and prior period columns rendered
  - Assert: comparison column shows numbers or dashes (not undefined/NaN)
  - Assert: variance column = current − prior (or percentage, whichever is shown)

  **RPT-07: Balance Sheet — assets = liabilities + equity**
  - Navigate to `/reports/balance-sheet`
  - Set as_of = today, branch = ALL, click Run
  - Assert: "Total Assets" = "Total Liabilities + Equity"
  - Assert: the fundamental accounting equation holds to the cent
  - Cross-validate: API JSON response `total_assets` = `total_liabilities_equity`

  **RPT-08: Cross-report consistency — P&L net income ↔ Balance Sheet retained earnings**
  - Fetch P&L net income for full year 2026 (Jan–today) via API JSON
  - Fetch Balance Sheet as_of today via API JSON
  - Assert: net income from P&L = change in retained earnings in Balance Sheet
  - (If Balance Sheet shows retained earnings opening + current year income, current year income must equal P&L net income for the same period)

  **RPT-09: Cash Flow — reconciles to bank balance**
  - Navigate to `/reports/cash-flow`
  - Set from = start of year, to = today, click Run
  - Assert: Closing Cash Balance on report matches sum of bank account balances from `/reports/cash-position`
  - Assert: Closing = Opening + Net Change (operating + investing + financing)
  - Cross-validate arithmetic is correct to the cent

  **RPT-10: General Ledger — account drilldown (post T-14.1 fix)**
  - Navigate to `/reports/general-ledger`
  - Select account `11010` (or first postable asset account), period_from = `2026-01`, period_to = `2026-05`
  - Click Run
  - Assert: page returns 200 (tests T-14.1 fix — this was a 500 before)
  - Assert: line-by-line JE entries rendered
  - Assert: opening balance + sum of debit − credit = closing balance (running balance check)

  **RPT-11: General Ledger — account not found error**
  - Enter account code `99999` (non-existent)
  - Click Run
  - Assert: user-visible error message (not a 500 server error page)
  - Assert: error code `ACCOUNT_NOT_FOUND` or similar displayed

  **RPT-12: VAT Summary — output_vat − input_vat = net**
  - Navigate to `/reports/vat-summary`
  - Set period from/to covering 2026-05, click Run
  - Assert: net VAT payable = output_vat − input_vat
  - Assert: value matches the PP30 aggregate for same period (if PP30 was filed)
  - Assert: "link to PP30" navigation uses Next.js `<Link>` (no full-page reload)

  **RPT-13: Branch P&L — sum of branches = total**
  - Navigate to `/reports/branch-pnl`
  - Set period, click Run
  - Assert: TL + EK + RAMA9 net income columns sum to "Total" column
  - Assert: column headers are present (TL, EK, RAMA9)
  - Assert: no hardcoded branch mismatch (if seed has different branch codes, report should adapt)

  **RPT-14: Cash Position report**
  - Navigate to `/reports/cash-position`
  - Set as_of = today
  - Assert: each bank account listed with balance
  - Assert: total cash = sum of individual account balances

  **RPT-15: Reports — no NaN from subtractMonths**
  - Navigate to `/reports/general-ledger` or `/reports/vat-summary`
  - Use the default period (auto-populated by subtractMonths)
  - Assert: period_from and period_to in the filter bar show valid YYYY-MM strings (not NaN-NaN)
  - This tests the subtractMonths fix from Phase 12

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/06-reports.spec.ts` exits 0
  - All 🔴 critical cases (RPT-01, RPT-05, RPT-07, RPT-08, RPT-09, RPT-10) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 4.00
- **Timeout Min:** 60

---

### T-15.7 — Dashboard, Settings, Auth Guards

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/07-dashboard-settings-guards.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/src/app/(authenticated)/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/settings/account-map/page.tsx`, `apps/web/src/app/(authenticated)/settings/audit-log/page.tsx`, `apps/web/src/app/(authenticated)/settings/integrations/dashboard/page.tsx`, `apps/web/src/app/(authenticated)/settings/integrations/test/page.tsx`, `apps/web/src/app/login/page.tsx`, `apps/web/src/middleware.ts`, `apps/api/src/middleware/auth-guard.ts`
- **Spec:**

  Write `apps/web/e2e/flows/07-dashboard-settings-guards.spec.ts`. Uses multiple auth roles (ADMIN, ACCOUNTANT, VIEWER) — different `test.describe` blocks per role with the matching auth fixture.

  **Pre-condition (in `beforeAll`):**
  - Seed at least: 1 customer + 1 invoice + 1 receipt for dashboard KPI assertions
  - Seed 1 audit log entry by performing an action (e.g., create-invoice via API) so SETTINGS-10 has rows to verify

  **Critical cases (must pass 100%):** GUARD-03, GUARD-05, GUARD-06, GUARD-07

  **Test cases (minimum 13):**

  **DASH-01: Main dashboard — KPI cards show live data**
  - Login as ADMIN, navigate to `/dashboard`
  - Assert: KPI cards render with actual numbers (not "Available in Phase X" stubs — tests the audit finding)
  - Assert: at least one card shows a non-zero value (since AR/AP data was created in other flows)
  - Assert: no JS console errors

  **DASH-02: Main dashboard — quick links or navigation**
  - Assert: navigation to GL, AR, AP, Tax, Bank, Reports all accessible from dashboard or sidebar
  - Assert: all links use Next.js `<Link>` (no full-page reload on nav)

  **GUARD-03: Unauthenticated user redirected to login**
  - Open a fresh browser context (no session cookie)
  - Navigate to `/gl/accounts`
  - Assert: redirect to `/login` (HTTP 307 or client-side redirect)
  - Assert: login page renders

  **GUARD-04: Login — select user and authenticate**
  - On `/login`, select `Admin User` from the user selector
  - Submit login form
  - Assert: redirect to `/dashboard` or main page
  - Assert: user name or email visible in header/nav

  **GUARD-05: Logout clears session**
  - Login as ADMIN
  - Click logout button
  - Assert: redirect to `/login`
  - Navigate to `/gl/accounts` without logging in → assert redirect to `/login`

  **GUARD-06: VIEWER cannot close a period — API enforces 403 🔴**
  - Use `viewerTest` fixture (VIEWER role)
  - Navigate to `/gl/periods`
  - Assert: page loads (read access is allowed)
  - **Direct API check (most reliable):** make a `POST` request to `${apiUrl}/api/v1/periods/2026-04/close` with the VIEWER session cookie
  - Assert: response status === `403`
  - Assert: response body `error.code === 'FORBIDDEN'` OR similar role-denial code
  - **UI check:** if `[data-testid="action-close-period-2026-04"]` exists in DOM, force-click it (with `force: true`) → assert error toast appears with text containing `permission` OR `forbidden`
  - This is the regression test for the audit-finding (VIEWER previously COULD trigger close-period API)

  **GUARD-07: VIEWER cannot create or post a journal entry — API enforces 403 🔴**
  - Use `viewerTest` fixture
  - Direct API check: `POST ${apiUrl}/api/v1/journal-entries` with valid balanced JE body
  - Assert: response status === `403`
  - Assert: response body `error.code === 'FORBIDDEN'`
  - UI check: navigate to `/gl/journal-entries/new` — assert either:
    - Page redirects to `/gl/journal-entries` (read-only fallback), OR
    - Page renders but submit button is disabled, OR
    - Submitting returns 403 with visible error
  - Whichever happens, the spec must record exactly which behavior is current (one of the three) so future changes are noticed

  **GUARD-08: ACCOUNTANT can read but respects write limits**
  - Login as `aow@wind` (ACCOUNTANT role)
  - Navigate to `/gl/accounts` — assert reads OK
  - Navigate to `/gl/journal-entries/new` — assert can create (ACCOUNTANT should have write access)
  - Navigate to `/gl/periods` — assert can read
  - Attempt close period → assert allowed or denied based on role spec

  **SETTINGS-09: Account Map page loads**
  - Login as ADMIN, navigate to `/settings/account-map`
  - Assert: page renders with account mapping rows
  - Assert: each row has a dropdown/picker for the system account
  - Assert: save button present

  **SETTINGS-10: Audit Log — entries appear after actions**
  - Navigate to `/settings/audit-log`
  - Assert: table renders with columns: Date, User, Action, Entity
  - Assert: entries from this test session appear (login, create customer, create JE, etc.)
  - Assert: filter by action type works
  - Assert: stats row is labelled with qualifier ("this page" or pagination info — tests audit finding)

  **SETTINGS-11: Integrations Dashboard**
  - Navigate to `/settings/integrations/dashboard`
  - Assert: page renders without error
  - Assert: webhook event list shown (may be empty)
  - Assert: filter by date range works without triggering duplicate API requests (change from-date, check only 1 network request fired — tests double-fetch fix)

  **SETTINGS-12: Integration test page — fire test webhook**
  - Navigate to `/settings/integrations/test`
  - Select webhook type `visit.completed` (or available option)
  - Click "Send Test" button
  - Assert: success/response message appears (not a silent hang)
  - Assert: a new entry appears in the integrations dashboard event list

  **SETTINGS-13: Account Map — save mapping**
  - On `/settings/account-map`, change one account mapping using the dropdown
  - Click Save
  - Assert: success feedback visible
  - Reload page → assert: saved mapping persists (not reverted)
  - Assert: no silent data loss from `rowsToRecord` skip on empty code (tests audit finding)

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/07-dashboard-settings-guards.spec.ts` exits 0
  - All 🔴 critical cases (GUARD-03, GUARD-05, GUARD-06, GUARD-07) PASS 100%
  - Other cases ≥95% pass rate
- **Budget USD:** 2.50
- **Timeout Min:** 45

---

### T-15.9 — PDF Exports: Invoice, PP30, PND3, PND53, WHT cert

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/08-pdf-exports.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/web/e2e/fixtures/data.ts`, `apps/api/src/pdf/*`, all detail pages with PDF buttons
- **Spec:**

  Write `apps/web/e2e/flows/08-pdf-exports.spec.ts`. Use `adminTest` fixture. Verifies that every PDF endpoint produces a valid, non-empty PDF file (binary signature `%PDF`).

  **Pre-condition (in `beforeAll`):**
  - Use `data.ts` to seed: 1 POSTED invoice, 1 FINALIZED PP30, 1 PND3 with lines, 1 PND53 with lines, 1 WHT cert linked to a posted payment
  - All in current period 2026-05

  **Critical cases (all 🔴):**

  **PDF-01: Invoice PDF**
  - Navigate to the seeded posted invoice detail
  - Click `[data-testid="action-export-pdf"]`
  - Capture download via `page.waitForEvent('download')`
  - Assert: file size > 5KB
  - Assert: first 4 bytes of file === `%PDF`
  - Assert: file extension is `.pdf` OR Content-Disposition header indicates pdf

  **PDF-02: PP30 PDF**
  - Navigate to FINALIZED PP30 detail
  - Click `[data-testid="action-export-pdf"]`
  - Same assertions as PDF-01

  **PDF-03: PND3 PDF**
  - Navigate to PND3 detail
  - Click `[data-testid="action-export-pdf"]`
  - Same assertions

  **PDF-04: PND53 PDF**
  - Navigate to PND53 detail
  - Click `[data-testid="action-export-pdf"]`
  - Same assertions
  - Additionally: assert page renders `[data-testid="total-withholding"]` BEFORE click (to confirm the page state is good — PDF would fail if total is NaN)

  **PDF-05: WHT Certificate PDF**
  - Navigate to `/tax/wht-certs`, click on a cert row's PDF action
  - Same assertions

  **PDF-06: Payment voucher PDF (regression test for T-14.5)**
  - Navigate to a posted payment detail
  - Click `[data-testid="action-export-pdf"]`
  - Same assertions
  - Assert: file size > 3KB (voucher has multiple sections)

  **PDF-07: PDF on entity with edge-case data**
  - Seed an invoice with very long Thai vendor name (>50 chars), max VAT lines (5), notes with newlines
  - Generate PDF — assert no crash, valid `%PDF` header
  - This catches `@react-pdf/renderer` failures from undefined props or text overflow

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/08-pdf-exports.spec.ts` exits 0
  - All 🔴 critical cases PASS 100% (every PDF endpoint produces valid `%PDF` file)
- **Budget USD:** 2.00
- **Timeout Min:** 40

---

### T-15.10 — Webhook Integration: wind-clinic visit.completed E2E

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/e2e/flows/09-webhook-integration.spec.ts`
- **Reads:** `apps/web/e2e/fixtures/auth.ts`, `apps/api/src/routes/webhooks/*`, `specs/09-integrations.md`
- **Spec:**

  Write `apps/web/e2e/flows/09-webhook-integration.spec.ts`. Use `adminTest` fixture. Tests the FULL Phase 8 flow: webhook posted → invoice + receipt + JE auto-created → all visible in their respective UI lists.

  **Pre-condition (in `beforeAll`):**
  - Capture seed customer ID for `customer_external_id` mapping (or use the test integrations dashboard helper)
  - Read `specs/09-integrations.md` for the exact webhook payload schema and HMAC signature header (e.g., `X-Wind-Signature`)
  - Compute HMAC using `WEBHOOK_SECRET_WIND_CLINIC` env var (test stack should have a known test secret set in `globalSetup`)

  **Critical cases (all 🔴):**

  **WEBHOOK-01: Send valid visit.completed → 200**
  - POST `${apiUrl}/api/v1/webhooks/wind-clinic` with body containing: `event = "visit.completed"`, `visit_id`, `customer_external_id` (mapped to a seed customer), `lines: [{ description, qty, unit_price, vat_rate }]`, `paid_amount`, `payment_method`, etc.
  - Include valid HMAC `X-Wind-Signature` header
  - Assert: response status === `200`
  - Assert: response body indicates created invoice + receipt + JE IDs

  **WEBHOOK-02: Auto-created invoice visible in UI**
  - Navigate to `/ar/invoices`
  - Assert: a new invoice appears (find by description matching webhook payload)
  - Click into it → assert source_type indicates webhook origin (e.g., `WIND_CLINIC` or `WEBHOOK`)
  - Assert: invoice status is `POSTED` (auto-posted)
  - Assert: customer name matches the webhook's mapped customer

  **WEBHOOK-03: Auto-created receipt visible**
  - Navigate to `/ar/receipts`
  - Assert: receipt with amount matching webhook's `paid_amount` is present
  - Assert: receipt's applied invoice is the one from WEBHOOK-02
  - If fully paid: invoice's outstanding balance = 0

  **WEBHOOK-04: Linked JE auto-posted**
  - Navigate to `/gl/journal-entries`, filter description containing webhook's visit_id or invoice_no
  - Assert: a POSTED JE is present
  - Open it: assert debit total === credit total (balanced)
  - Assert: lines reference the right accounts (revenue, AR, cash/bank, VAT payable)

  **WEBHOOK-05: Idempotency — duplicate webhook with same visit_id**
  - Capture invoice count before second POST
  - Send identical webhook payload (same `visit_id`)
  - Assert: response is `200` OR `409 Conflict` (whichever spec defines as idempotent OK)
  - Assert: invoice count is unchanged (no duplicate created)

  **WEBHOOK-06: Invalid HMAC signature → 401**
  - Send same payload with wrong signature
  - Assert: response status === `401` (or `403`)
  - Assert: no invoice/receipt/JE created

  **WEBHOOK-07: Audit log entry created**
  - Navigate to `/settings/audit-log`
  - Filter action type `WEBHOOK_RECEIVED` (or similar)
  - Assert: at least one entry corresponding to WEBHOOK-01 visible

- **Depends on:** T-15.0b
- **Blocks:** T-15.8
- **Done when:**
  - `bunx playwright test e2e/flows/09-webhook-integration.spec.ts` exits 0
  - All 🔴 critical cases PASS 100%
- **Budget USD:** 2.50
- **Timeout Min:** 50

---

### T-15.8 — Fix failures from E2E runs

- [x] **Status:** Done (2026-05-10): 119/119 passing (100%)
- **Model:** Haiku (mechanical: missing selector, wrong text assertion) | Sonnet (logic: broken feature, missing UI state)
- **Files:** determined after T-15.1–T-15.7 complete
- **Reads:** `playwright-report/index.html` (HTML report from failed run), the failing spec file, the failing page source
- **Spec:**

  After T-15.1–T-15.7 complete, run the full suite:
  ```bash
  cd apps/web && bunx playwright test 2>&1 | tee e2e-run-summary.txt
  ```

  For each failing test:
  1. Read `playwright-report/index.html` to identify the failure: wrong selector, missing element, unexpected navigation, wrong data value
  2. Classify: **selector/assertion fix** (Haiku) vs **actual feature bug** (Sonnet)
  3. Write a fix. Selector/assertion fixes go directly in the spec file. Feature bugs go in the page/API source file.
  4. Re-run only the affected spec to verify fix.

  Create one sub-task per failing spec file (T-15.8a, T-15.8b, etc.) if failures span multiple files.

  **Model assignment:**
  - Wrong `data-testid` / text mismatch / locator needs updating → Haiku
  - Feature is broken (button doesn't work, API 500 on action, data doesn't update) → Sonnet

- **Depends on:** T-15.1, T-15.2, T-15.3, T-15.4, T-15.5, T-15.6, T-15.7, T-15.9, T-15.10
- **Blocks:** —
- **Done when:** `bunx playwright test` exits 0 OR ≥95% pass rate across all 9 spec files AND every 🔴 critical case passes.
- **Budget USD:** 3.00
- **Timeout Min:** 60

---

## Summary

| Task | Model | Cases | Pages / scope |
|---|---|---|---|
| T-15.0  | Sonnet | infra | docker stack, fixtures, global setup/teardown |
| T-15.0b | Sonnet | infra | `data-testid` attributes on all tested pages |
| T-15.1  | Sonnet | 15 | GL: accounts, JE, periods, dashboard |
| T-15.2  | Sonnet | 19 | AR: customers, invoices, receipts, dashboard, dynamic lines, branch filter |
| T-15.3  | Sonnet | 17 | AP: vendors, bills, payments, dashboard, dynamic lines |
| T-15.4  | Sonnet | 14 | Tax: PP30, PND3, PND53, WHT certs |
| T-15.5  | Sonnet | 11 | Bank: accounts, import, reconcile |
| T-15.6  | Opus   | 15 | All 9 report pages + cross-validation |
| T-15.7  | Sonnet | 13 | Dashboard, settings, auth guards (3 roles) |
| T-15.9  | Sonnet | 7  | PDF exports (Invoice, PP30, PND3/53, WHT cert, payment voucher) |
| T-15.10 | Sonnet | 7  | Webhook integration (wind-clinic visit.completed) |
| T-15.8  | Haiku/Sonnet | fix | failing cases from above |
| **Total** | | **≥118** | **57 pages + integrations** |

**Budget estimate:** $32.00–$36.00 total
- Infra (T-15.0 + T-15.0b): $5.50
- Test authoring: $23.50 (T-15.6 Opus: $4)
- Fix pass: $3.00

**Wall-clock estimate:** With workers=3 isolated stacks: T-15.0/0b sequential first (~110 min total), then T-15.1–T-15.10 in parallel (longest task drives, ~70 min), then T-15.8 fix pass (~60 min). **End-to-end: ~4 hours.**

---

## Reference: User Journey Walkthrough (for the most complex flow)

> This is a worked example of the END-TO-END accounting cycle that the test suite exercises.
> Workers writing the spec files can use this as a reference for understanding how each module connects.
> The actual tests are split per module above — this section is illustrative only.

```
[Day 1 — Morning: Setup]
  ADMIN logs in → opens GL → creates new account TEST01 (T-15.1 GL-04)
  ADMIN opens Periods → confirms 2026-05 is OPEN (T-15.1 GL-14)

[Day 1 — Afternoon: Sales cycle]
  ACCOUNTANT creates customer "WIND Patient A" (T-15.2 AR-04)
  Creates sales invoice 2 lines + VAT 7% → submits as DRAFT (T-15.2 AR-08)
  Posts the invoice → status POSTED, JE auto-created (T-15.2 AR-09)
  Customer pays partial → ACCOUNTANT creates receipt for 3,000 (T-15.2 AR-11)
  Customer pays remaining → second receipt clears invoice (T-15.2 AR-12)

[Day 2 — Morning: Purchase cycle]
  ACCOUNTANT creates vendor "Office Supplies Co" with WHT 3% (T-15.3 AP-03)
  Creates bill 10,000 → WHT auto-calculated 300, net payable 9,700 (T-15.3 AP-06)
  Posts bill → AP outstanding goes up by 10,000 (T-15.3 AP-08)
  Creates payment full settlement → bank transfer 9,700, WHT cert auto-created (T-15.3 AP-11, AP-12)
  Downloads payment voucher PDF (T-15.3 AP-13)

[Day 3 — Bank reconciliation]
  ADMIN opens /bank/import → mock-imports today's bank transactions (T-15.5 BANK-04)
  Opens reconciliation → auto-match links bank credits to receipts and bank debits to payments (T-15.5 BANK-07)
  Closing balance = opening + matched flows (T-15.5 BANK-10)

[Day 4 — Webhook integration (production simulation)]
  WIND CLINIC system fires visit.completed webhook (T-15.10 WEBHOOK-01)
  System auto-creates invoice + receipt + JE (T-15.10 WEBHOOK-02 to 04)

[End of month — Tax filings]
  ACCOUNTANT creates PP30 for period 2026-05 (T-15.4 TAX-04)
    → output_vat from invoice's 490 + others = total
    → input_vat from bill's purchase VAT (if any)
    → net VAT payable shown
  Finalizes PP30 → exports PDF for ภพ.30 submission (T-15.4 TAX-06, T-15.9 PDF-02)
  Creates PND3 from individual-vendor WHT records (T-15.4 TAX-08)
    → total_wht must match sum of WHT cert amounts
  Creates PND53 from corporate-vendor WHT records (T-15.4 TAX-11)
  Downloads all WHT certs PDFs (T-15.9 PDF-05)

[End of month — Reports & period close]
  ADMIN runs Trial Balance → debits = credits (T-15.6 RPT-01)
  Runs P&L → revenue − expenses = net income (T-15.6 RPT-05)
  Runs Balance Sheet → assets = liabilities + equity (T-15.6 RPT-07)
  Cross-validates: P&L net income == BS retained earnings change (T-15.6 RPT-08)
  Exports Trial Balance to CSV + XLSX for audit (T-15.6 RPT-03, RPT-04)
  Closes period 2026-05 (T-15.1 GL-15)
  Tries to post a JE in the closed period → must reject (T-15.1 GL-16)

[Guard checks throughout]
  VIEWER tries to close a period via direct API call → 403 (T-15.7 GUARD-06)
  VIEWER tries to post a JE → 403 (T-15.7 GUARD-07)
  Logged-out user navigates to /gl → redirected to /login (T-15.7 GUARD-03)
```

This entire cycle exercises 57 pages, 9 modules, 2 integrations (webhook + bank), 3 user roles, and 5 PDF templates.

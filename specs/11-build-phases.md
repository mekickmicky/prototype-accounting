# 11 — Build Phases

The system is built in 8 sequential phases. Each phase has acceptance criteria. **Do not advance until all criteria are met.**

## How to Use This Spec

For Claude Code:
- At the start of each session, identify the current phase (check `TASKS.md` or git history)
- Open this spec, find the phase, work through items in order
- Each phase ends with a checklist; verify all items pass before declaring it done
- If you hit a blocker, document it in `TASKS.md` and continue with non-blocked items

For the human:
- Use the acceptance criteria to verify Claude Code's output
- Reject incomplete phases — do not let scope creep across phases

---

## Phase 1 — Foundation

**Goal:** A skeleton app that runs, has the database, mock auth, and a base layout.

### Tasks

1. Initialize repo: `bun create elysia` API, `bunx create-next-app` web. Or monorepo with both.
2. Set up Prisma with the full schema from `01-domain-model.md`.
3. Add DB-level CHECK constraints via raw SQL migration.
4. Implement `prisma/seed.ts` (static seeds only for now).
5. Set up env vars: `DATABASE_URL`, `WEBHOOK_SECRET_*`, `BANK_PROVIDER=mock`.
6. Mock auth: `/login` page, JWT cookie middleware, `useUser()` hook on frontend.
7. Base layout: topbar, sidebar (per `06-ui-design-system.md`), routing shell.
8. Dashboard placeholder: empty page with "WIND Accounting" headline.
9. Set up Vercel + Railway/Supabase (or Docker Compose for local dev).

### Acceptance Criteria

- [ ] `bun run dev` starts API and web
- [ ] Prisma migrate succeeds against fresh DB
- [ ] `bun run db:seed` populates Account, FiscalPeriod, BankAccount, User, default settings
- [ ] Login page lists 5 seeded users; selecting one sets the cookie
- [ ] Authenticated requests succeed; unauthenticated return 401
- [ ] Sidebar renders all 9 module groups (most pages will be empty)
- [ ] Theme toggle works (dark/light)
- [ ] Color tokens, fonts, and base components match spec 06

### Don't move on until:
A user can log in, see the layout, and the database has all static seed data.

---

## Phase 2 — GL Core

**Goal:** The General Ledger works. Users can create JEs, post them, void them, see Trial Balance.

### Tasks

1. Implement `/api/v1/accounts` CRUD (admin only for create/update; all roles for read)
2. Implement `/api/v1/periods` endpoints (list, get, close, reopen, close-checklist)
3. Implement `JournalEntryService`:
   - `createDraft(input)`
   - `update(id, input)` — DRAFT only
   - `post(id, userId)` — generates je_no, validates balanced, validates period OPEN, transitions to POSTED
   - `void(id, userId, reason)` — creates reversal JE
   - `delete(id)` — DRAFT only
4. Implement `/api/v1/journal-entries` endpoints
5. Build `lib/numbering.ts` — atomic doc number generator with FOR UPDATE lock
6. Build UI:
   - `/gl/accounts` — tree view + create/edit
   - `/gl/journal-entries` — list with filters
   - `/gl/journal-entries/new` — create form with balance check, account autocomplete
   - `/gl/journal-entries/[id]` — view, edit (if draft), post, void
   - `/gl/periods` — period list with status, close button + checklist modal
7. Build Trial Balance:
   - `lib/reports/trial-balance.ts` — query function
   - `/api/v1/reports/trial-balance` endpoint
   - `/reports/trial-balance` page with branch + as-of-date filters
   - PDF + CSV export
8. Add audit logging on every JE state change

### Acceptance Criteria

- [ ] Can view full Chart of Accounts as a tree
- [ ] Can create a draft JE with multiple lines, save, and edit
- [ ] Cannot save a JE where Dr ≠ Cr (frontend warns + backend rejects with 422)
- [ ] Can post a draft JE → status = POSTED, je_no assigned, audit log entry created
- [ ] Cannot edit a posted JE — UI shows read-only, backend returns 409
- [ ] Can void a posted JE → reversal JE created, both linked, both POSTED
- [ ] Cannot post into a CLOSED period (UI warns, backend rejects with PERIOD_NOT_OPEN)
- [ ] Trial Balance shows all accounts with debit_total, credit_total, balance
- [ ] Trial Balance grand totals are equal (or red banner if not)
- [ ] Can close a period if checklist passes (no draft JEs in period)
- [ ] Cannot reopen a period as ACCOUNTANT, can as ADMIN
- [ ] All money formatting matches spec 06 (em-dash for zero, parens for negative)

### Don't move on until:
Manual JE flow works end-to-end, Trial Balance balances, period close works.

---

## Phase 3 — AR (Sales)

**Goal:** Invoice customers, receive payment, AR ages.

### Tasks

1. `/api/v1/customers` CRUD
2. `/ar/customers` UI: list, detail, create, edit
3. `/api/v1/sales-invoices` CRUD + post + void
4. SalesInvoice posting logic: per `02-business-rules.md` §4.1, including VatRegister insert
5. Tax invoice number generation (separate sequence)
6. `/ar/invoices` UI: list + form + detail + invoice PDF
7. `/api/v1/receipts` CRUD + post + void
8. Receipt posting: per `02-business-rules.md` §4.3 + advance payment §4.4
9. ReceiptApplication logic with paid_amount tracking
10. `/ar/receipts` UI
11. AR Aging report: `/reports/ar-aging`
12. Customer statement: `/ar/customers/[id]` shows all invoices + receipts + balance

### Acceptance Criteria

- [ ] Can create + post an invoice; JE auto-created with correct lines (AR / Revenue / VAT)
- [ ] Tax invoice flag generates a separate tax_invoice_no
- [ ] VatRegister row inserted with correct vat_type=OUTPUT
- [ ] Can record a receipt against an invoice; invoice status updates to PAID or PARTIAL_PAID
- [ ] Can record advance payment (no invoice); creates Customer Deposits liability
- [ ] Voiding an invoice with applied receipts returns INVOICE_HAS_PAYMENTS error
- [ ] Voiding a receipt re-opens its invoices
- [ ] AR Aging shows correct buckets
- [ ] Invoice PDF renders correctly with all required tax invoice fields
- [ ] Customer detail shows running balance and open invoices
- [ ] Cash receipt → debits cash account; transfer → debits bank account
- [ ] Card fee correctly debits expense account, reducing net deposit

### Don't move on until:
A complete sale flow works: invoice → post → receipt → fully paid → reflected in TB.

---

## Phase 4 — AP (Purchases)

Mirror of AR. Same patterns, with withholding logic.

### Tasks

1. `/api/v1/vendors` CRUD with vendor_type field
2. `/ap/vendors` UI
3. `/api/v1/bills` CRUD + post + void
4. Bill posting logic: per `02-business-rules.md` §4.5, including VatRegister INPUT
5. `/ap/bills` UI: form supports per-line WHT rate and type
6. `/api/v1/payments` CRUD + post + void
7. Payment posting: per `02-business-rules.md` §4.6
8. WithholdingRecord auto-creation on payment post
9. WHT certificate (50 ทวิ) PDF generation
10. `/ap/payments` UI
11. AP Aging report

### Acceptance Criteria

- [ ] Can create + post a bill; JE has Expense / VAT Receivable / AP / WHT Payable
- [ ] WHT correctly calculated on PRE-VAT base (per spec 03)
- [ ] Can record a payment; AP status updates correctly
- [ ] WithholdingRecord auto-generated for payment lines with WHT
- [ ] WHT certificate PDF generates with all required 50 ทวิ fields
- [ ] AP Aging shows correct buckets
- [ ] VatRegister INPUT row created on bill post

### Don't move on until:
A complete purchase flow works: bill → payment with WHT → WHT cert generated.

---

## Phase 5 — Tax

**Goal:** Generate ภพ.30 and ภงด.3/53 from accumulated transactions.

### Tasks

1. `/api/v1/tax-filings/pp30/preview` — returns aggregated VatRegister
2. `/api/v1/tax-filings/pp30` — creates DRAFT filing
3. `/api/v1/tax-filings/:id/finalize` — locks VatRegister rows
4. `/api/v1/tax-filings/:id/submit` — posts closing JE
5. ภพ.30 PDF generator
6. `/tax/pp30` UI (list, new, detail)
7. PND3/PND53 logic with vendor_type split
8. PND3/PND53 PDF generators
9. `/tax/pnd3` and `/tax/pnd53` UI
10. WHT cert browser `/tax/wht-certs`
11. Tax dashboard `/tax/dashboard`

### Acceptance Criteria

- [ ] Can generate PP30 for a period; output_vat and input_vat match VatRegister sums
- [ ] Finalizing PP30 prevents new VatRegister rows from being added to that period (or locks them)
- [ ] Submitting PP30 posts closing JE with correct lines
- [ ] PND3 includes only INDIVIDUAL vendor WHT records
- [ ] PND53 includes only JURISTIC vendor WHT records
- [ ] All three PDFs render with correct totals
- [ ] WHT cert PDF includes year-to-date cumulative for that vendor

### Don't move on until:
Can file ภพ.30 for last month, post closing JE, see TB updated.

---

## Phase 6 — Bank Reconciliation

### Tasks

1. `BankProvider` interface in `lib/bank/provider.ts`
2. `MockBankProvider` implementation
3. `getBankProvider()` factory
4. `/api/v1/bank-accounts` CRUD
5. `/api/v1/bank/import` endpoint (mock generation + CSV paste)
6. `/api/v1/bank/reconciliation/:account_id` endpoint
7. `/api/v1/bank/reconcile` endpoint
8. `/api/v1/bank/ignore-txn` endpoint
9. `/api/v1/bank/verify-slip` endpoint
10. Auto-match heuristic
11. `/bank/accounts` UI
12. `/bank/import` UI
13. `/bank/reconcile/[account_id]` UI (two-pane workspace)
14. Slip verify integration in Receipt form

### Acceptance Criteria

- [ ] Can import mock bank transactions for a date range
- [ ] Can paste CSV; parser handles dd/MM/yyyy and comma thousands
- [ ] Reconciliation page shows unmatched bank txns and unmatched docs
- [ ] Auto-suggestions ranked by confidence
- [ ] Can manually match a bank txn to a Receipt or Payment
- [ ] Can "Create JE from txn" for unmatched (e.g., bank fee)
- [ ] Can mark a txn as "ignored"
- [ ] Slip verify button in Receipt form works (mock returns predictable results)
- [ ] Reconciled balance counter at bottom updates correctly
- [ ] Bank txn dedup: re-importing same period doesn't duplicate

### Don't move on until:
Can reconcile a full month of bank activity end-to-end.

---

## Phase 7 — Reports

### Tasks

1. P&L: `lib/reports/profit-loss.ts` + endpoint + UI + PDF
2. Balance Sheet: same
3. Cash Flow Statement (indirect method): same
4. General Ledger detail (per account): same, with drill-down from any other report
5. VAT Summary
6. Cash Position
7. Branch P&L (multi-column)
8. AR Aging (already in Phase 3, polish here)
9. AP Aging (already in Phase 4, polish here)
10. Comparative mode (period vs prior period)
11. Common filter bar across all reports

### Acceptance Criteria

- [ ] P&L correctly groups by Revenue / COGS / Operating Expenses / Other
- [ ] Balance Sheet equation holds: Assets = Liabilities + Equity
- [ ] Cash Flow: NET CHANGE = (Cash End - Cash Begin), and = (Operating + Investing + Financing)
- [ ] GL Detail shows per-account transactions with running balance
- [ ] Drilling from Balance Sheet → Account → Transactions works
- [ ] Branch P&L shows columns per branch with totals
- [ ] All reports support PDF, CSV, XLSX export
- [ ] Comparative mode shows two columns side-by-side with % change

### Don't move on until:
Can generate a complete financial report set for last quarter, all numbers tie out.

---

## Phase 8 — Integrations

### Tasks

1. `WebhookProcessed` model (add to schema, migrate)
2. HMAC validation middleware
3. `/api/v1/webhooks/wind-clinic/visit-completed` endpoint
4. Customer auto-create/match by `WIND-{patient_id}` code
5. Auto invoice + receipt + JE creation flow
6. Doctor commission accrual (separate JE)
7. `/api/v1/webhooks/wind-stock/period-export` endpoint
8. Bulk JE create (transaction-wrapped)
9. Idempotency check on every webhook
10. Mock webhook CLI tool: `scripts/mock-webhook.ts`
11. Test page UI in `/settings/integrations/test`
12. Webhook dashboard: log table view in `/settings/integrations/dashboard`

### Acceptance Criteria

- [ ] Sending a wind-clinic webhook auto-creates Customer (if new), Invoice, Receipt, JE(s)
- [ ] Replaying same webhook with same `visit_id` returns original result, no duplicates
- [ ] Bad signature → 401
- [ ] Old timestamp (>5 min) → 401
- [ ] Sending wind-stock period export bulk-creates JEs, all balanced
- [ ] If any JE in stock export is unbalanced, whole import rolls back
- [ ] Account map editable in settings → next webhook uses new mapping
- [ ] Doctor commission JE separate from invoice JE
- [ ] Mock webhook CLI fires test events successfully

### Done when:
Can simulate a busy clinic day with 20+ visit-completed webhooks, see all data flow into TB / P&L / BS correctly.

---

## Cross-Phase Quality Bar

These apply to every phase:

### Code Quality
- [ ] Every API endpoint validated with Zod
- [ ] Every API endpoint returns the response envelope (success/error)
- [ ] Every state-changing operation logs to AuditLog
- [ ] Every business rule violation throws `BusinessRuleError` with stable code
- [ ] No raw Prisma errors leaked to frontend
- [ ] All money in Decimal, never Float
- [ ] All transactional logic wrapped in `prisma.$transaction`

### UI Quality
- [ ] All forms validate before submitting
- [ ] All money inputs use `<MoneyInput />`, all displays use `<MoneyDisplay />`
- [ ] Loading states everywhere (no white flash)
- [ ] Error states with retry button
- [ ] Empty states with CTA
- [ ] Confirmation dialogs for destructive actions
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Toast notifications for non-modal feedback (success/error)

### Testing
- [ ] Each phase has at least 1 happy-path E2E test
- [ ] Each business rule has a unit test (e.g., "JE doesn't post if unbalanced")
- [ ] Auto-match heuristic has fixture-based tests
- [ ] Webhook handlers have idempotency tests

### Documentation
- [ ] README.md kept up to date with setup instructions
- [ ] Each Phase, when done, gets a section in CHANGELOG.md
- [ ] Any deviation from spec is documented in DEVIATIONS.md with rationale

---

## Estimated Effort

| Phase | Estimated Hours (Claude Code) |
|---|---|
| 1 — Foundation | 8-12 hrs |
| 2 — GL Core | 16-24 hrs |
| 3 — AR | 16-20 hrs |
| 4 — AP | 16-20 hrs |
| 5 — Tax | 12-18 hrs |
| 6 — Bank | 12-16 hrs |
| 7 — Reports | 16-24 hrs |
| 8 — Integrations | 8-12 hrs |
| **Total** | **104-146 hrs** |

This translates to ~3-5 weeks of focused Claude Code work with the human in the loop reviewing.

---

## TASKS.md Format

Maintain a `TASKS.md` file in the repo root with current state:

```markdown
# WIND Accounting — Task Tracker

## Current Phase: 2 — GL Core

### In Progress
- [ ] Build /gl/journal-entries/new form

### Done This Session
- [x] Implement JournalEntryService.createDraft
- [x] Implement JournalEntryService.post

### Blocked
- (none)

### Next Up
- [ ] /gl/journal-entries/[id] view + edit
- [ ] Trial Balance query function
```

Update at end of every Claude Code session.

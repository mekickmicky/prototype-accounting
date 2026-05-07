# Build Schedule

Computed 2026-05-07 12:38 UTC. Regenerate via `bun scripts/orchestrate.ts schedule`.

Pure topological grouping — wave N can run in parallel ONLY after wave N-1 fully completes. **158 total tasks across 21 waves.**

Caveat: this assumes ALL deps must finish before a task starts. In practice, intra-phase tasks can often start as soon as their *specific* deps land — use `bun scripts/orchestrate.ts ready` for the live picture.

## Wave 1 (1 tasks)

- `T-1.1` **DeepSeek** — Monorepo scaffold (Bun workspaces)

## Wave 2 (6 tasks)

- `T-1.2` **DeepSeek** — Tailwind v4 + shadcn/ui setup
- `T-1.3` **Sonnet** — Prisma schema (all 29 models)
- `T-1.5` **DeepSeek** — Decimal.js config + money helpers
- `T-1.16` **DeepSeek** — Env config + dev/deploy setup
- `T-2.17` **DeepSeek** — Zod validators (shared schemas package)
- `T-3.3` **DeepSeek** — Service catalog (static JSON)

## Wave 3 (10 tasks)

- `T-1.4` **Opus** — DB CHECK constraints (raw SQL migration)
- `T-1.6` **DeepSeek** — Design tokens (CSS variables)
- `T-1.10` **DeepSeek** — Seed: Chart of Accounts
- `T-3.4` **Opus** — Invoice math helpers (subtotal, VAT, withholding)
- `T-3.25` **DeepSeek** — AR Zod schemas
- `T-4.3` **DeepSeek** — WHT rate table (lookup)
- `T-4.16` **DeepSeek** — AP Zod schemas
- `T-5.13` **DeepSeek** — Tax Zod schemas
- `T-8.1` **DeepSeek** — `WebhookProcessed` model + migration
- `T-8.10` **DeepSeek** — Webhook Zod schemas

## Wave 4 (5 tasks)

- `T-1.7` **Sonnet** — Reusable UI components scaffold
- `T-1.9` **Sonnet** — Theme toggle (dark/light)
- `T-1.11` **DeepSeek** — Seed: periods, users, branches, bank accounts, settings
- `T-4.4` **Opus** — Bill math (line totals + WHT calc on PRE-VAT)
- `T-8.3` **Sonnet** — Idempotency helper

## Wave 5 (3 tasks)

- `T-1.8` **Sonnet** — Base layout (sidebar + topbar)
- `T-1.12` **Sonnet** — JWT cookie middleware (Elysia)
- `T-2.28` **Sonnet** — GL UI primitives (AccountPicker, BranchPicker, PeriodPicker, DatePicker)

## Wave 6 (2 tasks)

- `T-1.13` **Sonnet** — Auth API endpoints
- `T-7.20` **Sonnet** — Common report filter bar

## Wave 7 (1 tasks)

- `T-1.14` **Sonnet** — Login page + useUser hook

## Wave 8 (1 tasks)

- `T-1.15` **DeepSeek** — Dashboard placeholder + routing shell

## Wave 9 (4 tasks)

- `T-2.1` **Sonnet** — Error system (BusinessRuleError + envelope mapper)
- `T-6.1` **Sonnet** — `BankProvider` interface
- `T-6.6` **Opus** — CSV parser (Thai bank format)
- `T-8.4` **Sonnet** — Account map resolver

## Wave 10 (7 tasks)

- `T-2.2` **Sonnet** — AuditLog service
- `T-2.3` **Opus** — DocumentNumberingService (atomic, FOR UPDATE)
- `T-2.4` **Sonnet** — Period helpers (deriveCode, ensureExists, getStatus)
- `T-2.8` **Sonnet** — Account service (CRUD + balance compute)
- `T-6.2` **Opus** — `MockBankProvider` implementation
- `T-8.2` **Opus** — HMAC validation middleware
- `T-8.14` **Sonnet** — Account-map editor UI

## Wave 11 (7 tasks)

- `T-2.5` **Opus** — Period close checklist
- `T-2.9` **Opus** — JournalEntryService.createDraft + validate
- `T-2.14` **Sonnet** — `/api/v1/accounts` endpoints
- `T-3.1` **Sonnet** — CustomerService CRUD
- `T-4.1` **Sonnet** — VendorService CRUD (with vendor_type)
- `T-6.3` **DeepSeek** — `getBankProvider` factory
- `T-6.4` **Sonnet** — BankAccountService CRUD

## Wave 12 (11 tasks)

- `T-2.10` **Sonnet** — JournalEntryService.update (DRAFT only)
- `T-2.11` **Sonnet** — JournalEntryService.delete (DRAFT only)
- `T-2.12` **Opus** — JournalEntryService.post
- `T-2.18` **Sonnet** — `/gl/accounts` page (CoA tree)
- `T-3.2` **Sonnet** — `/api/v1/customers` endpoints
- `T-3.5` **Sonnet** — SalesInvoiceService.createDraft + validate
- `T-4.2` **Sonnet** — `/api/v1/vendors` endpoints
- `T-4.5` **Sonnet** — BillService.createDraft + validate
- `T-6.5` **Sonnet** — `/api/v1/bank-accounts` endpoints
- `T-6.7` **Opus** — Bank import service (with dedup)
- `T-6.15` **Sonnet** — `/api/v1/bank/verify-slip` endpoint

## Wave 13 (15 tasks)

- `T-2.6` **Opus** — Period close + closing entries
- `T-2.13` **Opus** — JournalEntryService.void (reversal)
- `T-2.24` **Opus** — Trial Balance query
- `T-3.6` **Sonnet** — SalesInvoiceService.update (DRAFT only)
- `T-3.7` **Opus** — SalesInvoiceService.post (with VatRegister)
- `T-3.15` **Sonnet** — `<CustomerPicker>` + `<ServicePicker>`
- `T-4.6` **Sonnet** — BillService.update (DRAFT only)
- `T-4.7` **Opus** — BillService.post (with VatRegister INPUT)
- `T-4.9` **Sonnet** — `/api/v1/bills` endpoints
- `T-4.13` **Sonnet** — `/ap/vendors` UI (list/new/detail)
- `T-6.8` **Sonnet** — `/api/v1/bank/import` endpoint
- `T-6.10` **Sonnet** — `/bank/accounts` UI
- `T-7.18` **Sonnet** — Cash Position report
- `T-8.6` **Sonnet** — Doctor commission accrual JE
- `T-8.8` **Opus** — Stock period-export handler

## Wave 14 (15 tasks)

- `T-2.7` **Sonnet** — Period reopen (admin only)
- `T-2.16` **Sonnet** — `/api/v1/journal-entries` endpoints
- `T-2.25` **Sonnet** — `/api/v1/reports/trial-balance` endpoint
- `T-3.8` **Opus** — SalesInvoiceService.void
- `T-3.10` **Sonnet** — ReceiptService.createDraft + validate
- `T-3.16` **Sonnet** — `/ar/customers` list/new/detail
- `T-3.20` **Sonnet** — Invoice PDF templates (regular + tax invoice)
- `T-3.22` **Sonnet** — AR Aging report (query + endpoint + page + export)
- `T-4.8` **Opus** — BillService.void
- `T-4.10` **Sonnet** — PaymentService.createDraft + apply logic
- `T-4.14` **Sonnet** — `/ap/bills` UI (list/new/detail) + Bill PDF
- `T-4.20` **Sonnet** — AP Aging report
- `T-5.1` **Opus** — PP30 aggregator (VatRegister query)
- `T-6.11` **Sonnet** — `/bank/import` UI
- `T-8.9` **Sonnet** — `/api/v1/webhooks/wind-stock/period-export` endpoint

## Wave 15 (13 tasks)

- `T-2.15` **Sonnet** — `/api/v1/periods` endpoints
- `T-2.19` **Sonnet** — `/gl/accounts/[code]` detail page
- `T-2.20` **Sonnet** — `/gl/journal-entries` list page
- `T-2.21` **Sonnet** — `/gl/journal-entries/new` form page
- `T-2.26` **Sonnet** — `/reports/trial-balance` page
- `T-2.27` **Sonnet** — TB exports (CSV + XLSX + PDF templates)
- `T-2.29` **Sonnet** — GL Dashboard page (`/gl/dashboard`)
- `T-3.9` **Sonnet** — `/api/v1/sales-invoices` endpoints
- `T-3.11` **Opus** — ReceiptApplication logic (paid_amount + status)
- `T-3.23` **Sonnet** — Customer statement on `/ar/customers/[id]`
- `T-4.11` **Opus** — PaymentService.post (with WithholdingRecord auto-create)
- `T-5.2` **Opus** — TaxFilingService (PP30 lifecycle)
- `T-5.8` **Sonnet** — PP30 PDF generator

## Wave 16 (11 tasks)

- `T-2.22` **Sonnet** — `/gl/journal-entries/[id]` view/edit page
- `T-2.23` **Sonnet** — `/gl/periods` page + close checklist modal
- `T-3.12` **Opus** — ReceiptService.post (with advance payment)
- `T-3.17` **Sonnet** — `/ar/invoices` list page
- `T-3.18` **Sonnet** — `/ar/invoices/new` + edit form
- `T-4.12` **Opus** — PaymentService.void (cascade)
- `T-4.19` **Sonnet** — WHT certificate (50 ทวิ) PDF
- `T-5.3` **Opus** — PP30 closing JE (auto-post on submit)
- `T-5.4` **Opus** — PND3/PND53 aggregator (WithholdingRecord query)
- `T-7.17` **Sonnet** — VAT Summary report
- `T-7.22` **DeepSeek** — Common export utilities (CSV/XLSX/PDF wiring)

## Wave 17 (10 tasks)

- `T-3.13` **Opus** — ReceiptService.void (cascade unapply)
- `T-3.19` **Sonnet** — `/ar/invoices/[id]` detail
- `T-4.15` **Sonnet** — `/api/v1/payments` endpoints
- `T-5.5` **Sonnet** — `/api/v1/tax-filings` PP30 endpoints
- `T-5.6` **Opus** — TaxFilingService (PND3/PND53 lifecycle)
- `T-5.9` **Sonnet** — PND3/PND53 PDF generators
- `T-5.15` **Sonnet** — `/tax/wht-certs` browser
- `T-6.9` **Opus** — Auto-match heuristic
- `T-7.1` **Sonnet** — Common report types + query helpers
- `T-8.5` **Opus** — Visit-completed handler (auto-invoice + receipt)

## Wave 18 (10 tasks)

- `T-3.14` **Sonnet** — `/api/v1/receipts` endpoints
- `T-4.17` **Sonnet** — `/ap/payments` UI (list/new/detail)
- `T-4.18` **Sonnet** — `/ap/dashboard` page
- `T-5.7` **Sonnet** — `/api/v1/tax-filings` PND endpoints
- `T-5.10` **Sonnet** — `/tax/pp30` UI (list / new / detail)
- `T-6.13` **Opus** — BankReconciliationService (match / unmatch / ignore / create JE)
- `T-7.2` **Opus** — P&L query
- `T-7.6` **Opus** — Balance Sheet query
- `T-7.14` **Sonnet** — General Ledger detail query
- `T-8.7` **Sonnet** — `/api/v1/webhooks/wind-clinic/visit-completed` endpoint

## Wave 19 (16 tasks)

- `T-3.21` **Sonnet** — `/ar/receipts` list/new/detail
- `T-3.24` **Sonnet** — `/ar/dashboard` page
- `T-5.11` **Sonnet** — `/tax/pnd3` UI
- `T-5.12` **Sonnet** — `/tax/pnd53` UI
- `T-5.14` **Sonnet** — `/tax/dashboard` page
- `T-6.14` **Sonnet** — `/api/v1/bank/reconcile|ignore-txn|verify-slip` + view endpoints
- `T-7.3` **Sonnet** — `/api/v1/reports/profit-loss` endpoint
- `T-7.5` **Sonnet** — P&L PDF template
- `T-7.7` **Sonnet** — `/api/v1/reports/balance-sheet` endpoint
- `T-7.9` **Sonnet** — BS PDF template
- `T-7.10` **Opus** — Cash Flow query (indirect method)
- `T-7.15` **Sonnet** — `/api/v1/reports/general-ledger` endpoint
- `T-7.19` **Sonnet** — Branch P&L (multi-column)
- `T-8.11` **Sonnet** — Mock webhook CLI
- `T-8.13` **Sonnet** — Webhook dashboard (log table)
- `T-8.15` **DeepSeek** — Webhook audit log polish

## Wave 20 (8 tasks)

- `T-6.12` **Sonnet** — `/bank/reconcile/[account_id]` UI (two-pane workspace)
- `T-6.16` **Sonnet** — Slip verify in Receipt form
- `T-7.8` **Sonnet** — `/reports/balance-sheet` page
- `T-7.11` **Sonnet** — `/api/v1/reports/cash-flow` endpoint
- `T-7.13` **Sonnet** — CF PDF template
- `T-7.16` **Sonnet** — `/reports/general-ledger` page
- `T-7.21` **Sonnet** — Comparative mode plumbing
- `T-8.12` **Sonnet** — Test webhook page

## Wave 21 (2 tasks)

- `T-7.4` **Sonnet** — `/reports/profit-loss` page
- `T-7.12` **Sonnet** — `/reports/cash-flow` page

# Phase 3 — AR (Sales)

**Goal:** Invoice customers, receive payment, AR ages.
**Reads:** specs/01-domain-model.md, specs/02-business-rules.md §4.1–4.4, specs/03-thai-tax.md §1–3, specs/04-modules.md §3 (AR), specs/05-api-contracts.md §AR, specs/06-ui-design-system.md, specs/11 §Phase 3
**Acceptance:** specs/11-build-phases.md §Phase 3

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-3.25 (Zod) ─┐
              ├─ T-3.2 (Customers API) ─┬─ T-3.16 (Customers UI) ─┐
T-3.1 (Customer svc) ─┘                  │                          │
                                         │                          ├─ T-3.23 (Statement)
T-3.3 (Service catalog) ─┐                │                          │
T-3.4 (Invoice math) ─┬───┼─ T-3.5/.6 (Invoice draft) ─ T-3.7 (Invoice post) ─ T-3.8 (Invoice void)
                       │   │                                            │
                       │   │                                            ├─ T-3.9 (Invoice API) ─ T-3.17/.18/.19 (Invoice UI) ─ T-3.20 (Invoice PDF)
                       │   │                                            │
                       │   └─ T-3.10 (Receipt draft) ─ T-3.11 (Apply) ─ T-3.12 (Receipt post) ─ T-3.13 (Receipt void)
                       │                                                  │
                       │                                                  └─ T-3.14 (Receipt API) ─ T-3.21 (Receipt UI)
                       │
                       └─ T-3.22 (Aging) → T-3.24 (Dashboard)
```

## Parallel Lanes

- **Lane A (foundations, parallel):** T-3.1, T-3.3, T-3.4, T-3.25
- **Lane B (Customers, sequential):** T-3.2 → T-3.16
- **Lane C (Invoice service, sequential):** T-3.5 → T-3.6 → T-3.7 → T-3.8
- **Lane D (Receipt service, sequential after T-3.7):** T-3.10 → T-3.11 → T-3.12 → T-3.13
- **Lane E (Invoice API + UI, after Lane C):** T-3.9 → T-3.17/.18/.19/.20 (parallel)
- **Lane F (Receipt API + UI, after Lane D):** T-3.14 → T-3.21
- **Lane G (Reports, after Invoice/Receipt post):** T-3.22 → T-3.23 → T-3.24
- **Lane H (Pickers, parallel after Phase 2):** T-3.15

## Cross-Phase Anchors Produced

- `SalesInvoiceService.post` — used by Phase 8 visit-completed webhook
- `ReceiptService.post` — used by Phase 6 bank reconciliation match, Phase 8 webhook
- VatRegister OUTPUT rows — read by Phase 5 PP30 aggregation
- AR aging query — polished in Phase 7 reports

---

## Tasks

### T-3.1 — CustomerService CRUD
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/customer.ts` (NEW)
- **Reads:** specs/01 §Customer, specs/04 §3.2
- **Spec:**
  - `listCustomers(filters, pagination)`, `getCustomer(id)`, `createCustomer(input, actor_id)`, `updateCustomer(id, input, ifMatch)`, `softDeleteCustomer(id)`
  - Auto-generate `code` via `nextDocNo('CUST', year, 'customers', 'code')` if blank
  - `name_th` optional; `tax_id` 13-digit regex validation
  - Soft-delete blocked if customer has open invoices (returns CUSTOMER_HAS_OPEN_INVOICES)
  - AuditLog on every state change
- **Depends on:** T-2.3, T-2.2, T-2.1
- **Blocks:** T-3.2, T-3.5
- **Done when:** Create customer auto-generates `CUST-2026-0001`; delete with open invoice returns 409

### T-3.2 — `/api/v1/customers` endpoints
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/customers.ts` (NEW)
- **Reads:** specs/05 §AR: Customers
- **Spec:**
  - `GET /customers` (?q, ?active, paginated)
  - `POST /customers`
  - `GET /customers/:id` — customer + open invoices summary + statement link
  - `PATCH /customers/:id` (with If-Match `updated_at`)
  - `DELETE /customers/:id` (soft)
- **Depends on:** T-3.1, T-3.25
- **Blocks:** T-3.16
- **Done when:** All 5 endpoints round-trip; pagination meta correct; q searches code + name + name_th + phone

### T-3.3 — Service catalog (static JSON)
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `packages/shared/src/catalog/services.ts` (NEW)
- **Reads:** specs/04 §3.3, specs/10 §Service catalog
- **Spec:**
  - Hardcoded array of clinic services (BOTOX, FILLER, LASER, SKINCARE, CONSULTATION, etc.)
  - Per service: `code`, `name_th`, `name_en`, `default_unit_price` (Decimal string), `default_revenue_account_code`, `default_vat_rate` ('7'|'0'|'EXEMPT'), `category`
  - Will be overridden by wind-clinic webhook later but used now for picker autocomplete
- **Depends on:** T-1.1
- **Blocks:** T-3.15, T-3.18
- **Done when:** ≥10 services exported, each with valid revenue account code that exists in CoA

### T-3.4 — Invoice math helpers (subtotal, VAT, withholding)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `packages/shared/src/invoice-math.ts` (NEW)
- **Reads:** specs/02 §13 (money math), specs/03 §1–3
- **Spec:**
  - `lineNet({ qty, unit_price, discount }): Decimal`
  - `lineVat({ net, vat_rate, vat_inclusive }): { net, vat, gross }` — handles `vat_inclusive=true` by dividing by 1.07 (per §13.3); rounds each independently to 2dp
  - `invoiceTotals(lines, opts): { subtotal, discount_total, vat_total, withholding_total, total }`
  - `withholdingFromLine({ net_excl_vat, wht_rate }): Decimal` — WHT on PRE-VAT amount per §13.4
  - All Decimal; rounded once at field assignment
- **Depends on:** T-1.5
- **Blocks:** T-3.5, T-4.4 (Bill math)
- **Done when:** Property test: for any line `(qty, price, discount, vat_rate, vat_inclusive)`, `net + vat === gross` and totals reconcile across lines

### T-3.5 — SalesInvoiceService.createDraft + validate
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/sales-invoice.ts` (NEW)
- **Reads:** specs/05 §POST /sales-invoices, specs/02 §4.1, specs/03 §1.3
- **Spec:**
  - `createDraft(input, actor_id)`
  - Validate: customer exists; ≥1 line; each line has `revenue_account_code` resolving to postable account; `is_tax_invoice=true` requires customer.tax_id + customer.address (else INVALID_TAX_INVOICE)
  - Compute totals via `invoiceTotals`
  - Persist with status=DRAFT, no `invoice_no`/`tax_invoice_no` yet
  - AuditLog action=CREATE
- **Depends on:** T-3.1, T-3.4, T-2.8
- **Blocks:** T-3.6, T-3.7
- **Done when:** Draft with `is_tax_invoice=true` but customer missing tax_id returns INVALID_TAX_INVOICE; valid draft persists with computed totals

### T-3.6 — SalesInvoiceService.update (DRAFT only)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/sales-invoice.ts` (EDIT)
- **Reads:** specs/02 §5.1, §12.1
- **Spec:**
  - `update(id, input, actor_id, ifMatch)`
  - Throws `INVOICE_NOT_DRAFT` if posted; `STALE_RECORD` on optimistic lock fail
  - Replaces lines; rerun all draft validations
  - AuditLog UPDATE
- **Depends on:** T-3.5
- **Blocks:** T-3.9
- **Done when:** Update posted invoice returns 409; valid update succeeds

### T-3.7 — SalesInvoiceService.post (with VatRegister)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/sales-invoice.ts` (EDIT)
- **Reads:** specs/02 §4.1, specs/03 §2
- **Spec:** Inside `prisma.$transaction`:
  - Re-validate (defense in depth)
  - `assertOpen` for derived period
  - Generate `invoice_no` via `nextDocNo('INV', year, ...)`
  - If `is_tax_invoice`: also generate `tax_invoice_no` via `nextDocNo('TAX', year, ...)` — separate sequence
  - Create JE via `JournalEntryService.post` with lines per §4.1:
    - Dr AR (12010) `total - withholding_amount`
    - Dr WHT Receivable (14020) `withholding_amount` (only if > 0)
    - Cr Revenue (per line `revenue_account_code`) for each line's `net`
    - Cr VAT Payable (21110) `vat_total` (only if > 0)
  - Insert one VatRegister row with `vat_type='OUTPUT'`, `tax_invoice_no`, `counterparty_*` from customer, totals
  - Set invoice status=POSTED, link `je_id`, `posted_at`, `posted_by_id`
  - AuditLog POST
- **Depends on:** T-3.5, T-2.12, T-2.3
- **Blocks:** T-3.8, T-3.10, T-3.22, Phase 5 (VatRegister consumed), Phase 8 webhook
- **Done when:** Posting INV with 1 line @ 1000 net + 7% VAT creates JE: Dr AR 1070, Cr Revenue 1000, Cr VAT 70; VatRegister row inserted; tax invoice flag generates separate tax_invoice_no

### T-3.8 — SalesInvoiceService.void
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/sales-invoice.ts` (EDIT)
- **Reads:** specs/02 §4.2, §5.3
- **Spec:**
  - Block with `INVOICE_HAS_PAYMENTS` if any ReceiptApplication exists with `applied_amount > 0`
  - Else: void via `JournalEntryService.void` on the linked JE (creates reversal, updates VAT register accordingly: insert a reversing VatRegister row with negative amounts and `reversal_of_id`)
  - Set invoice status=VOID, `voided_at`, `void_reason`
  - AuditLog VOID
- **Depends on:** T-3.7, T-2.13
- **Blocks:** T-3.9
- **Done when:** Void of paid invoice returns 409; void of unpaid invoice produces reversal JE + reversal VatRegister row; subsequent PP30 preview excludes both rows (net zero)

### T-3.9 — `/api/v1/sales-invoices` endpoints
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/sales-invoices.ts` (NEW)
- **Reads:** specs/05 §AR: Sales Invoices
- **Spec:**
  - `GET /sales-invoices` (?customer_id, ?status, ?overdue, ?period, paginated)
  - `POST /sales-invoices` (DRAFT)
  - `GET /sales-invoices/:id`
  - `PATCH /sales-invoices/:id` (DRAFT only)
  - `POST /sales-invoices/:id/post`
  - `POST /sales-invoices/:id/void` (body `{ reason }`)
  - `GET /sales-invoices/:id/pdf` — streams from T-3.20
- **Depends on:** T-3.5, T-3.6, T-3.7, T-3.8, T-3.20, T-3.25
- **Blocks:** T-3.17, T-3.18, T-3.19
- **Done when:** All 7 endpoints round-trip; `?overdue=true` filters by `due_date < today AND paid_amount < total`

### T-3.10 — ReceiptService.createDraft + validate
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/receipt.ts` (NEW)
- **Reads:** specs/05 §POST /receipts, specs/02 §4.3–4.4
- **Spec:**
  - `createDraft(input, actor_id)`
  - Validate: customer exists; if `payment_method != 'CASH'` then `bank_account_id` required; sum of `applications[].applied_amount` ≤ `total_amount`; each application's invoice belongs to same customer + status POSTED + `paid_amount + applied_amount ≤ total`
  - Persist status=DRAFT
- **Depends on:** T-3.7, T-3.1
- **Blocks:** T-3.11
- **Done when:** Receipt with applied > total returns RECEIPT_OVERAPPLIED; valid draft persists

### T-3.11 — ReceiptApplication logic (paid_amount + status)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/receipt-application.ts` (NEW)
- **Reads:** specs/02 §4.3
- **Spec:**
  - `applyToInvoices(tx, receipt_id, applications): void` — within receipt post tx
  - For each application: increment invoice.`paid_amount` by `applied_amount`
  - If `paid_amount >= total`: invoice.status='PAID'; if `0 < paid_amount < total`: 'PARTIAL_PAID'
  - `unapplyFromInvoices(tx, receipt_id): void` — within receipt void tx — decrement and reset status to POSTED if `paid_amount` drops to 0
  - Concurrency: row-lock invoice while updating
- **Depends on:** T-3.10
- **Blocks:** T-3.12, T-3.13
- **Done when:** Apply 500 to invoice with total 1000 → PARTIAL_PAID; apply another 500 → PAID; unapply both → POSTED

### T-3.12 — ReceiptService.post (with advance payment)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/receipt.ts` (EDIT)
- **Reads:** specs/02 §4.3 (applied), §4.4 (advance)
- **Spec:** Inside `prisma.$transaction`:
  - `assertOpen`, generate `receipt_no` via `nextDocNo('RCT', year, ...)`
  - Resolve cash/bank account: if `payment_method='CASH'` use cash account (11010); else use `bank_account.gl_account_code`
  - Create JE via `JournalEntryService.post`:
    - **If applications.length > 0:**
      - Dr Cash/Bank `total_amount - card_fee`
      - Dr Bank Fees (61070) `card_fee` (if > 0)
      - Cr AR (12010) `total_amount` (or sum of applied if partial)
      - For unapplied portion: Cr Customer Deposits (21210) `total_amount - sum_applied`
    - **If no applications (pure advance):**
      - Dr Cash/Bank `total_amount - card_fee`
      - Dr Bank Fees `card_fee`
      - Cr Customer Deposits (21210) `total_amount`
  - Call `applyToInvoices`
  - Set status=POSTED, link `je_id`
  - AuditLog POST
- **Depends on:** T-3.11, T-2.12, T-2.3
- **Blocks:** T-3.13, T-3.22, Phase 6 reconciliation, Phase 8 webhook
- **Done when:** Receipt 1000 applied to invoice 1000 → invoice PAID, JE: Dr Bank 1000 / Cr AR 1000; advance receipt 500 with no applications → JE: Dr Bank 500 / Cr Customer Deposits 500

### T-3.13 — ReceiptService.void (cascade unapply)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/receipt.ts` (EDIT)
- **Reads:** specs/02 §5.3
- **Spec:**
  - Inside tx: void linked JE via `JournalEntryService.void`
  - Call `unapplyFromInvoices` to revert each invoice's `paid_amount` and status
  - Set receipt status=VOID, `voided_at`, `void_reason`
  - AuditLog VOID
- **Depends on:** T-3.12, T-2.13
- **Blocks:** T-3.14
- **Done when:** Voiding a receipt that fully paid an invoice → invoice back to POSTED; reversal JE created

### T-3.14 — `/api/v1/receipts` endpoints
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/receipts.ts` (NEW)
- **Reads:** specs/05 §AR: Receipts
- **Spec:**
  - `GET /receipts` (?customer_id, ?status, ?period, paginated)
  - `POST /receipts` (DRAFT)
  - `GET /receipts/:id`
  - `PATCH /receipts/:id` (DRAFT only)
  - `POST /receipts/:id/post`
  - `POST /receipts/:id/void`
  - `GET /receipts/:id/pdf`
- **Depends on:** T-3.10, T-3.12, T-3.13, T-3.20, T-3.25
- **Blocks:** T-3.21
- **Done when:** All endpoints round-trip; receipt PDF includes invoice references

### T-3.15 — `<CustomerPicker>` + `<ServicePicker>`
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/components/ui/customer-picker.tsx`, `service-picker.tsx` (NEW)
- **Reads:** specs/04 §3.2, §3.3
- **Spec:**
  - `<CustomerPicker>` — combobox searching `/customers?q=`, "Quick add" inline modal that posts `/customers` then auto-selects
  - `<ServicePicker>` — combobox over `services.ts` catalog, returns `{ code, name_th, default_unit_price, default_revenue_account_code, default_vat_rate }` for autofill
- **Depends on:** T-1.7, T-3.2, T-3.3
- **Blocks:** T-3.16, T-3.18
- **Done when:** Both render in `/dev/components`; quick-add round-trips back into picker

### T-3.16 — `/ar/customers` list/new/detail
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/customers/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §3.1, §3.2
- **Spec:**
  - List: `<DataTable>` columns code, name, tax_id, phone, payment_terms_days, AR balance, last invoice date; filter by q + active
  - New: form with required fields; auto-suggest next CUST-NNNN
  - Detail: profile + open invoices table + receipts list + running balance + statement link (statement implemented in T-3.23)
- **Depends on:** T-3.2, T-3.15
- **Blocks:** T-3.23
- **Done when:** CRUD flow round-trips; detail page shows correct AR balance

### T-3.17 — `/ar/invoices` list page
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/invoices/page.tsx` (NEW)
- **Reads:** specs/04 §3.1
- **Spec:**
  - `<DataTable>`: invoice_no, tax_invoice_no, customer, issue_date, due_date, total, paid_amount, balance, status badge
  - Filters: customer, status (default POSTED+DRAFT), overdue toggle, period, branch, date range, q
  - "+ New Invoice" button
- **Depends on:** T-3.9
- **Blocks:** —
- **Done when:** Filters compose; overdue toggle filters correctly; pagination works

### T-3.18 — `/ar/invoices/new` + edit form
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/invoices/new/page.tsx`, `apps/web/src/components/ar/invoice-form.tsx` (NEW)
- **Reads:** specs/04 §3.3, wireframes/04-sales-invoice.html
- **Spec:**
  - Header: customer picker, branch picker, issue date, due date, tax invoice toggle, vat-inclusive toggle, source ref (optional)
  - Lines table: description, service picker (autofills code, price, account, vat), qty, unit price, discount, vat rate, revenue account
  - Live footer totals: subtotal, discount, subtotal after discount, VAT, withholding, total
  - "Save Draft" / "Post" / "Cancel"
  - Show `<JEPreview>` panel that renders the JE that will be created (calls a `/sales-invoices/preview-je` helper or computes client-side using `invoice-math`)
- **Depends on:** T-3.9, T-3.15, T-2.28, T-3.4
- **Blocks:** T-3.19
- **Done when:** Visually matches wireframe; live totals match backend; post returns invoice with je_no

### T-3.19 — `/ar/invoices/[id]` detail
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/invoices/[id]/page.tsx` (NEW)
- **Reads:** specs/04 §3.1
- **Spec:**
  - DRAFT → reuse `<InvoiceForm>` for edit
  - POSTED → read-only display + actions: "Print", "Download PDF", "Record Payment" (opens receipt form pre-filled), "Void" (reason dialog)
  - PAID → same as POSTED but Record Payment hidden
  - VOID → banner with reason + reversal JE link
  - Right side: receipt history (apps with applied amounts)
  - Linked JE link
- **Depends on:** T-3.9, T-3.18
- **Blocks:** T-3.21 (Record Payment entry point)
- **Done when:** State-specific UI correct; Record Payment opens prefilled receipt form

### T-3.20 — Invoice PDF templates (regular + tax invoice)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/sales-invoice.tsx`, `apps/api/src/pdf/tax-invoice.tsx` (NEW)
- **Reads:** specs/03 §1.3 (tax invoice required fields)
- **Spec:**
  - Regular invoice PDF: ใบแจ้งหนี้ header, company + branch, customer, line items table, totals box, payment terms, signature block
  - Tax invoice PDF: ใบกำกับภาษี header (per §1.3 mandatory fields), seller's 13-digit tax_id + branch_office, buyer tax_id + branch_office, separate VAT line, total
  - Combined "ใบกำกับภาษี/ใบเสร็จรับเงิน" variant when invoice has full payment same day (selected automatically when fully receipted)
  - Sarabun font for Thai
- **Depends on:** T-3.7
- **Blocks:** T-3.9 (PDF endpoint)
- **Done when:** Both PDFs render with correct data; tax invoice missing tax_id throws INVALID_TAX_INVOICE before render

### T-3.21 — `/ar/receipts` list/new/detail
- [x] **Status:** Done (2026-05-08)
- **Budget USD:** 2.50
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/receipts/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §3.4
- **Spec:**
  - List: receipt_no, date, customer, payment method, total, applied total, applications count
  - New: customer picker → loads unpaid invoices → checkbox + amount per invoice (default = balance) → payment method → bank account picker (if not cash) → card_fee → save/post
  - Detail: shows applications table (invoice_no, applied_amount), JE link, void button
  - Two entry points: standalone `/ar/receipts/new` and "Record Payment" from invoice detail (prefilled)
- **Depends on:** T-3.14, T-3.19
- **Blocks:** —
- **Done when:** Both entry points work; cash receipt → debits cash; bank transfer → debits bank account; card with fee → expense account debited

### T-3.22 — AR Aging report (query + endpoint + page + export)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/ar-aging.ts`, route in `reports.ts` (EDIT), `apps/web/src/app/(authenticated)/reports/ar-aging/page.tsx`, `apps/api/src/pdf/ar-aging.tsx` (NEW)
- **Reads:** specs/04 §3.5, specs/08 §AR Aging
- **Spec:**
  - Query: per customer, sum invoice balances bucketed by `today - due_date`: Current, 1-30, 31-60, 61-90, 90+
  - Drill down to invoice list per bucket
  - `GET /reports/ar-aging?as_of=...&branch=...&format=...`
  - Page: `<DataTable>` with bucket columns; totals row; expand row to see invoices
- **Depends on:** T-3.7
- **Blocks:** T-3.24
- **Done when:** Buckets correct; sum across buckets per customer = customer's open AR balance; matches sum of (invoice.total - paid_amount) for POSTED invoices

### T-3.23 — Customer statement on `/ar/customers/[id]`
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/components/ar/customer-statement.tsx`, `apps/api/src/lib/reports/customer-statement.ts` (NEW)
- **Reads:** specs/04 §3.1 (Customer detail)
- **Spec:**
  - Chronological list: date, document type (Invoice/Receipt), document_no, debit, credit, running balance
  - Period range filter
  - Export PDF
- **Depends on:** T-3.16
- **Blocks:** —
- **Done when:** Running balance ties out to customer's total AR; clicking row navigates to invoice/receipt detail

### T-3.24 — `/ar/dashboard` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ar/dashboard/page.tsx` (NEW)
- **Reads:** specs/04 §3.1
- **Spec:**
  - 4 cards: this month revenue, AR balance, overdue count + amount, this month receipt total
  - Top 5 overdue customers (table)
  - Recent invoices (5)
  - Quick actions: New Invoice, New Receipt
- **Depends on:** T-3.9, T-3.14, T-3.22
- **Blocks:** —
- **Done when:** Cards show correct numbers; overdue list links to AR aging filtered

### T-3.25 — AR Zod schemas
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `packages/shared/src/schemas/ar.ts` (NEW)
- **Reads:** specs/05 §AR (all request shapes)
- **Spec:** Zod schemas for: Customer create/update, SalesInvoice create/update, Receipt create/update, common filters
- **Depends on:** T-2.17
- **Blocks:** T-3.2, T-3.9, T-3.14
- **Done when:** Importable; invalid inputs rejected at API boundary

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Can create + post an invoice; JE auto-created with correct lines | T-3.7 |
| Tax invoice flag generates separate tax_invoice_no | T-3.7 |
| VatRegister row inserted with vat_type=OUTPUT | T-3.7 |
| Can record receipt against invoice; status updates to PAID/PARTIAL_PAID | T-3.11, T-3.12 |
| Can record advance payment; creates Customer Deposits liability | T-3.12 |
| Voiding invoice with applied receipts returns INVOICE_HAS_PAYMENTS | T-3.8 |
| Voiding receipt re-opens invoices | T-3.13 |
| AR Aging shows correct buckets | T-3.22 |
| Invoice PDF renders with all required tax invoice fields | T-3.20 |
| Customer detail shows running balance and open invoices | T-3.23 |
| Cash receipt debits cash; transfer debits bank | T-3.12 |
| Card fee debits expense, reducing net deposit | T-3.12 |

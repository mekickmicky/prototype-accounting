# Phase 8 — Integrations (Webhooks)

**Goal:** Receive webhooks from `wind-clinic` (per-visit) and `wind-stock` (period export). Auto-create invoice + receipt + JE from clinic visits; bulk-create JEs from stock movements. HMAC-signed, idempotent.
**Reads:** specs/02 §4.1, §4.3 (referenced posting), specs/04 §8 (Integrations module), specs/05-api-contracts.md §Integrations, specs/09-integrations.md (full), specs/11 §Phase 8
**Acceptance:** specs/11-build-phases.md §Phase 8

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-8.1 (WebhookProcessed model + migration)
   ▼
T-8.2 (HMAC validation middleware) ─┬─ T-8.3 (Idempotency helper) ─┬─ T-8.5 (visit-completed handler) ─ T-8.7 (visit endpoint)
                                     │                              │       │
                                     │                              │       ├─ T-8.6 (commission accrual)
                                     │                              │       └─ T-8.4 (account map resolver)
                                     │                              │
                                     │                              └─ T-8.8 (stock period-export handler) ─ T-8.9 (stock endpoint)
                                     │
                                     └─ T-8.10 (Webhook Zod schemas)

T-8.11 (mock CLI) ─┐
T-8.12 (test page) ─┼─ T-8.13 (dashboard) ─ T-8.14 (account-map UI)
T-8.15 (audit log polish) ─┘
```

## Parallel Lanes

- **Lane A (foundations, sequential):** T-8.1 → T-8.2, T-8.3, T-8.10
- **Lane B (visit-completed):** T-8.4 → T-8.5 → T-8.6 → T-8.7
- **Lane C (stock export, parallel to B):** T-8.8 → T-8.9
- **Lane D (DX + UI, parallel after Lane B/C):** T-8.11, T-8.12, T-8.13, T-8.14, T-8.15

## Cross-Phase Anchors Consumed

- `SalesInvoiceService.post` (T-3.7), `ReceiptService.post` (T-3.12), `JournalEntryService.post` (T-2.12)
- `BankProvider.verifySlip` (T-6.15) — optional pre-check on incoming TRANSFER/QR payments
- Account map seeded (Phase 1 T-1.11)

---

## Tasks

### T-8.1 — `WebhookProcessed` model + migration
- [x] **Status:** Done (2026-05-08)
- **Model:** DeepSeek
- **Files:** `apps/api/prisma/schema.prisma` (EDIT), `apps/api/prisma/migrations/00XX_webhook_processed/migration.sql` (NEW)
- **Reads:** specs/09 §Idempotency
- **Spec:**
  - Model `WebhookProcessed { id, source, idempotency_key, result_json Json, created_at }` with `@@unique([source, idempotency_key])` and `@@index([created_at])` for cleanup
  - Migration creates table + indexes
- **Depends on:** T-1.3
- **Blocks:** T-8.3
- **Done when:** Migration applies; manual insert of duplicate `(source, key)` fails

### T-8.2 — HMAC validation middleware
- [x] **Status:** Done (2026-05-08)
- **Timeout Min:** 150
- **Model:** Opus
- **Files:** `apps/api/src/middleware/webhook-auth.ts` (NEW)
- **Reads:** specs/09 §HMAC signature, §Receiver validation
- **Spec:**
  - Elysia plugin factory `webhookAuth(secretEnvVar: string)`
  - Reads raw body (not parsed JSON — must validate against bytes); reads `x-signature`, `x-timestamp` headers
  - Throws `WEBHOOK_SIGNATURE_INVALID` (401) if HMAC mismatch
  - Throws `TIMESTAMP_TOO_OLD` (401) if `Date.now() - timestamp > 5 * 60 * 1000`
  - Use `crypto.createHmac('sha256', secret).update(rawBody).digest('hex')`
  - **Constant-time comparison** (`crypto.timingSafeEqual`) to prevent timing attacks
- **Depends on:** T-8.1, T-2.1
- **Blocks:** T-8.7, T-8.9
- **Done when:** Test: valid signature passes; bad signature 401; old timestamp 401; signature for tampered body fails

### T-8.3 — Idempotency helper
- [x] **Status:** Done (2026-05-08)
- **Timeout Min:** 120
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/webhook-idempotency.ts` (NEW)
- **Reads:** specs/09 §Idempotency
- **Spec:**
  - `withIdempotency(tx, source, key, fn): Promise<{ result, replayed: boolean }>`
  - Look up `(source, key)` — if exists, return `{ result: row.result_json, replayed: true }`
  - Else run `fn()`, persist result + key, return `{ result, replayed: false }`
  - Unique constraint catches race; on conflict, re-fetch and return original
  - Cleanup: separate cron-able function `purgeOldWebhookRecords(days=30)`
- **Depends on:** T-8.1
- **Blocks:** T-8.5, T-8.8
- **Done when:** Calling twice with same key returns identical result; second call has `replayed=true`

### T-8.4 — Account map resolver
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/account-map.ts` (NEW)
- **Reads:** specs/09 §Account mapping, specs/04 §9.2
- **Spec:**
  - `getAccountMap(tx): Promise<AccountMap>` — read from `Setting` table seeded in Phase 1
  - `mapServiceToAccount(code, map): string` — exact match in `wind_clinic_service_to_revenue`, then prefix wildcard (`SKINCARE_*`), then `DEFAULT` fallback (`41090`); logs warning to AuditLog when fallback triggered
  - `mapPaymentMethodToBank(method, bank_account_code, map): string` — map.payment_to_bank lookup
  - `getCardFeeAccount(map): string` (61070), `getDefaultARAccount(map)` (12010), `getDefaultAPAccount(map)` (21010)
- **Depends on:** Phase 1 seeded account_map
- **Blocks:** T-8.5
- **Done when:** Unknown service code returns DEFAULT and emits audit warning; wildcard `SKINCARE_RETINOL` matches `SKINCARE_*`

### T-8.5 — Visit-completed handler (auto-invoice + receipt)
- [x] **Status:** Done (2026-05-09)
- **Model:** Opus
- **Files:** `apps/api/src/services/webhooks/wind-clinic.ts` (NEW)
- **Reads:** specs/09 §1 (full)
- **Spec:** Inside one big `prisma.$transaction` wrapped by `withIdempotency(visit_id)`:
  1. **Validate payload sums:** `SUM(qty × unit_price - discount)` (per item) === `payment.amount + (sum of vat-inclusive split, as appropriate) - card_fee`. Reject 422 with EXPLICIT_TOTAL_MISMATCH if off by more than 0.02 (rounding tolerance)
  2. **Customer:** find by `code = WIND-{patient_id}`; if not found, create with `code, name, name_th, tax_id, address, phone, branch_office='00000'`. Never auto-merge by name (per §Edge cases).
  3. **Map items → invoice lines:** for each `item`, resolve `revenue_account_code` via `mapServiceToAccount`/`mapProductToAccount` (T-8.4); compute net/vat with `vat_inclusive=true`
  4. **Create + post invoice** via `SalesInvoiceService.createDraft` then `.post`: `is_tax_invoice=request_full_tax_invoice`, `vat_inclusive=true`, `source_type='WIND_VISIT'`, `source_ref=visit_id`
  5. **Create + post receipt** via `ReceiptService.createDraft` then `.post`: resolve `bank_account_id` from `bank_account_code` (lookup BankAccount.code); applications=`[{ invoice_id: invoice.id, applied_amount: invoice.total }]`; `card_fee` if applicable
  6. **Doctor commissions:** for each item with `doctor_id` + `doctor_commission_pct`, call `T-8.6` to post separate commission JE
  7. Return `{ invoice_no, tax_invoice_no?, receipt_no, je_no (invoice JE), receipt_je_no, commission_je_nos? [] }`
  - **Edge cases:** card_fee on CASH method → 422; period closed → 409; service code unknown → uses DEFAULT (41090) per T-8.4 (does NOT fail)
- **Depends on:** T-8.3, T-8.4, T-3.7, T-3.12, T-8.6
- **Blocks:** T-8.7
- **Done when:** Replay with same visit_id returns identical result; clinic webhook with 2 items → invoice with 2 lines, receipt fully applied, all JEs posted

### T-8.6 — Doctor commission accrual JE
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/webhooks/doctor-commission.ts` (NEW)
- **Reads:** specs/09 §1 (commission section)
- **Spec:**
  - `postCommissionAccrual(tx, { doctor_id, amount, branch_code, date, source_ref })`
  - Posts JE via `JournalEntryService.post`:
    - Dr Doctor Commission Expense (51020) `amount`
    - Cr Commission Payable (21130) `amount`
  - source_type='DOCTOR_COMMISSION', source_id=`{visit_id}-{doctor_id}`, description includes doctor_id and visit_id
  - One JE per (doctor, visit) — even if visit has multiple items for same doctor, sum first then post one
- **Depends on:** T-2.12
- **Blocks:** T-8.5
- **Done when:** Visit with 1 doctor + 30% commission on 1000 net → JE posted: Dr 51020 300 / Cr 21130 300

### T-8.7 — `/api/v1/webhooks/wind-clinic/visit-completed` endpoint
- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/webhooks.ts` (NEW)
- **Reads:** specs/05 §POST /webhooks/wind-clinic/visit-completed
- **Spec:**
  - Apply `webhookAuth('WEBHOOK_SECRET_WIND_CLINIC')` middleware
  - Validate body via Zod schema from T-8.10
  - Call `handleVisitCompleted(payload)`
  - Return 200 `{ success: true, data: { ...result, replayed?: true } }`
  - Errors mapped: 401 (sig/timestamp), 409 (period closed), 422 (validation/total mismatch), 400 (Zod), 500 (anything else; sender will retry)
- **Depends on:** T-8.2, T-8.5, T-8.10
- **Blocks:** T-8.11, T-8.12, T-8.13
- **Done when:** End-to-end: HMAC-signed POST → invoice + receipt + JE created; bad sig → 401; replay → 200 with same data and `replayed: true`

### T-8.8 — Stock period-export handler
- [x] **Status:** Done (2026-05-08)
- **Model:** Opus
- **Files:** `apps/api/src/services/webhooks/wind-stock.ts` (NEW)
- **Reads:** specs/09 §2
- **Spec:** Inside `prisma.$transaction` wrapped by `withIdempotency(export_id)`:
  1. Period must be OPEN (throws PERIOD_NOT_OPEN if not)
  2. Pre-validate ALL account codes across ALL entries — collect into Set, single SELECT, missing → throws `ACCOUNT_NOT_FOUND` with full missing list (atomicity at the import level)
  3. For each entry: validate `SUM(debit) === SUM(credit)` (else `JE_NOT_BALANCED` for that entry — entire import rolls back)
  4. Bulk-create + post JEs via `JournalEntryService` (each as its own JE with `source_type='STOCK_EXPORT'`, `source_id=entry.source_doc_id`, description prefixed `[STOCK] {entry.description}`)
  5. Return `{ period, created_count, first_je, last_je }`
  - **Atomicity:** ANY failure rolls back entire import; idempotency record only persisted if all entries succeed
- **Depends on:** T-8.3, T-2.12
- **Blocks:** T-8.9
- **Done when:** Import of 50 entries succeeds; replay returns same result; injecting one unbalanced entry → entire import rolls back, no JEs created

### T-8.9 — `/api/v1/webhooks/wind-stock/period-export` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/webhooks.ts` (EDIT)
- **Reads:** specs/05 §POST /webhooks/wind-stock/period-export
- **Spec:**
  - Apply `webhookAuth('WEBHOOK_SECRET_WIND_STOCK')`
  - Validate via T-8.10 schema
  - Call `handlePeriodExport`
  - 200 with result; errors as in T-8.7
- **Depends on:** T-8.2, T-8.8, T-8.10
- **Blocks:** T-8.11, T-8.12
- **Done when:** Round-trip with 5 sample entries; account_not_found returns 422 with missing codes list

### T-8.10 — Webhook Zod schemas
- [x] **Status:** Done (2026-05-08)
- **Model:** DeepSeek
- **Files:** `packages/shared/src/schemas/webhooks.ts` (NEW)
- **Reads:** specs/09 §1 (visit payload), §2 (stock payload)
- **Spec:** Translate both payload shapes verbatim. Use `MoneyString`, `PeriodCode`, `BranchCode` from common schemas (T-2.17)
- **Depends on:** T-2.17
- **Blocks:** T-8.7, T-8.9
- **Done when:** Importable; invalid payload rejected with `VALIDATION_ERROR` 400

### T-8.11 — Mock webhook CLI
- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `scripts/mock-webhook.ts` (NEW)
- **Reads:** specs/09 §1 (sample payload), §HMAC signature (sender side)
- **Spec:**
  - CLI tool: `bun scripts/mock-webhook.ts visit-completed --branch=TL --items=2 --payment=CASH`
  - Generates realistic random payload, signs with `WEBHOOK_SECRET_WIND_CLINIC`, POSTs to local API
  - Subcommands: `visit-completed`, `stock-export`, `replay <visit_id>`
  - Pretty-prints request and response
- **Depends on:** T-8.7, T-8.9
- **Blocks:** —
- **Done when:** CLI fires test events successfully; test page (T-8.12) can call this CLI under the hood

### T-8.12 — Test webhook page
- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/settings/integrations/test/page.tsx`, route `POST /settings/integrations/test-webhook` (NEW)
- **Reads:** specs/04 §8, specs/11 §Phase 8 task 11
- **Spec:**
  - UI form to construct visit-completed payload (customer fields, items table, payment block) → "Send" button signs and POSTs to webhook
  - Pre-built sample payloads dropdown (cash visit, card visit, transfer with slip, multi-doctor, etc.)
  - Shows raw response inline (success or error)
  - Stock export: textarea for JSON paste + signed send
- **Depends on:** T-8.11
- **Blocks:** —
- **Done when:** Can fire any sample payload from UI and see the resulting invoice/receipt links

### T-8.13 — Webhook dashboard (log table)
- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/settings/integrations/dashboard/page.tsx`, route `GET /settings/integrations/log` (NEW)
- **Reads:** specs/04 §8, specs/11 §Phase 8 task 12
- **Spec:**
  - Lists recent WebhookProcessed rows: timestamp, source, idempotency_key, result summary, links to created docs
  - Filter by source, date range, status
  - "Replay" button (admin only) — re-runs processing without re-fetching from sender (pulls last payload from a separate `WebhookPayload` log if implemented; otherwise just shows result)
  - Stats cards: webhooks today / this week / failures (failures need separate failure log if added)
- **Depends on:** T-8.7, T-8.9
- **Blocks:** —
- **Done when:** Dashboard shows real webhook history; click row navigates to invoice/receipt detail

### T-8.14 — Account-map editor UI
- [x] **Status:** Done (2026-05-08)
- **Timeout Min:** 120
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/settings/account-map/page.tsx`, route `PATCH /settings/account-map` (NEW)
- **Reads:** specs/04 §9.2, specs/09 §Account mapping
- **Spec:**
  - Form with sections: service→revenue (table with code+account picker rows, +Add row), product→revenue, payment_method→bank account, card_fee_account, default_ar/ap
  - Account picker filters to postable accounts only
  - Save → PATCH `/settings/account-map` (admin only)
  - Next webhook uses new mapping (no restart needed — read fresh per request via T-8.4)
- **Depends on:** T-8.4
- **Blocks:** —
- **Done when:** Edit + save → fire mock webhook → resulting invoice uses new account; admin only

### T-8.15 — Webhook audit log polish
- [x] **Status:** Done (2026-05-09)
- **Model:** DeepSeek
- **Files:** `apps/api/src/services/audit-log.ts` (EDIT — extend with WEBHOOK action)
- **Reads:** specs/02 §11
- **Spec:**
  - Add `WEBHOOK_RECEIVED` action; log every successful webhook with source, idempotency_key, result, replayed flag
  - Log `WEBHOOK_REJECTED` on auth failures (signature, timestamp) with source IP
  - Make AuditLog browser at `/settings/audit-log` filterable by these actions
- **Depends on:** T-2.2, T-8.7, T-8.9
- **Blocks:** —
- **Done when:** AuditLog browser shows webhook activity; rejected webhooks logged with reason

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Sending wind-clinic webhook auto-creates Customer (if new), Invoice, Receipt, JE(s) | T-8.5, T-8.7 |
| Replay with same visit_id returns original result, no duplicates | T-8.3, T-8.5 |
| Bad signature → 401 | T-8.2 |
| Old timestamp (>5 min) → 401 | T-8.2 |
| Sending wind-stock period export bulk-creates JEs, all balanced | T-8.8 |
| If any JE in stock export is unbalanced, whole import rolls back | T-8.8 |
| Account map editable in settings → next webhook uses new mapping | T-8.14, T-8.4 |
| Doctor commission JE separate from invoice JE | T-8.6 |
| Mock webhook CLI fires test events successfully | T-8.11 |

---

## Final System Smoke Test (Phase 8 sign-off)

After Phase 8 done, run integrated test per spec 11:
- Use T-8.11 / T-8.12 to fire 20+ visit-completed webhooks across branches/methods/items
- Verify Phase 7 reports update accordingly: AR aging stays zero (auto-receipted), revenue rises in P&L, cash position rises, TB stays balanced
- Fire 1 stock export with ~10 entries → JEs appear in GL list with `source_type='STOCK_EXPORT'`; COGS updates in P&L

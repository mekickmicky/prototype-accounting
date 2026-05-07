# Phase 6 — Bank Reconciliation

**Goal:** Import bank transactions (mock), auto-suggest matches to receipts/payments, manually reconcile, verify slips.
**Reads:** specs/01-domain-model.md §BankAccount, BankTransaction; specs/02 §8; specs/04 §6; specs/05 §Bank; specs/07-bank-integration.md (full); specs/11 §Phase 6
**Acceptance:** specs/11-build-phases.md §Phase 6

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-6.1 (Provider interface) ──┬─ T-6.2 (Mock provider) ──┬─ T-6.3 (factory)
                              │                          │
T-6.4 (Bank account svc) ─────┼─ T-6.5 (Bank account API) ─ T-6.10 (Bank account UI)
                              │                                       │
T-6.6 (CSV parser) ─┬─ T-6.7 (Import service + dedup) ─ T-6.8 (Import API) ─ T-6.11 (Import UI)
                    │                                                  │
T-6.9 (Auto-match heuristic) ─ T-6.13 (Reconcile service) ─ T-6.14 (Reconcile API) ─ T-6.12 (Reconcile UI)
                    │
                    └─ T-6.15 (Slip verify API) ─ T-6.16 (Slip verify in Receipt form)
```

## Parallel Lanes

- **Lane A (provider stack):** T-6.1 → T-6.2 → T-6.3
- **Lane B (bank account):** T-6.4 → T-6.5 → T-6.10
- **Lane C (import):** T-6.6 → T-6.7 → T-6.8 → T-6.11
- **Lane D (reconcile, after import + Phase 3/4):** T-6.9 → T-6.13 → T-6.14 → T-6.12
- **Lane E (slip verify, after T-6.3):** T-6.15 → T-6.16

## Cross-Phase Anchors Produced

- `BankProvider` interface — used by Phase 8 webhook (slip verify on visit-completed)
- Reconciled BankTransaction → reflects truth of cash position (referenced by Phase 7 Cash Position report)

---

## Tasks

### T-6.1 — `BankProvider` interface
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/bank/provider.ts` (NEW)
- **Reads:** specs/07 §The Interface
- **Spec:**
  - Export `interface BankProvider` with: `verifySlip`, `importStatement`, `getBalance`, `registerWebhook?`
  - Export types: `VerifySlipInput`, `SlipVerifyResult`, `ImportStatementInput`, `BankTransactionRaw`
  - All money fields use `Decimal`
- **Depends on:** Phase 1
- **Blocks:** T-6.2, T-6.3, T-6.7, T-6.15
- **Done when:** Type-checks; importable

### T-6.2 — `MockBankProvider` implementation
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/lib/bank/mock-provider.ts` (NEW)
- **Reads:** specs/07 §Mock Provider, §Mock txn templates
- **Spec:**
  - Implements `BankProvider` per spec 07
  - `verifySlip`: branches on prefix `MOCK-INVALID` (verified=false), `MOCK-MISMATCH` (verified=true with amount off by 100), default (verified=true with realistic data)
  - `importStatement`: deterministic generator (seeded on bankAccountCode + dateFrom) — skip weekends, 2-5 txns per day, mix from `MOCK_TXN_TEMPLATES` array (customer payments, vendor payments, bank fees, transfers); ranges per template
  - `getBalance`: opening balance 500,000 + sum of generated txns
  - **Determinism:** same inputs → same outputs (use seedrandom or similar so re-import doesn't shift)
- **Depends on:** T-6.1
- **Blocks:** T-6.3
- **Done when:** Calling `importStatement` for May 2026 returns 30–50 txns; same call returns identical list; ratio of CR/DR roughly 60/40 for incoming clinic

### T-6.3 — `getBankProvider` factory
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `apps/api/src/lib/bank/index.ts` (NEW)
- **Reads:** specs/07 §Provider Selection
- **Spec:**
  - `getBankProvider(): BankProvider` — switches on `process.env.BANK_PROVIDER` (`mock` default)
  - Throws on unknown provider
- **Depends on:** T-6.2
- **Blocks:** T-6.7, T-6.15
- **Done when:** Returns MockBankProvider instance; throws "Unknown bank provider" on bad env

### T-6.4 — BankAccountService CRUD
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/services/bank-account.ts` (NEW)
- **Reads:** specs/01 §BankAccount
- **Spec:**
  - CRUD; each BankAccount has `gl_account_code` (which CoA leaf it represents, e.g., `11020`), `bank_name`, `account_no`, `branch`, `currency='THB'`, `opening_balance`, `is_active`
  - `getBalance(id, as_of?)` — sum of posted JournalLines on `gl_account_code` for this branch up to `as_of`
- **Depends on:** T-2.8
- **Blocks:** T-6.5, T-6.7
- **Done when:** Balance for KBank current matches sum of bank-related JE lines

### T-6.5 — `/api/v1/bank-accounts` endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/bank-accounts.ts` (NEW)
- **Reads:** specs/05 §Bank
- **Spec:**
  - `GET /bank-accounts` — list with computed balance
  - `GET /bank-accounts/:id` — detail
  - `GET /bank-accounts/:id/transactions` — paginated, filters: `?reconciled=false&date_from=&date_to=`
  - `POST /bank-accounts` (admin), `PATCH /bank-accounts/:id` (admin)
- **Depends on:** T-6.4
- **Blocks:** T-6.10
- **Done when:** Round-trip; transactions filter works

### T-6.6 — CSV parser (Thai bank format)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/lib/bank/csv-parser.ts` (NEW)
- **Reads:** specs/07 §CSV Format
- **Spec:**
  - `parseBankCSV(csvText: string): BankTransactionRaw[]`
  - Handles `dd/MM/yyyy` dates, comma-separated thousands, optional opening row (skip rows with non-date first column), empty fields for non-applicable side
  - Detects KBank, SCB, BBL header signatures (auto-detect column order)
  - Returns Decimal amounts; defensive parsing throws `INVALID_CSV` with row number
- **Depends on:** Phase 1
- **Blocks:** T-6.7
- **Done when:** Test fixture CSVs (one per bank) parse to expected `BankTransactionRaw[]`; malformed CSV throws with line ref

### T-6.7 — Bank import service (with dedup)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/bank-import.ts` (NEW)
- **Reads:** specs/07 §Idempotency, specs/02 §8.1
- **Spec:**
  - `importStatement(bank_account_id, source: { use_mock?, csv_content?, date_from, date_to }, actor_id): Promise<{ imported: number, skipped: number }>`
  - If `use_mock`: call `getBankProvider().importStatement(...)`
  - If `csv_content`: call `parseBankCSV(csv_content)`
  - For each `BankTransactionRaw`: dedup key = `(bank_account_id, bank_ref)` if bank_ref exists, else hash of `(bank_account_id, txn_date, description, debit, credit)`
  - Upsert into `bank_transactions` with status=UNMATCHED
  - Return `{ imported, skipped }`
  - AuditLog action=IMPORT (custom action) with row count
- **Depends on:** T-6.3, T-6.6, T-6.4
- **Blocks:** T-6.8, T-6.9
- **Done when:** Re-importing same period imports 0 new (all skipped); first import inserts all; AuditLog row exists

### T-6.8 — `/api/v1/bank/import` endpoint
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/bank.ts` (NEW)
- **Reads:** specs/05 §Bank
- **Spec:**
  - `POST /bank/import` — body per spec 05; returns `{ imported, skipped }`
- **Depends on:** T-6.7
- **Blocks:** T-6.11
- **Done when:** Round-trip; mock import returns deterministic count

### T-6.9 — Auto-match heuristic
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/lib/bank/auto-match.ts` (NEW)
- **Reads:** specs/02 §8.2, specs/07 §Reconciliation Heuristic
- **Spec:**
  - `suggestMatches(bank_txn): Promise<MatchSuggestion[]>`
  - Candidates: receipts/payments where `bank_account_id == bank_txn.bank_account_id` AND amount within ±0.01 AND date within ±3 days AND status=POSTED AND not already matched
  - Score: `+0.5` exact amount, `+0.3 - 0.1*daysDiff` proximity (clamp to 0), `+0.2` if description contains counterparty name first word, additional heuristics encouraged but bound to `[0, 1.0]`
  - Sort by confidence desc
  - Thresholds (per spec 07 §Reconciliation): auto-confirm `>= 0.95`, suggest with confirm `0.7..0.95`, candidate `0.4..0.7`, hide `< 0.4`
  - Function returns suggestions; caller decides what to auto-confirm
- **Depends on:** T-3.12, T-4.11, T-6.7
- **Blocks:** T-6.13
- **Done when:** Fixture test: bank txn 1500 CR on 2026-05-08 with 1 receipt 1500 on 2026-05-07 → top suggestion confidence ≥ 0.85

### T-6.13 — BankReconciliationService (match / unmatch / ignore / create JE)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/bank-reconciliation.ts` (NEW)
- **Reads:** specs/02 §8.1, §8.3
- **Spec:**
  - `match(bank_txn_id, document_type: 'RECEIPT'|'PAYMENT', document_id, actor_id, confidence?): void` — sets bank_txn `reconciled_with_id`, `reconciled_with_type`, `reconcile_confidence`, `status=MATCHED`; AuditLog
  - `unmatch(bank_txn_id, actor_id, reason): void` — clears link, status=UNMATCHED
  - `ignore(bank_txn_id, actor_id, reason): void` — status=IGNORED
  - `createJEFromTxn(bank_txn_id, je_input, actor_id): void` — creates DRAFT JE pre-filled (Dr Bank Fee Expense, Cr Cash/Bank), posts it via `JournalEntryService.post`, then matches the resulting JE-derived ad-hoc record back to bank_txn (since this isn't a Receipt/Payment, link via a special source_type='BANK_FEE')
  - `getReconciliationView(account_id): { unmatched_bank_txns, unmatched_documents, suggestions_per_txn }` — composite query
- **Depends on:** T-6.9, T-2.12
- **Blocks:** T-6.14
- **Done when:** All 4 ops + view query work; matching same txn twice returns ALREADY_MATCHED

### T-6.14 — `/api/v1/bank/reconcile|ignore-txn|verify-slip` + view endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/bank.ts` (EDIT)
- **Reads:** specs/05 §Bank
- **Spec:**
  - `GET /bank/reconciliation/:account_id` — view
  - `POST /bank/reconcile` — body per spec 05
  - `POST /bank/unmatch` (body `{ bank_txn_id, reason }`)
  - `POST /bank/ignore-txn`
  - `POST /bank/create-je-from-txn`
- **Depends on:** T-6.13
- **Blocks:** T-6.12
- **Done when:** Round-trip; view returns sorted suggestions per unmatched txn

### T-6.15 — `/api/v1/bank/verify-slip` endpoint
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/bank.ts` (EDIT)
- **Reads:** specs/05 §POST /bank/verify-slip, specs/07 §Slip Verification UX
- **Spec:**
  - `POST /bank/verify-slip` body `{ slip_ref, expected_amount?, expected_date? }`
  - Calls `getBankProvider().verifySlip(...)` and returns result
- **Depends on:** T-6.3
- **Blocks:** T-6.16
- **Done when:** `MOCK-INVALID-XYZ` returns verified=false; `MOCK-MISMATCH-1234` returns verified=true with amount mismatch; other refs return verified=true clean

### T-6.10 — `/bank/accounts` UI
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/bank/accounts/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §6.1
- **Spec:**
  - List: bank_name, account_no (masked), branch, balance, last reconciled date, status
  - Detail: account info + transaction list (paginated, filterable by reconciled state) + "Import" + "Reconcile" buttons
- **Depends on:** T-6.5, T-2.28
- **Blocks:** —
- **Done when:** Lists 3 seeded accounts (Cash, KBank current, KBank ภพ.30); detail shows transactions

### T-6.11 — `/bank/import` UI
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/bank/import/page.tsx` (NEW)
- **Reads:** specs/04 §6, specs/07 §Bank Import UX
- **Spec:** Form per spec 07 mockup:
  - Bank account picker, date range, source radios (Generate mock | Paste CSV | Upload XLSX — XLSX deferred), CSV textarea (if Paste CSV)
  - "Preview" button → modal showing first 10 parsed rows
  - "Import" button → POST `/bank/import`, shows result `{ imported, skipped }`, redirects to reconcile page
- **Depends on:** T-6.8
- **Blocks:** —
- **Done when:** Mock import → preview → import → redirect → reconcile shows newly imported txns

### T-6.12 — `/bank/reconcile/[account_id]` UI (two-pane workspace)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/bank/reconcile/[account_id]/page.tsx`, `apps/web/src/components/bank/reconcile-workspace.tsx` (NEW)
- **Reads:** specs/04 §6.2, wireframes/06-bank-reconcile.html
- **Spec:**
  - Two-pane layout: left = unmatched bank txns; right = unmatched receipts/payments
  - Click bank txn → right panel shows ranked suggestions (badge with confidence %)
  - Click suggestion → confirmation card with side-by-side details → "Confirm match"
  - Manual: select bank txn + select document → "Match selected" button
  - Per-row actions: "Create JE from txn" (opens prefilled JE form modal), "Mark as ignored" (reason prompt)
  - Bottom bar: "Reconciled balance: X | Bank balance: Y | Difference: Z" — Z=0 ✅
  - Filter: hide ignored toggle
- **Depends on:** T-6.14, T-2.28
- **Blocks:** —
- **Done when:** Visually matches wireframe; full reconcile flow works for a full month of mock data

### T-6.16 — Slip verify in Receipt form
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/components/ar/receipt-form.tsx` (EDIT — Phase 3 file)
- **Reads:** specs/07 §Slip Verification UX
- **Spec:**
  - When `payment_method` is TRANSFER or QR: show `slip_ref` input + "Verify slip" button
  - On click: POST `/bank/verify-slip` with `{ slip_ref, expected_amount: total_amount, expected_date: receipt_date }`
  - Display result inline:
    - ✓ Green box if verified and amount/date match
    - ⚠ Yellow box if verified but amount mismatch (allow user to override with note)
    - ✗ Red box if not verified (block submit unless admin override)
- **Depends on:** T-6.15, T-3.21
- **Blocks:** —
- **Done when:** Receipt form with `MOCK-INVALID-` slip blocks submit; clean ref shows green and proceeds

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Can import mock bank transactions for a date range | T-6.7, T-6.11 |
| Can paste CSV; parser handles dd/MM/yyyy and comma thousands | T-6.6 |
| Reconciliation page shows unmatched bank txns and unmatched documents | T-6.13, T-6.12 |
| Auto-suggestions ranked by confidence | T-6.9 |
| Can manually match a bank txn to a Receipt or Payment | T-6.13, T-6.12 |
| Can "Create JE from txn" for unmatched | T-6.13 |
| Can mark a txn as "ignored" | T-6.13 |
| Slip verify in Receipt form works (mock predictable) | T-6.15, T-6.16 |
| Reconciled balance counter at bottom updates correctly | T-6.12 |
| Bank txn dedup: re-importing same period doesn't duplicate | T-6.7 |

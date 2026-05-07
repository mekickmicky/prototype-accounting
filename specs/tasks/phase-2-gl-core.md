# Phase 2 — GL Core

**Goal:** General Ledger works. Users can create JEs, post them, void them, see Trial Balance.
**Reads:** specs/01-domain-model.md, specs/02-business-rules.md, specs/04-modules.md §2 (GL), specs/05-api-contracts.md §GL, specs/06-ui-design-system.md, specs/08-reports.md §Trial Balance, specs/11 §Phase 2
**Acceptance:** specs/11-build-phases.md §Phase 2

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-2.1 (errors) ─┬─ T-2.2 (audit) ─┐
                ├─ T-2.3 (numbering) ──┐
                └─ T-2.4 (period helpers) ──┐
                                              ▼
T-2.8 (Account svc) ──┬─ T-2.9 (JE.createDraft) ──┬─ T-2.12 (JE.post)
                       │                            │      │
                       │                            │      ├─ T-2.13 (JE.void)
                       │                            │      └─ T-2.24 (Trial Balance query)
                       │                            ├─ T-2.10 (JE.update)
                       │                            └─ T-2.11 (JE.delete)
                       │
                       └─ T-2.5 (close-checklist) ─ T-2.6 (closePeriod) ─ T-2.7 (reopen)

API layer (after services): T-2.14, T-2.15, T-2.16, T-2.17, T-2.25
UI layer (parallel after T-2.28): T-2.18, T-2.19, T-2.20, T-2.21, T-2.22, T-2.23, T-2.26, T-2.27, T-2.29
```

## Parallel Lanes

- **Lane A (foundations, sequential):** T-2.1 → T-2.2, T-2.3, T-2.4, T-2.8 (parallel after T-2.1)
- **Lane B (JE service, sequential after Lane A):** T-2.9 → T-2.10/T-2.11 (parallel) → T-2.12 → T-2.13
- **Lane C (period service, after T-2.4 + T-2.12):** T-2.5 → T-2.6 → T-2.7
- **Lane D (API, parallel after Lane B/C):** T-2.14, T-2.15, T-2.16, T-2.17 (Zod can ship earlier)
- **Lane E (UI primitives, parallel after Phase 1):** T-2.28
- **Lane F (UI pages, parallel after Lane D + T-2.28):** T-2.18, T-2.19, T-2.20, T-2.21, T-2.22, T-2.23, T-2.29
- **Lane G (Trial Balance, after T-2.12):** T-2.24 → T-2.25 → T-2.26 → T-2.27

## Cross-Phase Anchors Produced

- `JournalEntryService.post` — blocks every posting in phases 3–8
- `JournalEntryService.void` — blocks every void in phases 3–8
- `PeriodService.assertOpen` — blocks every posting in phases 3–8
- `DocumentNumberingService.next` — blocks every doc creation in phases 3–8
- `AuditLogService.log` — used by every state-changing op in phases 2–8
- `lib/reports/trial-balance.ts` — referenced by Phase 7 Balance Sheet for cross-check

---

## Tasks

### T-2.1 — Error system (BusinessRuleError + envelope mapper)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/errors.ts`, `apps/api/src/middleware/error-handler.ts` (NEW)
- **Reads:** specs/02 §10, specs/05 §Common Error Codes
- **Spec:**
  - `class BusinessRuleError extends Error { code: string; httpStatus: number; context?: object }`
  - All 16 codes from spec 05 §Common Error Codes pre-typed as `ErrorCode` union
  - Elysia `onError` handler: maps `BusinessRuleError` → `{ success: false, error: { code, message, context } }` with correct HTTP status; wraps unknown errors as `INTERNAL_ERROR` (500), never leaks Prisma errors
  - i18n message map: `getThaiMessage(code, context): string` (lookup table; falls back to English)
- **Depends on:** Phase 1
- **Blocks:** T-2.2, T-2.3, T-2.5, T-2.9, T-2.12, T-2.13, every API endpoint
- **Done when:** Throwing `new BusinessRuleError('PERIOD_NOT_OPEN', { period_code: '2026-04' })` returns 409 with Thai message

### T-2.2 — AuditLog service
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/audit-log.ts` (NEW)
- **Reads:** specs/02 §11
- **Spec:**
  - `logAuditEvent(tx, { actor_id, action, entity_type, entity_id, before?, after?, reason? })`
  - `action` enum: `CREATE | UPDATE | POST | VOID | DELETE | PERIOD_CLOSE | PERIOD_REOPEN | LOGIN | EXPORT`
  - Snapshots: `before_json` / `after_json` truncated to 50KB
  - Always called inside the same transaction as the change
- **Depends on:** T-2.1
- **Blocks:** T-2.6, T-2.7, T-2.12, T-2.13, every state-change op in phases 3–8
- **Done when:** Posting a JE creates one AuditLog row with action=POST, before=null, after=full JE

### T-2.3 — DocumentNumberingService (atomic, FOR UPDATE)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/numbering.ts` (NEW)
- **Reads:** specs/02 §3
- **Spec:**
  - `nextDocNo(tx: PrismaTx, prefix: DocPrefix, year: number, table: string, column: string): Promise<string>`
  - Uses raw SQL with `FOR UPDATE` lock on rows matching `WHERE column LIKE '{prefix}-{year}-%'`
  - Returns `{prefix}-{year}-{NNNN}` (zero-padded to 4)
  - Must run inside an existing transaction (throws if not)
  - Map of supported prefixes from spec 02 §3 table (JE, INV, TAX, RCT, BILL, PAY, PP30, PND3, PND53, WHT, CUST, VEND)
  - Voids do NOT release numbers (no recycling logic)
- **Depends on:** T-2.1
- **Blocks:** T-2.12 (JE.post), every doc creation in phases 3–8
- **Done when:** Concurrent test (10 parallel `nextDocNo` calls in same tx scope but separate transactions) produces no duplicates; sequence is `JE-2026-0001` ... `JE-2026-0010`

### T-2.4 — Period helpers (deriveCode, ensureExists, getStatus)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/period.ts` (NEW — base)
- **Reads:** specs/02 §2
- **Spec:**
  - `derivePeriodCode(date: Date): string` — formats `YYYY-MM` in Asia/Bangkok TZ
  - `getPeriod(tx, code): Promise<FiscalPeriod | null>`
  - `assertOpen(tx, code): void` — throws `PERIOD_NOT_FOUND` or `PERIOD_NOT_OPEN`
  - `ensurePeriodExists(tx, code): Promise<FiscalPeriod>` — auto-create as OPEN if missing (covers the spec 02 §2.5 auto-create requirement)
- **Depends on:** T-2.1
- **Blocks:** T-2.5, T-2.12, every posting in phases 3–8
- **Done when:** Unit tests: `derivePeriodCode(new Date('2026-05-31T17:30:00Z')) === '2026-06'` (TZ shift); `assertOpen` throws on CLOSED period

### T-2.5 — Period close checklist
- [x] **Status:** Done (2026-05-08)
- **Model:** Opus
- **Files:** `apps/api/src/services/period.ts` (EDIT)
- **Reads:** specs/02 §2.2
- **Spec:**
  - `closeChecklist(period_code): Promise<ChecklistItem[]>`
  - Returns 5 items per spec 02 §2.2:
    1. `no_draft_jes` — count JEs WHERE period_code AND status='DRAFT'
    2. `bank_reconciled` — count BankTransactions in period WHERE status='UNMATCHED' (Phase 6 may stub this to true if BankTxn table empty)
    3. `vat_filing_finalized` — TaxFiling exists with type=PP30, period_code, status IN (FINALIZED, SUBMITTED)
    4. `aging_reviewed` — soft, just `{ status: 'manual', confirmed_by_user: false }`
    5. `closing_entries_posted` — only for last period of fiscal year (`-12`); checks for `source_type='ADJUSTMENT' AND description LIKE 'YEAR_END_CLOSE %'`
  - Each item: `{ id, label_th, status: 'pass'|'fail'|'manual', count?, link? }`
- **Depends on:** T-2.4
- **Blocks:** T-2.6, T-2.15
- **Done when:** Unit test with seeded period containing 2 DRAFT JEs returns checklist with `no_draft_jes.status='fail', count=2`

### T-2.6 — Period close + closing entries
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/period.ts` (EDIT)
- **Reads:** specs/02 §2.3, §12.3
- **Spec:**
  - `closePeriod(period_code, actor_id): Promise<void>`
  - Inside `prisma.$transaction` with row lock on the FiscalPeriod
  - Run `closeChecklist`; throw `PERIOD_CLOSE_BLOCKED` with details if any non-manual item fails
  - If period is `-12` (year-end): generate closing entries auto-posted via `JournalEntryService.post`:
    - Close revenue accounts (4xxxx with credit balance) → 31030 Current year earnings
    - Close expense accounts (5xxxx, 6xxxx with debit balance) → 31030
    - Close 31030 → 31020 Retained earnings
    - All as separate JEs with `source_type='ADJUSTMENT'`, description `YEAR_END_CLOSE {year}`
  - Transition status OPEN → CLOSED, set `closed_at`, `closed_by_id`
  - Emit AuditLog with action=PERIOD_CLOSE
- **Depends on:** T-2.5, T-2.12, T-2.2
- **Blocks:** T-2.7, T-2.15
- **Done when:** Closing 2026-12 with seeded P&L data: 3 closing JEs auto-posted; period status=CLOSED; subsequent post into 2026-12 returns PERIOD_NOT_OPEN

### T-2.7 — Period reopen (admin only)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/period.ts` (EDIT)
- **Reads:** specs/02 §2.4
- **Spec:**
  - `reopenPeriod(period_code, actor_id, reason): Promise<void>`
  - Throws `FORBIDDEN` if actor role != ADMIN (caller enforces; service can also assert)
  - Throws `PERIOD_LOCKED` if status=LOCKED
  - If reopening December year-end: void all `YEAR_END_CLOSE {year}` JEs first (call `JournalEntryService.void` on each)
  - Transition CLOSED → OPEN
  - Emit AuditLog action=PERIOD_REOPEN with reason
- **Depends on:** T-2.6, T-2.13
- **Blocks:** T-2.15
- **Done when:** Reopening 2026-12 voids the 3 closing JEs and sets period back to OPEN; AuditLog row exists with reason

### T-2.8 — Account service (CRUD + balance compute)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/account.ts` (NEW)
- **Reads:** specs/01 §Account, specs/04 §2.2, specs/05 §Accounts
- **Spec:**
  - `listAccounts(filters): Promise<AccountWithBalance[]>` — joins computed balance for current period
  - `getAccount(code)`, `createAccount(input)` (admin), `updateAccount(code, input)` (admin — only `name_en`, `name_th`, `is_active`)
  - Soft-delete: prevent delete if account has any JournalLine; otherwise set `deleted_at`
  - `assertPostable(tx, code): Account` — throws `ACCOUNT_NOT_FOUND`, `ACCOUNT_NOT_POSTABLE`, or `ACCOUNT_INACTIVE`
- **Depends on:** T-2.1
- **Blocks:** T-2.9, T-2.14
- **Done when:** Listing returns CoA with computed `current_balance`; `assertPostable('11000')` (header) throws `ACCOUNT_NOT_POSTABLE`

### T-2.9 — JournalEntryService.createDraft + validate
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/journal-entry.ts` (NEW)
- **Reads:** specs/02 §1, §13
- **Spec:**
  - `createDraft(tx, input, actor_id): Promise<JournalEntry>`
  - Input shape per spec 05 POST `/journal-entries`
  - Validates: ≥2 lines (spec 02 §1.3); each line has xor(debit, credit) > 0 (§1.2); SUM(debit).eq(SUM(credit)) (§1.1); each `account_code` passes `assertPostable` (§1.4); each line's `branch_code` defaults to header (§7)
  - Saves status=DRAFT, no `je_no` yet, `total_debit`/`total_credit` computed
  - All money operations through Decimal helpers from T-1.5
- **Depends on:** T-2.8
- **Blocks:** T-2.10, T-2.12
- **Done when:** Create draft with unbalanced lines throws `JE_NOT_BALANCED`; with header account throws `ACCOUNT_NOT_POSTABLE`; balanced 2-line draft persists

### T-2.10 — JournalEntryService.update (DRAFT only)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/journal-entry.ts` (EDIT)
- **Reads:** specs/02 §5.1, §12.1
- **Spec:**
  - `update(tx, id, input, actor_id, ifMatchUpdatedAt): Promise<JournalEntry>`
  - Throws `JE_NOT_DRAFT` (409) if status != DRAFT
  - Throws `STALE_RECORD` if `ifMatchUpdatedAt` doesn't match current
  - Replaces lines wholesale (delete + insert); rerun all `createDraft` validations
  - AuditLog action=UPDATE with before/after snapshots
- **Depends on:** T-2.9, T-2.2
- **Blocks:** T-2.16
- **Done when:** Updating posted JE returns 409; updating with stale `updated_at` returns 409 STALE_RECORD; valid update succeeds and logs

### T-2.11 — JournalEntryService.delete (DRAFT only)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/services/journal-entry.ts` (EDIT)
- **Reads:** specs/02 §5.1
- **Spec:**
  - `deleteDraft(tx, id, actor_id): Promise<void>`
  - Throws `JE_NOT_DRAFT` if not DRAFT
  - Cascade-delete lines, then JE
  - AuditLog action=DELETE with before snapshot
- **Depends on:** T-2.9
- **Blocks:** T-2.16
- **Done when:** Delete posted JE returns 409; delete draft removes JE + lines + audit row exists

### T-2.12 — JournalEntryService.post
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/journal-entry.ts` (EDIT)
- **Reads:** specs/02 §1, §2.1, §3
- **Spec:**
  - `post(je_id, actor_id): Promise<JournalEntry>` — wraps in `prisma.$transaction`
  - Re-validate balance + account postability + line xor (defense in depth — DRAFT could have been mutated)
  - Derive `period_code` from `entry_date`; `assertOpen` (throws PERIOD_NOT_OPEN)
  - Generate `je_no` via `nextDocNo('JE', year, ...)` — atomic
  - Set status=POSTED, `posted_at`, `posted_by_id`
  - AuditLog action=POST
  - Return full JE with lines
- **Depends on:** T-2.9, T-2.3, T-2.4, T-2.2
- **Blocks:** T-2.13, T-2.6, T-2.16, T-2.24, every posting in phases 3–8
- **Done when:** Post succeeds → status=POSTED, je_no assigned, audit row created; concurrent post of 5 JEs in same year produces sequential numbers

### T-2.13 — JournalEntryService.void (reversal)
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/services/journal-entry.ts` (EDIT)
- **Reads:** specs/02 §5.2, §5.4
- **Spec:**
  - `void(je_id, actor_id, reason): Promise<{ original, reversal }>`
  - Throws `JE_NOT_POSTED` if status != POSTED, `ALREADY_VOIDED` if already voided
  - Derives the original's `period_code`; if status=CLOSED throws `PERIOD_NOT_OPEN` (per §5.4)
  - Creates reversing JE: same `entry_date`, same lines but debit↔credit swapped, `source_type='REVERSAL'`, description prefixed `VOID of {original.je_no}: {reason}`
  - Posts the reversing JE via internal `post` (gets new `je_no`, status=POSTED)
  - Updates original: status=VOID, `voided_at`, `voided_by_id`, `void_reason`, `reversed_by_id=newJE.id`
  - Sets newJE.`reversal_of_id=original.id`
  - AuditLog action=VOID on original with `after_json` showing the link
- **Depends on:** T-2.12
- **Blocks:** T-2.7, T-2.16, every void in phases 3–8
- **Done when:** Voiding a posted JE produces a second POSTED JE that exactly reverses it (TB unaffected); both linked bidirectionally; voiding twice returns ALREADY_VOIDED

### T-2.14 — `/api/v1/accounts` endpoints
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/accounts.ts` (NEW)
- **Reads:** specs/05 §GL: Accounts
- **Spec:**
  - `GET /accounts` (?type, ?active, ?parent_code) — auth required
  - `POST /accounts` (admin) — Zod schema per spec 05
  - `GET /accounts/:code` — returns account + parent chain + recent 20 transactions
  - `PATCH /accounts/:code` (admin)
  - All wrapped in response envelope; uses `accountService`
- **Depends on:** T-2.8, T-2.17, T-2.1
- **Blocks:** T-2.18, T-2.19
- **Done when:** Postman/curl tests for all 4 endpoints pass; non-admin POST returns 403

### T-2.15 — `/api/v1/periods` endpoints
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/periods.ts` (NEW)
- **Reads:** specs/05 §GL: Periods
- **Spec:**
  - `GET /periods` — list with status, JE count, blocking issues
  - `GET /periods/:code/close-checklist`
  - `POST /periods/:code/close` (body `{ confirm: true }`) — runs checklist, errors 409 with full checklist if blocked
  - `POST /periods/:code/reopen` (admin) (body `{ reason: min 10 chars }`)
- **Depends on:** T-2.5, T-2.6, T-2.7, T-2.17
- **Blocks:** T-2.23
- **Done when:** Close on a period with draft JE returns 409 with `checklist` array; admin reopen succeeds; non-admin reopen returns 403

### T-2.16 — `/api/v1/journal-entries` endpoints
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/journal-entries.ts` (NEW)
- **Reads:** specs/05 §GL: Journal Entries
- **Spec:**
  - `GET /journal-entries` (paginated, filters: period, branch, status, source_type, q, date range, account)
  - `GET /journal-entries/:id` — full with lines
  - `POST /journal-entries` (DRAFT)
  - `PATCH /journal-entries/:id` (DRAFT only)
  - `POST /journal-entries/:id/post`
  - `POST /journal-entries/:id/void` (body `{ reason: min 3 }`)
  - `DELETE /journal-entries/:id` (DRAFT only)
- **Depends on:** T-2.9, T-2.10, T-2.11, T-2.12, T-2.13, T-2.17
- **Blocks:** T-2.20, T-2.21, T-2.22
- **Done when:** All 7 endpoints round-trip; `q` searches description + je_no + source_ref; pagination meta correct

### T-2.17 — Zod validators (shared schemas package)
- [x] **Status:** Done (2026-05-07)
- **Model:** DeepSeek
- **Files:** `packages/shared/src/schemas/gl.ts`, `packages/shared/src/schemas/common.ts` (NEW)
- **Reads:** specs/05 (all GL request shapes)
- **Spec:**
  - Translate every Zod block from spec 05 §GL verbatim
  - Common: `MoneyString` (regex `^\d+(\.\d{1,2})?$`), `PeriodCode` (`^\d{4}-\d{2}$`), `BranchCode` (enum from settings)
  - Both API and web import from `@wind-acc/shared`
- **Depends on:** T-1.1
- **Blocks:** T-2.14, T-2.15, T-2.16
- **Done when:** Importable from web; invalid input rejected at API boundary with `VALIDATION_ERROR` 400

### T-2.18 — `/gl/accounts` page (CoA tree)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/accounts/page.tsx`, `apps/web/src/components/gl/account-tree.tsx` (NEW)
- **Reads:** specs/04 §2.2, wireframes/_styles.css for tree styling
- **Spec:**
  - Tree view, expandable per account `parent_code`
  - Each row: code, name_th, name_en (subtle), type badge, current_balance (right-aligned, `<MoneyDisplay>`)
  - Inline edit (admin): name_th, is_active toggle
  - "+ New Account" button (admin) opens modal
  - Click row → navigate to detail
- **Depends on:** T-2.14, T-2.28
- **Blocks:** —
- **Done when:** Renders ~80–120 accounts in tree; collapse/expand persists in URL hash; admin can toggle active

### T-2.19 — `/gl/accounts/[code]` detail page
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/accounts/[code]/page.tsx` (NEW)
- **Reads:** specs/04 §2.2, specs/08 §General Ledger detail (preview only — full version in Phase 7)
- **Spec:**
  - Header: code, name, type, parent chain breadcrumb, current balance
  - Period selector + branch filter
  - Transaction list: date, JE no (link to JE detail), description, debit, credit, running balance
  - Empty state if no transactions
- **Depends on:** T-2.14, T-2.16
- **Blocks:** —
- **Done when:** Picking 11020 (KBank current) shows posted receipt JEs; running balance ties out

### T-2.20 — `/gl/journal-entries` list page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/journal-entries/page.tsx` (NEW)
- **Reads:** specs/04 §2.3
- **Spec:**
  - `<DataTable>` with columns: JE No (link), Date, Description, Source, Branch, Total Dr, Total Cr, Status badge, Posted By
  - Filter bar: period (default current), branch (default all), status (default POSTED+DRAFT, exclude VOID), source type, date range, account, free text q
  - Bulk actions: Export CSV, Print
  - "+ New JE" button → `/gl/journal-entries/new`
- **Depends on:** T-2.16, T-2.28
- **Blocks:** —
- **Done when:** All filters compose; URL state persists filters; pagination works

### T-2.21 — `/gl/journal-entries/new` form page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/journal-entries/new/page.tsx`, `apps/web/src/components/gl/je-form.tsx` (NEW)
- **Reads:** specs/04 §2.4
- **Spec:**
  - Header: entry_date (default today), branch (default user's), description, source_type (default MANUAL)
  - Lines table: line no, account picker, description, branch (default header), debit money input, credit money input, dimensions collapsible
  - Add row / remove row controls
  - Live total Dr / Total Cr / Difference (red if ≠ 0)
  - "Save Draft" + "Post" buttons; Post disabled if difference ≠ 0 or any validation fails
  - Frontend validates xor(debit, credit) per line, ≥2 lines, all account_codes resolved
  - On Post: warn if period closed (call `/periods/{code}` first); on success → redirect to detail
- **Depends on:** T-2.16, T-2.28, T-2.7 (uses MoneyInput + AccountPicker)
- **Blocks:** T-2.22 (shared `<JEForm>` component)
- **Done when:** Cannot post unbalanced JE; balanced 2-line JE posts and redirects to `/gl/journal-entries/{new-id}`

### T-2.22 — `/gl/journal-entries/[id]` view/edit page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/journal-entries/[id]/page.tsx` (NEW)
- **Reads:** specs/04 §2.4, specs/02 §5.2
- **Spec:**
  - DRAFT → reuse `<JEForm>` (T-2.21) prefilled, Save/Post/Delete buttons
  - POSTED → read-only display, "Void" button (opens dialog requiring reason)
  - VOID → read-only with banner "Voided on {date} by {user}: {reason}", link to reversal JE
  - REVERSAL JE → read-only with banner "Reverses {original.je_no}", link to original
- **Depends on:** T-2.16, T-2.21
- **Blocks:** —
- **Done when:** State transitions reflected in UI; void from UI produces correct cross-links

### T-2.23 — `/gl/periods` page + close checklist modal
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/periods/page.tsx`, `apps/web/src/components/gl/close-checklist-modal.tsx` (NEW)
- **Reads:** specs/04 §2.5, specs/02 §2.2
- **Spec:**
  - Period list: code, date range, status badge, days until close, posted JE count, action buttons (Close / Reopen if admin)
  - Close button → modal with checklist items: each shows pass/fail with link to fix
  - Manual checkboxes for `aging_reviewed`
  - "Close" disabled until all non-manual items pass + manual items confirmed
  - Admin Reopen → reason input modal
- **Depends on:** T-2.15
- **Blocks:** —
- **Done when:** Closing 2026-04 with 1 draft JE shows checklist with fail; clicking link navigates to draft list filtered to that period; closing succeeds after fix

### T-2.24 — Trial Balance query
- [x] **Status:** Done (2026-05-07)
- **Model:** Opus
- **Files:** `apps/api/src/lib/reports/trial-balance.ts` (NEW)
- **Reads:** specs/08 §Trial Balance
- **Spec:**
  - `trialBalance({ as_of: Date, branch?: BranchCode | 'ALL' }): Promise<TBRow[]>`
  - `TBRow = { account_code, name_th, name_en, type, debit_total, credit_total, balance }` plus grand totals
  - Aggregation: SUM(jl.debit), SUM(jl.credit) per account, filtered by `je.entry_date <= as_of AND je.status='POSTED'`, optionally `jl.branch_code = branch`
  - Excludes header (non-postable) accounts but rolls them up in a separate `groupedByType` view if requested
  - **Invariant:** SUM(debit_total) === SUM(credit_total) — if not, return `imbalance: Decimal` field (UI shows red banner)
  - All math in Decimal; never round mid-calc
- **Depends on:** T-2.12
- **Blocks:** T-2.25, Phase 7 cross-check
- **Done when:** Unit test with seeded posted JEs returns balanced totals; voided JEs are excluded by `status=POSTED` (the reversal JE itself is POSTED so the net effect cancels)

### T-2.25 — `/api/v1/reports/trial-balance` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts` (NEW)
- **Reads:** specs/05 §Reports
- **Spec:**
  - `GET /reports/trial-balance?as_of=YYYY-MM-DD&branch=TL|EK|RAMA9|ALL&format=json|csv|xlsx|pdf`
  - JSON returns full structure
  - CSV/XLSX/PDF: stream with appropriate `Content-Type` and `Content-Disposition: attachment; filename="trial-balance-{as_of}.{ext}"`
  - PDF rendered via @react-pdf/renderer (template lives in `apps/api/src/pdf/trial-balance.tsx`)
- **Depends on:** T-2.24
- **Blocks:** T-2.26, T-2.27
- **Done when:** All 4 formats return 200; CSV opens in Excel without mojibake (UTF-8 BOM); PDF includes header, totals, page numbers

### T-2.26 — `/reports/trial-balance` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/trial-balance/page.tsx` (NEW)
- **Reads:** specs/06 §Report layouts, specs/08 §Trial Balance
- **Spec:**
  - Filter bar: as-of date (default today), branch picker, "Run" button
  - Table: account_code, name_th, type group, debit_total, credit_total, balance (right-aligned, tabular nums)
  - Section headers per type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)
  - Grand totals at bottom; **red banner** if imbalance ≠ 0
  - Click account row → navigate to `/gl/accounts/{code}` filtered to date range
  - Export buttons (PDF/CSV/XLSX) at top
- **Depends on:** T-2.25, T-2.28
- **Blocks:** —
- **Done when:** Visually matches wireframes/03-trial-balance.html; exports work; click drilldown navigates correctly

### T-2.27 — TB exports (CSV + XLSX + PDF templates)
- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/exports/csv.ts`, `xlsx.ts`, `apps/api/src/pdf/trial-balance.tsx` (NEW)
- **Reads:** specs/08 §Export formats, specs/06 §Money formatting
- **Spec:**
  - CSV: UTF-8 with BOM, comma-separated, quote-escape; columns match table view; numeric fields unquoted
  - XLSX: `exceljs` library; bold header row; money columns formatted `#,##0.00;(#,##0.00);"—"`
  - PDF: A4 portrait, Sarabun font, header with company name + report title + as-of, footer with page X of Y; section grouping by type
- **Depends on:** T-2.25
- **Blocks:** —
- **Done when:** All three formats open cleanly; numbers tie out vs JSON response

### T-2.28 — GL UI primitives (AccountPicker, BranchPicker, PeriodPicker, DatePicker)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/components/ui/account-picker.tsx`, `branch-picker.tsx`, `period-picker.tsx`, `date-picker-th.tsx` (NEW)
- **Reads:** specs/04 §Component Inventory, specs/06 §Date display (Buddhist Era)
- **Spec:**
  - `<AccountPicker>` — combobox, searches by code AND name (Thai/English), filters to `is_postable && is_active`, shows code + name in dropdown
  - `<BranchPicker>` — select TL / EK / RAMA9 (from `/settings/company`), with "All" option
  - `<PeriodPicker>` — select `YYYY-MM`, list seeded periods, status badge
  - `<DatePickerTH>` — wraps shadcn date picker, displays Buddhist Era (พ.ศ. = year + 543) but stores Gregorian ISO
- **Depends on:** T-1.7
- **Blocks:** T-2.18, T-2.19, T-2.20, T-2.21, T-2.22, T-2.23, T-2.26, T-2.29, every form in phases 3–8
- **Done when:** All four mount in `/dev/components` demo with sample data; AccountPicker filters as user types

### T-2.29 — GL Dashboard page (`/gl/dashboard`)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/gl/dashboard/page.tsx` (NEW)
- **Reads:** specs/04 §2.1, wireframes/01-dashboard.html
- **Spec:**
  - 4 cards: current period, pending DRAFT JE count (link to filtered list), TB balance check (✅ balanced or ❌ off by X), this period's posting count
  - "Recent JEs" table (5 most recent posted)
  - Quick actions: New JE, View TB, Close Period
- **Depends on:** T-2.16, T-2.24, T-2.28
- **Blocks:** —
- **Done when:** Dashboard renders with real numbers from seeded data; pending count links to filter

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Can view full Chart of Accounts as a tree | T-2.18 |
| Can create a draft JE with multiple lines, save, and edit | T-2.21, T-2.22 |
| Cannot save a JE where Dr ≠ Cr | T-2.9 (backend), T-2.21 (frontend) |
| Can post a draft JE → status = POSTED, je_no assigned, audit log entry | T-2.12, T-2.2 |
| Cannot edit a posted JE | T-2.10, T-2.22 |
| Can void a posted JE → reversal JE created, both linked, both POSTED | T-2.13 |
| Cannot post into a CLOSED period | T-2.4, T-2.12 |
| Trial Balance shows accounts with debit_total, credit_total, balance | T-2.24, T-2.26 |
| Trial Balance grand totals equal (or red banner) | T-2.24, T-2.26 |
| Can close a period if checklist passes | T-2.5, T-2.6, T-2.23 |
| Cannot reopen as ACCOUNTANT, can as ADMIN | T-2.7, T-2.15 |
| Money formatting matches spec 06 | T-1.5, T-1.7, T-2.27 |

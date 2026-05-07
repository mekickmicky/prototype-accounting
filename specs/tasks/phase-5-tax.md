# Phase 5 — Tax Filings

**Goal:** Generate ภพ.30 and ภงด.3/53 from accumulated VatRegister + WithholdingRecord, with state machine and closing JEs.
**Reads:** specs/03-thai-tax.md (full), specs/04-modules.md §5 (Tax), specs/05-api-contracts.md §Tax, specs/02 §4.7–4.8, specs/11 §Phase 5
**Acceptance:** specs/11-build-phases.md §Phase 5

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-5.13 (Zod) ─┐
              ├─ T-5.5 (PP30 API) ─ T-5.10 (PP30 UI)
T-5.1 (PP30 aggregator) ─┬─ T-5.2 (PP30 service) ─┘                  │
                          │                                            │
T-5.3 (PP30 closing JE) ─┘                                            ├─ T-5.14 (Tax dashboard)
                                                                       │
T-5.4 (PND3/53 aggregator) ─ T-5.6 (PND service) ─ T-5.7 (PND API) ─ T-5.11 (PND3 UI) + T-5.12 (PND53 UI)
                                                                       │
T-5.8 (PP30 PDF) ─┐                                                    │
T-5.9 (PND PDF) ─┴─ rendered by API endpoints                          │
                                                                       │
T-4.19 (WHT cert PDF, Phase 4) ─ T-5.15 (cert browser)                 │
```

## Parallel Lanes

- **Lane A (PP30 service stack):** T-5.1 → T-5.2 → T-5.3 → T-5.5 → T-5.10
- **Lane B (PND service stack, parallel after Phase 4):** T-5.4 → T-5.6 → T-5.7 → T-5.11/.12 (parallel)
- **Lane C (PDFs, parallel):** T-5.8, T-5.9
- **Lane D (UI polish):** T-5.14, T-5.15

## Cross-Phase Anchors Produced

- PP30 finalize/submit closes VAT Payable + VAT Receivable balances (used by Phase 7 Balance Sheet integrity check)
- PND3/PND53 closing JE clears WHT Payable
- Tax filing state machine — referenced by Phase 2 period close checklist (`vat_filing_finalized`)

---

## Tasks

### T-5.1 — PP30 aggregator (VatRegister query)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/lib/tax/pp30-aggregate.ts` (NEW)
- **Reads:** specs/03 §4.2, specs/01 §VatRegister
- **Spec:**
  - `aggregatePP30(period_code): Promise<{ output_vat, input_vat, vat_payable, output_rows[], input_rows[], non_claimable_rows[] }>`
  - Output VAT: SUM(VatRegister.vat_amount) WHERE vat_type=OUTPUT, period_code, NOT linked to a non-DRAFT TaxFiling AND not from a voided invoice (i.e., no reversal_of_id)
  - Input VAT: SUM WHERE vat_type=INPUT, period_code, claimable=true, AND not from voided bill
  - Returns rows for preview + non_claimable for visibility (user can re-flag)
  - All Decimal
- **Depends on:** T-3.7 (VatRegister OUTPUT exists), T-4.7 (VatRegister INPUT exists)
- **Blocks:** T-5.2, T-5.5
- **Done when:** Unit test with seeded month: aggregate matches manual SUM on register; voided invoice's reversal pair nets to zero

### T-5.2 — TaxFilingService (PP30 lifecycle)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/tax-filing.ts` (NEW)
- **Reads:** specs/04 §5.2, specs/02 §4.7
- **Spec:**
  - `createDraftPP30(period_code, actor_id): TaxFiling` — generates filing_no via `nextDocNo('PP30', year, ...)`, persists with status=DRAFT, snapshots aggregate
  - `flagNonClaimable(filing_id, vat_register_ids[]): void` — only on DRAFT
  - `finalizePP30(filing_id, actor_id): TaxFiling` — DRAFT → FINALIZED; locks VatRegister rows by setting `tax_filing_id` (so subsequent aggregations exclude them); throws PP30_NOT_DRAFT
  - `submitPP30(filing_id, { submission_date, submission_ref }, actor_id): TaxFiling` — FINALIZED → SUBMITTED; calls T-5.3 to post closing JE; throws PP30_NOT_FINALIZED
  - State machine: DRAFT → FINALIZED → SUBMITTED. No edits after FINALIZED. Voided filings = separate state (out of scope for prototype but reserve VOID enum)
  - AuditLog every transition
- **Depends on:** T-5.1, T-2.3, T-2.2
- **Blocks:** T-5.3, T-5.5
- **Done when:** State machine enforced; finalized filing locks register rows (re-running aggregate excludes them)

### T-5.3 — PP30 closing JE (auto-post on submit)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/tax-filing.ts` (EDIT — submit method calls this)
- **Reads:** specs/02 §4.7, specs/03 §4.4
- **Spec:**
  - On `submitPP30`, post JE via `JournalEntryService.post`:
    - Dr VAT Payable (21110) `output_vat` (clears running balance)
    - Cr VAT Receivable (14010) `input_vat` (clears running balance)
    - If `vat_payable > 0`: Cr Cash/Bank (11020 — KBANK ภพ.30) `vat_payable`
    - If `vat_payable < 0` (refund): Dr VAT Refundable (14020) `|vat_payable|` instead
  - source_type='ADJUSTMENT', description `PP30 ${period_code} submission`, source_id=filing_id
  - Link je_id back to filing
- **Depends on:** T-5.2, T-2.12
- **Blocks:** T-5.5
- **Done when:** Submit posts closing JE; subsequent TB shows VAT Payable + VAT Receivable both zeroed for the period

### T-5.4 — PND3/PND53 aggregator (WithholdingRecord query)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/lib/tax/pnd-aggregate.ts` (NEW)
- **Reads:** specs/03 §5.5, §5.6
- **Spec:**
  - `aggregatePND(period_code, vendor_type: 'INDIVIDUAL'|'JURISTIC'): Promise<{ total_wht, rows[] }>`
  - Rows: per WithholdingRecord WHERE period_code AND vendor.vendor_type matches AND status != VOID AND not linked to a finalized PND filing
  - Each row: vendor_id, vendor_name, tax_id, wht_type, gross_amount, wht_amount, cert_no, payment_date
  - Group by vendor (one section per vendor with multiple lines if multiple payments)
- **Depends on:** T-4.11
- **Blocks:** T-5.6
- **Done when:** PND3 query returns only INDIVIDUAL vendor records; PND53 only JURISTIC

### T-5.6 — TaxFilingService (PND3/PND53 lifecycle)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/tax-filing.ts` (EDIT)
- **Reads:** specs/03 §5.6, specs/02 §4.8
- **Spec:**
  - `createDraftPND(period_code, type: 'PND3'|'PND53', actor_id)` — generate filing_no with respective prefix
  - `finalizePND(filing_id, actor_id)` — locks WithholdingRecord rows by setting `tax_filing_id`
  - `submitPND(filing_id, { submission_date, submission_ref }, actor_id)` — posts closing JE per spec 02 §4.8: Dr WHT Payable (21120) `total`, Cr Cash/Bank (11020) `total`
  - State machine identical to PP30
- **Depends on:** T-5.4, T-5.2 (shares state-machine helpers), T-2.12
- **Blocks:** T-5.7
- **Done when:** Two filings can coexist for same period (PND3 + PND53); each clears its slice of WHT Payable

### T-5.5 — `/api/v1/tax-filings` PP30 endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/tax-filings.ts` (NEW)
- **Reads:** specs/05 §Tax: Filings
- **Spec:**
  - `GET /tax-filings` (?type, ?period)
  - `POST /tax-filings/pp30/preview` (body `{ period }`) — returns aggregate without persisting
  - `POST /tax-filings/pp30` (body `{ period }`) — creates DRAFT
  - `GET /tax-filings/:id`
  - `POST /tax-filings/:id/flag-non-claimable` (body `{ vat_register_ids: [] }`)
  - `POST /tax-filings/:id/finalize`
  - `POST /tax-filings/:id/submit` (body `{ submission_date, submission_ref }`)
  - `GET /tax-filings/:id/pdf`
- **Depends on:** T-5.1, T-5.2, T-5.3, T-5.13
- **Blocks:** T-5.10
- **Done when:** Full lifecycle round-trip: preview → create → finalize → submit; pdf endpoint returns binary

### T-5.7 — `/api/v1/tax-filings` PND endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/tax-filings.ts` (EDIT)
- **Reads:** specs/05 §Tax: Filings
- **Spec:**
  - `POST /tax-filings/pnd3/preview` and `/pnd3`
  - `POST /tax-filings/pnd53/preview` and `/pnd53`
  - Same finalize/submit/pdf pattern as PP30 (shared endpoints by filing_id)
- **Depends on:** T-5.4, T-5.6, T-5.13
- **Blocks:** T-5.11, T-5.12
- **Done when:** Round-trip for both PND3 and PND53

### T-5.8 — PP30 PDF generator
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/pp30.tsx` (NEW)
- **Reads:** specs/03 §4.5
- **Spec:**
  - PDF layout per spec 03 §4.5: company info + tax_id + branch_office, filing period in Buddhist Era, Section 1 (output VAT), Section 2 (input VAT), Section 3 (payable/refundable), Section 4 (carry-forward credit)
  - Attachment: list of tax invoices issued (output rows) + received (input rows) — separate pages
  - A4 portrait, Sarabun font
  - Authorized signatory line
- **Depends on:** T-5.1
- **Blocks:** T-5.5
- **Done when:** Renders for a finalized filing with full data

### T-5.9 — PND3/PND53 PDF generators
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/pnd3.tsx`, `pnd53.tsx` (NEW)
- **Reads:** specs/03 §5.7
- **Spec:**
  - Each PDF: header summary (issuer info, period, totals), then one row per WithholdingRecord (vendor name, tax_id, gross, wht_rate, wht_amount, type code)
  - Vendor groupings if multiple payments
  - A4 landscape (more columns); Sarabun font
- **Depends on:** T-5.4
- **Blocks:** T-5.7
- **Done when:** Both render with correct totals

### T-5.10 — `/tax/pp30` UI (list / new / detail)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/pp30/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §5.1, specs/04 §5.2, wireframes/05-pp30.html
- **Spec:**
  - List: filing_no, period, status badge, output_vat, input_vat, payable, submitted_date
  - New: period picker → "Generate Preview" button → preview screen (output table, input table, totals box, "Flag non-claimable" checkboxes per row, "Save as Draft" button)
  - Detail: status-driven UI (DRAFT: edit non-claimable + finalize button; FINALIZED: submit form with submission_date + submission_ref; SUBMITTED: read-only with linked JE), download PDF button at top
- **Depends on:** T-5.5, T-2.28
- **Blocks:** T-5.14
- **Done when:** Full UI flow works; matches wireframes/05-pp30.html visually

### T-5.11 — `/tax/pnd3` UI
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/pnd3/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §5.1
- **Spec:** Mirror T-5.10 for PND3. Lists vendors with WHT certs grouped per vendor.
- **Depends on:** T-5.7
- **Blocks:** T-5.14
- **Done when:** Round-trip works for INDIVIDUAL vendors

### T-5.12 — `/tax/pnd53` UI
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/pnd53/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §5.1
- **Spec:** Mirror T-5.11 for JURISTIC vendors.
- **Depends on:** T-5.7
- **Blocks:** T-5.14
- **Done when:** Round-trip works

### T-5.13 — Tax Zod schemas
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `packages/shared/src/schemas/tax.ts` (NEW)
- **Reads:** specs/05 §Tax
- **Spec:** Zod for filing inputs (preview, create, finalize, submit, flag-non-claimable)
- **Depends on:** T-2.17
- **Blocks:** T-5.5, T-5.7
- **Done when:** Importable, validates at API boundary

### T-5.14 — `/tax/dashboard` page
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/dashboard/page.tsx` (NEW)
- **Reads:** specs/04 §5.1
- **Spec:**
  - 3 cards: this period's running output VAT, input VAT, WHT total (from VatRegister + WithholdingRecord live queries)
  - "Upcoming filings" — list of periods with no PP30/PND submitted, sorted by deadline
  - Filing history (5 most recent across all types)
  - Deadline warnings: PP30 due by 15th paper / 23rd e-filing; PND by 7th
- **Depends on:** T-5.5, T-5.7
- **Blocks:** —
- **Done when:** Cards show live numbers; deadline indicators correct

### T-5.15 — `/tax/wht-certs` browser
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/tax/wht-certs/page.tsx`, route `GET /tax-filings/wht-certs` (NEW)
- **Reads:** specs/04 §5.3
- **Spec:**
  - Filters: vendor, date range, period, status
  - Columns: cert_no, payment_date, vendor, gross, wht_rate, wht_amount, status (ACTIVE/VOID), payment_no link
  - Click row → preview PDF in modal
  - Bulk re-generate button (for a period) — re-renders all PDFs (in case template changed)
- **Depends on:** T-4.19, T-4.11
- **Blocks:** —
- **Done when:** Filters + preview work; bulk re-generate completes without error

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Generate PP30 for period; output_vat + input_vat match VatRegister sums | T-5.1, T-5.5 |
| Finalizing PP30 prevents new VatRegister rows from being added | T-5.2 (locks via `tax_filing_id`) |
| Submitting PP30 posts closing JE | T-5.3 |
| PND3 includes only INDIVIDUAL vendor WHT records | T-5.4 |
| PND53 includes only JURISTIC vendor WHT records | T-5.4 |
| All three PDFs render with correct totals | T-5.8, T-5.9 |
| WHT cert PDF includes year-to-date cumulative for vendor | T-4.19 (Phase 4) |

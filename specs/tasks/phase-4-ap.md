# Phase 4 — AP (Purchases)

**Goal:** Bill vendors, pay them with withholding, generate WHT certificates.
**Reads:** specs/01-domain-model.md, specs/02-business-rules.md §4.5–4.6, specs/03-thai-tax.md §5 (Withholding), specs/04-modules.md §4 (AP), specs/05-api-contracts.md §AP, specs/11 §Phase 4
**Acceptance:** specs/11-build-phases.md §Phase 4

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-4.16 (Zod) ─┐
              ├─ T-4.2 (Vendors API) ─ T-4.13 (Vendors UI)
T-4.1 (Vendor svc) ┘                                          ┐
                                                              ├─ T-4.18 (AP dashboard)
T-4.3 (WHT rate table) ─┐                                      │
T-3.4 (Invoice math) ─┬──┼─ T-4.4 (Bill math) ─ T-4.5/.6/.7/.8 (Bill svc) ─ T-4.9 (Bill API) ─ T-4.14 (Bill UI)
                       │  │                                           │
                       │  └─ T-4.10 (Payment svc draft) ─ T-4.11 (Payment post) ─ T-4.12 (Payment void)
                       │                                              │
                       │                                              ├─ T-4.15 (Payment API) ─ T-4.17 (Payment UI)
                       │                                              │
                       │                                              └─ T-4.19 (WHT cert PDF)
                       │
                       └─ T-4.20 (AP Aging)
```

## Parallel Lanes

- **Lane A (foundations):** T-4.1, T-4.3, T-4.16
- **Lane B (Vendors):** T-4.2 → T-4.13
- **Lane C (Bill svc):** T-4.4 → T-4.5 → T-4.6 → T-4.7 → T-4.8
- **Lane D (Payment svc, after T-4.7):** T-4.10 → T-4.11 → T-4.12
- **Lane E (Bill API + UI):** T-4.9 → T-4.14
- **Lane F (Payment API + UI):** T-4.15 → T-4.17
- **Lane G (WHT cert, after T-4.11):** T-4.19
- **Lane H (Reports):** T-4.20 → T-4.18

## Cross-Phase Anchors Produced

- VatRegister INPUT rows — read by Phase 5 PP30 aggregation
- WithholdingRecord rows — read by Phase 5 PND3/PND53 aggregation
- WHT certificate PDF templates — re-used by Phase 5 bulk re-generate
- `PaymentService.post` — used by Phase 6 bank reconciliation match

---

## Tasks

### T-4.1 — VendorService CRUD (with vendor_type)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/services/vendor.ts` (NEW)
- **Reads:** specs/01 §Vendor, specs/03 §5.2 (vendor_type INDIVIDUAL|JURISTIC)
- **Spec:**
  - Same shape as customer service; auto-generate `code` via `nextDocNo('VEND', year, ...)`
  - `vendor_type` enum field — required (drives PND3 vs PND53 split)
  - `default_withholding_rates` JSON — `{ services: '3', rent: '5', goods: '0', advertising: '2', interest: '1', professional: '3', royalties: '3', transportation: '1' }`
  - Soft delete blocked if open bills exist
- **Depends on:** T-2.3, T-2.2, T-2.1
- **Blocks:** T-4.2, T-4.5
- **Done when:** Create vendor with vendor_type required; default_withholding_rates persisted; delete with bill returns 409

### T-4.2 — `/api/v1/vendors` endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/vendors.ts` (NEW)
- **Reads:** specs/05 §AP: Vendors
- **Spec:**
  - `GET /vendors` (?q, ?vendor_type, ?active, paginated)
  - `POST /vendors`, `GET /vendors/:id`, `PATCH /vendors/:id`, `DELETE /vendors/:id`
- **Depends on:** T-4.1, T-4.16
- **Blocks:** T-4.13
- **Done when:** All 5 endpoints round-trip; `?vendor_type=INDIVIDUAL` filters correctly

### T-4.3 — WHT rate table (lookup)
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `packages/shared/src/wht-rates.ts` (NEW)
- **Reads:** specs/03 §5.2
- **Spec:**
  - Static export of full WHT table per §5.2: `{ key, label_th, rate_individual, rate_juristic, rd_code }` for: services (3%), goods (0%), rent (5%), transportation (1%), professional (3%), interest (1%), royalties (3%), advertising (2%)
  - `WHT_THRESHOLD = D('1000')` per §5.2 (no WHT below 1000 THB per transaction per recipient)
  - Helper `lookupRate(key, vendor_type): Decimal`
- **Depends on:** T-1.5
- **Blocks:** T-4.4, T-4.14
- **Done when:** Importable; threshold applied as boolean check in T-4.4

### T-4.4 — Bill math (line totals + WHT calc on PRE-VAT)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `packages/shared/src/bill-math.ts` (NEW)
- **Reads:** specs/02 §13.4, specs/03 §5.2 (threshold), §5.3
- **Spec:**
  - `lineWithholding({ net_excl_vat, wht_rate, threshold_satisfied }): Decimal` — WHT on PRE-VAT amount; returns 0 if line+vendor totals below threshold
  - `billTotals(lines, opts): { subtotal, vat_total, withholding_total, total, net_payable }` where `net_payable = subtotal + vat - withholding`
  - Threshold check: per spec §5.2, applies to gross payment to single recipient. Implementation: compute total bill payment to vendor; if < 1000 set all WHT to 0
  - Reuse `lineNet`, `lineVat` from T-3.4
- **Depends on:** T-3.4, T-4.3
- **Blocks:** T-4.5, T-4.11
- **Done when:** Property test: `subtotal + vat_total - withholding_total === total - withholding_total = net_payable`; bill of 500 THB → withholding_total=0 even with rate=3%

### T-4.5 — BillService.createDraft + validate
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/services/bill.ts` (NEW)
- **Reads:** specs/05 §POST /bills, specs/02 §4.5
- **Spec:**
  - `createDraft(input, actor_id)`
  - Validate: vendor exists; ≥1 line; each line `expense_account_code` resolves postable; `vendor_invoice_no` optional but warn if missing for VAT claim (spec 03 §3); each line `withholding_rate` valid against vendor_type
  - Compute totals via `billTotals`
  - Persist DRAFT
- **Depends on:** T-4.1, T-4.4, T-2.8
- **Blocks:** T-4.6, T-4.7
- **Done when:** Draft persists with computed totals; missing vendor_invoice_no produces warning (not error)

### T-4.6 — BillService.update (DRAFT only)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/services/bill.ts` (EDIT)
- **Reads:** specs/02 §5.1
- **Spec:** Mirror T-3.6 pattern; throws BILL_NOT_DRAFT, STALE_RECORD; replaces lines wholesale
- **Depends on:** T-4.5
- **Blocks:** T-4.9
- **Done when:** Update posted bill returns 409; valid update succeeds

### T-4.7 — BillService.post (with VatRegister INPUT)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/bill.ts` (EDIT)
- **Reads:** specs/02 §4.5, specs/03 §3
- **Spec:** Inside tx:
  - Re-validate, `assertOpen`, generate `bill_no` via `nextDocNo('BILL', year, ...)`
  - Create JE via `JournalEntryService.post`:
    - Dr Expense (per line `expense_account_code`) for each line's net
    - Dr VAT Receivable (14010) `vat_total` (only if > 0)
    - Cr AP (21010) `total - withholding_total`
    - Cr WHT Payable (21120) `withholding_total` (only if > 0)
  - Insert one VatRegister row per line (or aggregated row) with `vat_type='INPUT'`, `tax_invoice_no=vendor_invoice_no`, `counterparty_*` from vendor; flag `claimable=false` if `vendor.tax_id` missing or `vendor_invoice_no` blank (per spec 03 §3)
  - Note: WHT does NOT generate WithholdingRecord here — that happens at Payment post (per spec 03 §5.3 — WHT is "incurred" at bill but the cert is issued at payment)
  - Set status=POSTED, link je_id
  - AuditLog POST
- **Depends on:** T-4.5, T-2.12, T-2.3
- **Blocks:** T-4.8, T-4.10, T-4.20, Phase 5 PP30
- **Done when:** Posting bill 1000 net + 70 VAT + 30 WHT (3% on services) creates JE: Dr Expense 1000 + Dr VAT-Recv 70, Cr AP 1040, Cr WHT-Payable 30; VatRegister INPUT row inserted

### T-4.8 — BillService.void
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/bill.ts` (EDIT)
- **Reads:** specs/02 §5.3
- **Spec:**
  - Block with `BILL_HAS_PAYMENTS` if any PaymentApplication with `applied_amount > 0`
  - Else void linked JE; insert reversal VatRegister row (negative amounts, `reversal_of_id`)
  - Set bill status=VOID, AuditLog
- **Depends on:** T-4.7, T-2.13
- **Blocks:** T-4.9
- **Done when:** Void of paid bill returns 409; void of unpaid bill produces reversal JE + reversal VatRegister

### T-4.9 — `/api/v1/bills` endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/bills.ts` (NEW)
- **Reads:** specs/05 §AP (Bills mirror Sales Invoices)
- **Spec:** Mirror T-3.9 pattern: list/get/create/update/post/void/pdf endpoints. PDF template stub (full at T-4.14)
- **Depends on:** T-4.5–T-4.8, T-4.16
- **Blocks:** T-4.14
- **Done when:** All 7 endpoints round-trip

### T-4.10 — PaymentService.createDraft + apply logic
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/services/payment.ts`, `apps/api/src/services/payment-application.ts` (NEW)
- **Reads:** specs/05 §POST /payments, specs/02 §4.6
- **Spec:**
  - `createDraft(input, actor_id)` — validate vendor, bill applications belong to vendor + posted, bank_account_id required if not cash, sum applied ≤ total
  - `applyToBills(tx, payment_id, applications): void` — update each bill's `paid_amount` and status (PAID / PARTIAL_PAID); row-lock bills; mirror T-3.11 for AR
  - `unapplyFromBills(tx, payment_id): void`
- **Depends on:** T-4.7
- **Blocks:** T-4.11, T-4.12
- **Done when:** Draft validates over-application (PAYMENT_OVERAPPLIED); apply 500 to bill of 1000 → PARTIAL_PAID

### T-4.11 — PaymentService.post (with WithholdingRecord auto-create)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/payment.ts` (EDIT)
- **Reads:** specs/02 §4.6, specs/03 §5.3, §5.4
- **Spec:** Inside tx:
  - `assertOpen`, generate `payment_no` via `nextDocNo('PAY', year, ...)`
  - Resolve cash/bank account
  - Compute `withholding_total` — sum of WHT amounts from each applied bill's lines (proportionally if partial payment); apply WHT_THRESHOLD per vendor per payment
  - Create JE via `JournalEntryService.post`:
    - Dr AP (21010) `sum(applied_amount)` per spec 02 §4.6 — note: this is the AP balance being cleared, which equals (bill.total - bill.withholding_at_bill_post)
    - Cr Cash/Bank `net_paid` (= sum_applied - withholding_at_payment if any "incremental" WHT; usually 0 since bill already withheld)
    - **Spec interpretation note:** Re-read spec 02 §4.6 — Bills already booked WHT at post. At payment, AP debits the net (which excludes WHT), Cash credits the same net. WHT Payable is unaffected. The `withholding_total` in §4.6 JE is for cases where bill was NOT already withheld (some workflows). For our model: **if bill already booked WHT at post**, payment JE is just `Dr AP / Cr Cash`. If bill did NOT (rare), then `Dr AP gross / Cr Cash net / Cr WHT-Payable wht`. Implement BOTH paths and switch based on bill's `withholding_amount > 0`.
  - For each application where bill had WHT > 0: insert one WithholdingRecord per line with `cert_no` via `nextDocNo('WHT', year, ...)`, link `vendor_id`, `payment_id`, `bill_id`, `withholding_type` (key from T-4.3), `wht_amount`, `gross_amount` (the applied portion's net pre-VAT), `payment_date`, `period_code`
  - Call `applyToBills`
  - Set status=POSTED
  - AuditLog
- **Depends on:** T-4.10, T-4.4, T-2.12
- **Blocks:** T-4.12, T-4.15, T-4.19, T-4.20, Phase 5 PND3/53
- **Done when:** Payment of 1040 (net of WHT) clears bill's AP 1040; WithholdingRecord row created with cert_no `WHT-2026-NNNN`, links payment+bill+vendor

### T-4.12 — PaymentService.void (cascade)
- [ ] **Status:** Not started
- **Model:** Opus
- **Files:** `apps/api/src/services/payment.ts` (EDIT)
- **Reads:** specs/02 §5.3
- **Spec:**
  - Void linked JE; void all associated WithholdingRecord rows (mark status=VOID, set `voided_at`)
  - Call `unapplyFromBills` — restore bill `paid_amount` and status
  - Set payment status=VOID, AuditLog
- **Depends on:** T-4.11, T-2.13
- **Blocks:** T-4.15
- **Done when:** Voiding payment that paid bill → bill back to POSTED, WHT cert marked VOID, reversal JE created

### T-4.13 — `/ap/vendors` UI (list/new/detail)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ap/vendors/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `apps/web/src/components/ui/vendor-picker.tsx` (NEW)
- **Reads:** specs/04 §4
- **Spec:**
  - List: code, name, vendor_type badge (บุคคล/นิติบุคคล), tax_id, AP balance, last bill date
  - New: form with vendor_type required, default_withholding_rates per category (collapsible)
  - Detail: profile + open bills + payments + WHT certs issued
  - `<VendorPicker>` component with quick-add modal
- **Depends on:** T-4.2
- **Blocks:** T-4.14, T-4.17
- **Done when:** CRUD round-trips; vendor_type drives badge

### T-4.14 — `/ap/bills` UI (list/new/detail) + Bill PDF
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ap/bills/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `apps/web/src/components/ap/bill-form.tsx`, `apps/api/src/pdf/bill.tsx` (NEW)
- **Reads:** specs/04 §4.1
- **Spec:**
  - List: bill_no, vendor_invoice_no, vendor, issue_date, due_date, total, withholding, net_payable, paid_amount, status
  - Form: vendor picker, vendor_invoice_no, dates, vat_inclusive toggle, lines table with WHT rate dropdown (default from vendor profile, configurable per line) + WHT type dropdown
  - Footer: subtotal | VAT | withholding | net to pay
  - Detail: read-only display, payment history, void
  - Bill PDF: internal record (not for vendor — vendor sent us their invoice); just our copy with our coding
- **Depends on:** T-4.9, T-4.13, T-4.3, T-2.28
- **Blocks:** —
- **Done when:** Form computes withholding live; threshold warning if total < 1000 ("ยอดต่ำกว่า 1,000 บาท ไม่ต้องหักภาษี")

### T-4.15 — `/api/v1/payments` endpoints
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/payments.ts` (NEW)
- **Reads:** specs/05 §AP (Payments mirror Receipts)
- **Spec:** list/get/create/update/post/void/pdf endpoints
- **Depends on:** T-4.10, T-4.11, T-4.12, T-4.16
- **Blocks:** T-4.17
- **Done when:** Round-trip; `/payments/:id/wht-certs` lists associated certs

### T-4.16 — AP Zod schemas
- [ ] **Status:** Not started
- **Model:** DeepSeek
- **Files:** `packages/shared/src/schemas/ap.ts` (NEW)
- **Reads:** specs/05 §AP
- **Spec:** Vendor, Bill, Payment input shapes; reuse common schemas from T-2.17
- **Depends on:** T-2.17
- **Blocks:** T-4.2, T-4.9, T-4.15
- **Done when:** Importable, validation works at API boundary

### T-4.17 — `/ap/payments` UI (list/new/detail)
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ap/payments/page.tsx`, `new/page.tsx`, `[id]/page.tsx` (NEW)
- **Reads:** specs/04 §4.2
- **Spec:**
  - List: payment_no, date, vendor, payment method, total, withholding, net paid, applications count
  - New: vendor picker → loads unpaid bills → checkbox + amount per bill → payment method → bank account picker → cheque_no (if cheque) → save/post
  - Detail: applications table, JE link, WHT certs links (one per cert), download all certs button
- **Depends on:** T-4.15, T-4.13
- **Blocks:** —
- **Done when:** Two entry points work (standalone + from bill detail); detail shows linked WHT certs

### T-4.18 — `/ap/dashboard` page
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/ap/dashboard/page.tsx` (NEW)
- **Reads:** specs/04 §4
- **Spec:** 4 cards: AP balance, this month's expenses, overdue count + amount, this month's WHT total. Top 5 vendors by AP balance. Recent bills (5).
- **Depends on:** T-4.9, T-4.15, T-4.20
- **Blocks:** —
- **Done when:** Numbers tie out; overdue count matches aging report

### T-4.19 — WHT certificate (50 ทวิ) PDF
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/wht-cert.tsx`, route in `payments.ts` (`GET /payments/:id/wht-certs/:cert_id/pdf` and `GET /tax-filings/wht-certs/:id/pdf`) (NEW)
- **Reads:** specs/03 §5.4
- **Spec:** PDF per spec 03 §5.4:
  - Issuer info (us): name, address, tax_id 13-digit, branch_office (00000/00001/00002 per spec 03 §8)
  - Recipient (vendor): name, address, tax_id
  - Type of income: code from T-4.3 (e.g., "(2) ค่าธรรมเนียม ค่านายหน้า")
  - Date of payment, gross amount, WHT rate, WHT amount
  - Cumulative year-to-date for this vendor (query sum of WithholdingRecord WHERE vendor_id AND year)
  - Signature block
  - Cert no `WHT-YYYY-NNNN`
- **Depends on:** T-4.11
- **Blocks:** Phase 5 PND3/53 cert browser
- **Done when:** PDF renders with correct cumulative; manual visual diff vs sample 50 ทวิ form (provide via wireframe later)

### T-4.20 — AP Aging report
- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/ap-aging.ts`, route in `reports.ts` (EDIT), `apps/web/src/app/(authenticated)/reports/ap-aging/page.tsx`, `apps/api/src/pdf/ap-aging.tsx` (NEW)
- **Reads:** specs/04 §4, specs/08 §AP Aging
- **Spec:** Mirror T-3.22 (AR aging) but for vendors and bills. Buckets: Current, 1-30, 31-60, 61-90, 90+. Drill to bills.
- **Depends on:** T-4.7
- **Blocks:** T-4.18
- **Done when:** Buckets correct; sum per vendor = (bill.total_payable - paid_amount) for POSTED bills

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| Can create + post a bill; JE has Expense / VAT Receivable / AP / WHT Payable | T-4.7 |
| WHT correctly calculated on PRE-VAT base | T-4.4 |
| Can record a payment; AP status updates | T-4.10, T-4.11 |
| WithholdingRecord auto-generated for payment lines with WHT | T-4.11 |
| WHT certificate PDF with all required 50 ทวิ fields | T-4.19 |
| AP Aging shows correct buckets | T-4.20 |
| VatRegister INPUT row created on bill post | T-4.7 |

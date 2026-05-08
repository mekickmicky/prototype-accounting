# Phase 3 (AR) — Design Concerns + Recommendations

> 25 tasks. Build order matters because AR is the first phase that auto-posts JEs into the GL produced in Phase 2. Mistakes here ripple into Trial Balance, AR Aging, and tax filings.

## Concerns by sub-area

### A. Invoice posting → JE auto-creation

**Concern:** Spec needs to lock in the JE template format before any invoice service is built. Wrong template = wrong financials forever.

**Recommendation:**
1. Build `T-3.4` (Invoice math helpers) FIRST — get subtotal/VAT/withholding logic locked + unit tested
2. Then `T-3.5` (createDraft) using those helpers
3. Critical: design `JournalEntryTemplate` for invoice posting:
   - 1 JE per invoice (not 1 JE per line) — keeps audit clean
   - Lines: `Dr AR (1130)`, `Cr Service Revenue (4xxx) per service`, `Cr VAT Output (2151)` if VAT, `Cr WHT Receivable (1170)` for any deducted WHT-at-source (rare in AR but possible for some clients)
4. Use `BranchPicker` from T-2.28 — every JE line carries `branch_code`

**Risk to call out in spec:** What if invoice amount doesn't match `lines.sum()` to the cent due to display rounding? Service should validate using `Decimal.eq()` and throw if mismatch — never silently round.

### B. Receipt application logic

**Concern:** Partial payments + overpayments are where every accounting prototype gets it wrong. The "happy path" of full payment on a single invoice is trivial; the rest is hard.

**Recommendation:**
1. **First, write the rules in spec** before any code:
   - Single receipt → multiple invoices: allowed, user picks allocation
   - Partial payment: invoice status = `partially_paid`, no split
   - Overpayment: surplus → `Customer Advance Payment` (2120 or similar) — auto, no user prompt
   - Receipt void → unapply ALL allocations + reverse JE
2. **Sequence:** T-3.10 (createDraft) → T-3.11 (allocation logic, isolated, testable) → T-3.12 (post with advance handling) → T-3.13 (void cascade)
3. Don't auto-allocate FIFO — require user to pick which invoices to apply (matches Peak Account / Express behavior). Spec a UI affordance in T-3.21.

**Risk:** allocation rounding. If invoice = 10,007 baht and receipt = 5,000, paid_amount = 5,000, balance = 5,007. All `Decimal`. Compare with `.eq()`.

### C. PDF generation (Tax Invoice + Receipt)

**Concern:** Thai tax invoice has legal requirements (taxpayer ID, VAT breakdown, signature line). Wrong format = failed audit.

**Recommendation:**
1. Reference Revenue Department spec — find a published example before T-3.20 starts
2. Use `@react-pdf/renderer` (already in stack)
3. Embed Sarabun font (need TTF file in public/)
4. Two templates: `regular` (no VAT breakdown) and `tax-invoice` (with breakdown + "ใบกำกับภาษี" label)
5. Component: `<Header>`, `<CustomerBlock>`, `<LineItems>`, `<TotalsBlock>`, `<SignatureBlock>` — reusable across receipts/invoices

**Risk:** Thai font rendering at small sizes — verify before mass-producing. Also: PDF byte-for-byte determinism if we want to hash for archival.

### D. Customer master

**Concern:** The customer model is core data — getting it wrong costs migrations forever.

**Recommendation:** Verify `T-3.1` spec includes:
- Tax ID (13-digit, validated, optional but flagged for tax-invoice generation)
- Branch ID at customer level (for non-individual: head-office vs branch tax IDs)
- `is_corporate` boolean (drives WHT logic in AP, but referenced in AR for billing-name conventions)
- Multi-address (billing vs shipping vs head office)
- Soft-delete (deleted_at) — never raw delete, per CLAUDE.md invariant

### E. AR Aging report (T-3.22)

**Concern:** Aging logic looks simple but has edge cases. Common bugs:
- Off-by-one on bucket boundaries (0-30 vs 1-30)
- "As of" date not respected — query uses `now()` instead of report date
- Includes voided invoices

**Recommendation:**
- Spec must say buckets explicitly: `current (0-30)`, `31-60`, `61-90`, `91+`
- Always parameterize `as_of_date` (default = today, but accept any past date)
- Query joins on `posted_at <= as_of_date` AND `status NOT IN ('void')`
- Test with at least 5 fixtures: 1 current, 1 each bucket, 1 voided, 1 partially paid

### F. Customer statement (T-3.23)

**Concern:** Two camps: "open invoices only" or "full activity for period". Different stakeholders want different things.

**Recommendation:** Build "full activity" version — list all invoices + receipts in period, running balance column. Can derive "open only" from this; reverse not true.

## Build order recommendation (full Phase 3)

```
Foundation (parallel-able):
  T-3.3 ✓ (done)        Service catalog
  T-3.25                 AR Zod schemas
  T-3.4                  Invoice math helpers       ← BLOCKS everything else; do early

Customers:
  T-3.1                  CustomerService CRUD
  T-3.2                  /customers endpoints
  T-3.15                 CustomerPicker
  T-3.16                 /ar/customers UI

Invoices (sequential because they share invoice-service file):
  T-3.5  → T-3.6  → T-3.7 → T-3.8 → T-3.9      (createDraft → update → post → void → endpoints)

Invoice UI (parallel):
  T-3.17 (list)  T-3.18 (new/edit)  T-3.19 (detail)  T-3.20 (PDF)

Receipts (sequential, share receipt-service file):
  T-3.10 → T-3.11 → T-3.12 → T-3.13 → T-3.14

Receipts UI:
  T-3.21

Reports (parallel after invoices/receipts done):
  T-3.22 (Aging)
  T-3.23 (Statement)
  T-3.24 (Dashboard)
```

## Recommended model assignments

| Tasks | Model | Why |
|---|---|---|
| T-3.4 (Invoice math) | **Opus** | Decimal correctness + VAT/WHT formulas — high cost of error |
| T-3.5–T-3.8 (Invoice service) | Opus | Posting → JE creation, immutability rules |
| T-3.7 specifically (post + VatRegister) | **Opus** | Cross-system invariant; review carefully |
| T-3.10–T-3.13 (Receipt service + apply) | Opus | Application/allocation logic is the trap zone |
| T-3.20 (PDF templates) | Sonnet | Layout-heavy, less invariant logic |
| T-3.22 (AR Aging query) | Opus | SQL window/bucket logic + as-of date |
| Everything else (CRUD endpoints, list pages, pickers) | Sonnet | Mechanical CRUD pattern |

This deviates from the planned `**Model:**` in the task specs — recommend updating those before launch, OR override at spawn time via a future `--model T-3.4=Opus` flag.

## What to verify before Phase 3 launch

1. ☐ Issue 001 fixed (API 404 + middleware deprecation) — affects how Phase 3 endpoints respond
2. ☐ Invoice math helpers spec reviewed for VAT inclusive/exclusive handling
3. ☐ Tax invoice PDF spec referenced from a real example
4. ☐ Receipt allocation UX wireframe sketched (or accept "wireframe-as-built" approach)
5. ☐ Trial Balance still balances after one round-trip invoice post → receipt → void

## Stop conditions for auto

When launching Phase 3, recommend:
```bash
bun scripts/orchestrate.ts auto \
  --phase 3 \
  --stop-on-blocked \
  --stop-on-error 20 \
  --max-tasks 10
```

`--max-tasks 10` forces a review pause after 10 tasks done — Phase 3 has more invariants than Phase 2; review halfway through.

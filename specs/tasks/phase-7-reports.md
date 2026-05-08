# Phase 7 — Financial Reports

**Goal:** Full report set: P&L, Balance Sheet, Cash Flow, GL detail with drill-down, branch P&L, comparative mode, polished AR/AP aging, all exportable.
**Reads:** specs/05-api-contracts.md §Reports, specs/06-ui-design-system.md §Report layouts, specs/08-reports.md (full), specs/11 §Phase 7
**Acceptance:** specs/11-build-phases.md §Phase 7

## Conventions

- **Language:** All generated code, file content, identifiers, comments, and commit messages MUST be written in **English**. Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md` (root tracker).

## Dependency Graph

```
T-7.1 (Common report types) ─┬─ T-7.2 (P&L query) ─ T-7.3 (P&L API) ─ T-7.4 (P&L UI) ─ T-7.5 (P&L PDF)
                              │
                              ├─ T-7.6 (BS query) ─ T-7.7 (BS API) ─ T-7.8 (BS UI) ─ T-7.9 (BS PDF)
                              │
                              ├─ T-7.10 (CF query) ─ T-7.11 (CF API) ─ T-7.12 (CF UI) ─ T-7.13 (CF PDF)
                              │
                              ├─ T-7.14 (GL detail query) ─ T-7.15 (GL API) ─ T-7.16 (GL UI)
                              │
                              ├─ T-7.17 (VAT summary) ─┐
                              ├─ T-7.18 (Cash position) ─┤
                              └─ T-7.19 (Branch P&L) ────┴─ T-7.20 (Common filter bar) ─ T-7.21 (Comparative mode)
                                                            │
                                                            └─ T-7.22 (Common exports)
```

## Parallel Lanes

- **Lane A (foundations):** T-7.1, T-7.20
- **Lane B (P&L):** T-7.2 → T-7.3 → T-7.4 → T-7.5
- **Lane C (Balance Sheet):** T-7.6 → T-7.7 → T-7.8 → T-7.9 (parallel to B)
- **Lane D (Cash Flow):** T-7.10 → T-7.11 → T-7.12 → T-7.13 (parallel to B/C)
- **Lane E (GL detail):** T-7.14 → T-7.15 → T-7.16 (parallel to B/C/D)
- **Lane F (Smaller reports):** T-7.17, T-7.18, T-7.19 (parallel)
- **Lane G (Cross-cutting):** T-7.21, T-7.22 — last (after all reports exist)

## Cross-Phase Anchors Produced

- All report queries are read-only consumers of phases 2–5 data; this phase produces no anchors for later phases (Phase 8 doesn't depend on reports).
- **Cross-check invariants** (test): TB.balance must equal 0; BS.assets must equal BS.liab + BS.equity; CF.net_change must equal (cash_end - cash_begin)

---

## Tasks

### T-7.1 — Common report types + query helpers
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/common.ts` (NEW)
- **Spec:**
  - Shared types: `ReportFilters` (`as_of?`, `period_from?`, `period_to?`, `branch?`, `show_zero?`, `comparative?`), `ReportSection`, `ReportRow`, `ReportTotals`
  - Helpers: `dateRangeForPeriod(code)`, `previousPeriod(code)`, `branchClause(branch)` for SQL
  - All money in Decimal
- **Depends on:** Phase 2 (T-2.24 Trial Balance pattern)
- **Blocks:** T-7.2, T-7.6, T-7.10, T-7.14, T-7.17, T-7.18, T-7.19
- **Done when:** Importable; helpers unit-tested

### T-7.2 — P&L query
- [x] **Status:** Done (2026-05-08)
- **Model:** Opus
- **Files:** `apps/api/src/lib/reports/profit-loss.ts` (NEW)
- **Reads:** specs/08 §2
- **Spec:**
  - `profitLoss({ start_date, end_date, branch?, comparative? }): Promise<PLResult>`
  - `PLResult = { revenue: Section, cogs: Section, gross_profit: Decimal, opex: Section, operating_income: Decimal, other: Section, net_income: Decimal, comparative?: PLResult }`
  - For each REVENUE account: `SUM(credit) - SUM(debit)` over period; for EXPENSE: `SUM(debit) - SUM(credit)`; group by account type prefix (4xxxx revenue, 5xxxx COGS, 6xxxx opex, 49xxx other income, 69xxx other expense)
  - WHERE je.status='POSTED' AND entry_date BETWEEN start AND end AND branch filter
  - Excludes voided JEs naturally (reversal pairs net to zero)
  - Comparative: re-run for previous period of equal length
- **Depends on:** T-7.1, T-2.12
- **Blocks:** T-7.3, T-7.19
- **Done when:** Sum of revenue lines = total revenue; net income = revenue - all expenses; comparative columns aligned

### T-7.3 — `/api/v1/reports/profit-loss` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts` (EDIT)
- **Spec:**
  - `GET /reports/profit-loss?period_from=YYYY-MM&period_to=YYYY-MM&branch=&comparative=true&format=json|pdf|csv|xlsx`
  - Resolves period codes to dates via `dateRangeForPeriod`
- **Depends on:** T-7.2, T-7.22
- **Blocks:** T-7.4
- **Done when:** All formats return 200; periods Jan–May returns net income matching manual SUM

### T-7.4 — `/reports/profit-loss` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/profit-loss/page.tsx` (NEW)
- **Reads:** specs/08 §2, specs/06 §Report layouts
- **Spec:**
  - Common filter bar (T-7.20)
  - Sections per spec 08: Revenue, COGS, Gross Profit, Opex, Operating Income, Other, Net Income
  - Each account row: code, name, amount (right-aligned, tabular nums)
  - Section subtotals; Net Income highlighted
  - Comparative columns side-by-side with % change
  - Click account → drill to GL detail (T-7.16)
  - Export buttons
- **Depends on:** T-7.3, T-7.20, T-7.21, T-7.22
- **Blocks:** —
- **Done when:** Visually matches spec 08 §2 structure; drill-down works

### T-7.5 — P&L PDF template
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/profit-loss.tsx` (NEW)
- **Spec:** A4 portrait; company header; period in Buddhist Era; same sectioned layout as UI; subtotals and totals bold
- **Depends on:** T-7.2
- **Blocks:** T-7.3
- **Done when:** Renders; numbers tie to JSON

### T-7.6 — Balance Sheet query
- [x] **Status:** Done (2026-05-08)
- **Model:** Opus
- **Files:** `apps/api/src/lib/reports/balance-sheet.ts` (NEW)
- **Reads:** specs/08 §3
- **Spec:**
  - `balanceSheet({ as_of, branch? }): Promise<BSResult>`
  - `BSResult = { assets: { current, non_current, total }, liabilities: { current, non_current, total }, equity: { items, total }, total_l_and_e, balanced: boolean, imbalance: Decimal }`
  - For each ASSET / LIABILITY / EQUITY account, compute balance per spec 08 §1 calculation (cumulative debit-credit) up to as_of
  - **31030 Current year earnings:** computed on-the-fly = sum of (REVENUE credit-debit) - (EXPENSE debit-credit) for current fiscal year (NOT just stored balance, because year-end close may not have run)
  - Group by parent prefix into Current/Non-current
  - **Invariant:** `assets.total === liabilities.total + equity.total`; if not, set `balanced=false` and `imbalance`
- **Depends on:** T-7.1, T-2.12
- **Blocks:** T-7.7
- **Done when:** Test: BS at end of seeded month is balanced; force unbalanced data → returns balanced=false with imbalance

### T-7.7 — `/api/v1/reports/balance-sheet` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts` (EDIT)
- **Spec:** `GET /reports/balance-sheet?as_of=&branch=&comparative=&format=`
- **Depends on:** T-7.6, T-7.22
- **Blocks:** T-7.8
- **Done when:** All formats return; matches manual computation

### T-7.8 — `/reports/balance-sheet` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/balance-sheet/page.tsx` (NEW)
- **Spec:**
  - Sections per spec 08 §3 (Assets / Liab / Equity hierarchy)
  - Bottom: TOTAL ASSETS = TOTAL LIAB + EQUITY (red banner if not)
  - Drill-down on any account
  - Comparative side-by-side
  - Exports
- **Depends on:** T-7.7, T-7.20
- **Blocks:** —
- **Done when:** Renders; A=L+E line shown explicitly

### T-7.9 — BS PDF template
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/balance-sheet.tsx` (NEW)
- **Spec:** Two-column "Assets | Liabilities + Equity" layout per traditional Thai BS, A4 portrait
- **Depends on:** T-7.6
- **Blocks:** T-7.7
- **Done when:** Renders; numbers tie

### T-7.10 — Cash Flow query (indirect method)
- [x] **Status:** Done (2026-05-08)
- **Model:** Opus
- **Files:** `apps/api/src/lib/reports/cash-flow.ts` (NEW)
- **Reads:** specs/08 §Cash Flow Statement
- **Spec:**
  - `cashFlow({ start_date, end_date, branch? }): Promise<CFResult>`
  - Indirect method: 3 sections — Operating, Investing, Financing
  - Operating: start with net income (from P&L); add back depreciation (account 16020 movement); +/- working capital changes (Δ AR, Δ AP, Δ Inventory, Δ VAT Receivable/Payable, Δ Customer Deposits, Δ WHT Payable)
  - Investing: equipment purchases/sales (16010 movement)
  - Financing: owner's capital, loans (3xxxx movement other than 31030)
  - **Invariant:** `net_change === (cash_end - cash_begin)`; cash = sum of accounts 11xxx
- **Depends on:** T-7.1, T-7.2, T-7.6
- **Blocks:** T-7.11
- **Done when:** Test: net change matches sum of (11xxx balance changes)

### T-7.11 — `/api/v1/reports/cash-flow` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts` (EDIT)
- **Spec:** `GET /reports/cash-flow?period_from=&period_to=&branch=&format=`
- **Depends on:** T-7.10, T-7.22
- **Blocks:** T-7.12
- **Done when:** Round-trip; invariant holds

### T-7.12 — `/reports/cash-flow` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/cash-flow/page.tsx` (NEW)
- **Spec:** 3 sections (Operating, Investing, Financing); explicit "Net change in cash" line; "Cash beginning" + "Cash ending" boxes; reconciliation note
- **Depends on:** T-7.11, T-7.20
- **Blocks:** —
- **Done when:** Page renders; reconciliation between net change and cash delta is explicit and ties

### T-7.13 — CF PDF template
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/pdf/cash-flow.tsx` (NEW)
- **Spec:** A4 portrait, sectioned, totals bold, reconciliation line
- **Depends on:** T-7.10
- **Blocks:** T-7.11
- **Done when:** Renders; numbers tie

### T-7.14 — General Ledger detail query
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/general-ledger.ts` (NEW)
- **Reads:** specs/08 §General Ledger detail
- **Spec:**
  - `generalLedger({ account_code, period_from?, period_to?, branch? }): Promise<GLDetail>`
  - Returns: opening_balance (sum prior to period_from), per-transaction rows (date, JE no, description, debit, credit, running_balance, source_doc_link), closing_balance, totals
  - Running balance per row computed in-order (sort by entry_date, je_no)
- **Depends on:** T-7.1, T-2.12
- **Blocks:** T-7.15
- **Done when:** Sum of period rows + opening = closing; matches Trial Balance for that account at period_to

### T-7.15 — `/api/v1/reports/general-ledger` endpoint
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/routes/reports.ts` (EDIT)
- **Spec:** `GET /reports/general-ledger?account=&period_from=&period_to=&branch=&format=`
- **Depends on:** T-7.14, T-7.22
- **Blocks:** T-7.16
- **Done when:** Round-trip; running balance matches T-7.14

### T-7.16 — `/reports/general-ledger` page
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/app/(authenticated)/reports/general-ledger/page.tsx` (NEW)
- **Spec:**
  - Account picker, period range, branch
  - Header: opening balance, account info
  - Table: date, JE no (link), description (link to source doc if AR/AP/etc.), debit, credit, running balance
  - Footer: totals + closing balance
  - Reachable via drill-down from any other report (URL param `?account=11020&period_from=2026-05`)
- **Depends on:** T-7.15, T-7.20
- **Blocks:** —
- **Done when:** Drill from BS → GL detail works; running balance correct; clicking JE no opens JE detail

### T-7.17 — VAT Summary report
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/vat-summary.ts`, route in `reports.ts` (EDIT), `apps/web/src/app/(authenticated)/reports/vat-summary/page.tsx`, `apps/api/src/pdf/vat-summary.tsx` (NEW)
- **Reads:** specs/08 §VAT Summary
- **Spec:**
  - Per-period (rolling 12 months by default): Output VAT, Input VAT, Net Payable, Status (filed/unfiled), filing reference link
  - Drill to PP30 detail (Phase 5)
  - All formats
- **Depends on:** T-3.7 (VatRegister OUTPUT), T-4.7 (INPUT), T-5.2 (filings)
- **Blocks:** —
- **Done when:** Numbers match Phase 5 PP30 aggregator for each period

### T-7.18 — Cash Position report
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/cash-position.ts`, route, `apps/web/src/app/(authenticated)/reports/cash-position/page.tsx`, PDF (NEW)
- **Reads:** specs/08 §Cash Position
- **Spec:**
  - Per bank account: account, opening balance for period, total in, total out, closing balance, last reconciled date, unmatched txn count
  - Grand total cash position
  - Drill to bank account detail
- **Depends on:** T-6.4, T-2.12
- **Blocks:** —
- **Done when:** Matches sum of 11xxx account balances at end of period

### T-7.19 — Branch P&L (multi-column)
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/api/src/lib/reports/branch-pnl.ts`, route, `apps/web/src/app/(authenticated)/reports/branch-pnl/page.tsx`, PDF (NEW)
- **Reads:** specs/08 §2 (Branch breakdown)
- **Spec:**
  - Same structure as P&L (T-7.2) but multiple columns: TL, EK, RAMA9, Total
  - Each cell = P&L amount filtered by branch
  - Sums across branches must equal Total column
- **Depends on:** T-7.2
- **Blocks:** —
- **Done when:** Sum across branches per account = total column

### T-7.20 — Common report filter bar
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/components/reports/filter-bar.tsx` (NEW)
- **Reads:** specs/08 §Common Report Patterns
- **Spec:**
  - Period range picker (or as_of date for snapshot reports)
  - Branch picker (single or all)
  - Show zero-balance toggle
  - Comparative toggle
  - "Run" button + URL state sync
  - `<ExportButtons>` (PDF/CSV/XLSX) on the right
- **Depends on:** T-2.28
- **Blocks:** T-7.4, T-7.8, T-7.12, T-7.16, T-7.17, T-7.18, T-7.19
- **Done when:** Mounts in any report page; URL state preserves filters across reload

### T-7.21 — Comparative mode plumbing
- [x] **Status:** Done (2026-05-08)
- **Model:** Sonnet
- **Files:** `apps/web/src/components/reports/comparative-table.tsx`, `apps/api/src/lib/reports/comparative.ts` (NEW or EDIT existing reports)
- **Spec:**
  - When `?comparative=true`: report API also returns prior-period numbers
  - Table component renders side-by-side with `% change` column
  - Color-code: green for revenue +, red for expense + (i.e., increase good vs bad depends on type)
- **Depends on:** T-7.2, T-7.6, T-7.10
- **Blocks:** —
- **Done when:** P&L with comparative shows two columns + % change; BS with comparative shows two as-of dates

### T-7.22 — Common export utilities (CSV/XLSX/PDF wiring)
- [x] **Status:** Done (2026-05-08)
- **Model:** DeepSeek
- **Files:** `apps/api/src/lib/exports/report-csv.ts`, `report-xlsx.ts`, `apps/api/src/lib/exports/pdf-renderer.ts` (NEW or extend T-2.27)
- **Spec:**
  - Generic functions: `renderReportCSV(report)`, `renderReportXLSX(report, sheets[])`, `streamPDF(component)`
  - All endpoints branch on `?format=` and call these
  - XLSX: multi-sheet for complex reports (e.g., BS = Assets sheet, Liab+Equity sheet)
  - Filename convention: `{report-name}-{period_or_asof}-{branch}.{ext}`
- **Depends on:** T-2.27
- **Blocks:** T-7.3, T-7.7, T-7.11, T-7.15, T-7.17, T-7.18, T-7.19
- **Done when:** All 10 reports export to all 3 formats; XLSX opens in Excel; PDF prints clean A4

---

## Acceptance Criteria → Sub-task Mapping

| Spec 11 Acceptance | Sub-task |
|---|---|
| P&L correctly groups by Revenue / COGS / Opex / Other | T-7.2, T-7.4 |
| Balance Sheet equation holds: Assets = Liab + Equity | T-7.6, T-7.8 |
| Cash Flow: NET CHANGE = (Cash End - Cash Begin) and = Op + Inv + Fin | T-7.10 |
| GL Detail shows per-account txns with running balance | T-7.14, T-7.16 |
| Drilling from BS → Account → Transactions works | T-7.8, T-7.16 (via URL param) |
| Branch P&L shows columns per branch with totals | T-7.19 |
| All reports support PDF, CSV, XLSX export | T-7.22 |
| Comparative mode shows two columns side-by-side with % change | T-7.21 |

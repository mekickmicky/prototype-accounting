# 08 — Reports

This spec defines every financial report: how it's calculated, what it looks like, and how to drill down.

## Common Report Patterns

### Filters (every report)
- **Period range** — `from` / `to` periods (or single "as of" date for snapshot reports)
- **Branch** — single branch, multi-select, or "All"
- **Show zero-balance accounts** — toggle (default off)
- **Comparative** — toggle to show prior period side-by-side

### Output formats
- HTML (in-app, with drill-down links)
- PDF (printable, no interaction)
- CSV (for accountant)
- XLSX (formatted, multi-sheet for complex reports)

### Drill-down
Every account balance in any report is clickable → opens General Ledger detail filtered to that account + period.

---

## 1. Trial Balance (งบทดลอง)

The foundational report. Sum of all postings per account.

### Calculation

```sql
SELECT 
  a.code,
  a.name_th,
  a.type,
  COALESCE(SUM(jl.debit), 0) AS debit_total,
  COALESCE(SUM(jl.credit), 0) AS credit_total,
  COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS balance
FROM accounts a
LEFT JOIN journal_lines jl ON jl.account_code = a.code
LEFT JOIN journal_entries je ON je.id = jl.je_id
WHERE 
  je.status = 'POSTED'
  AND je.entry_date <= :as_of_date
  AND (:branch IS NULL OR jl.branch_code = :branch)
GROUP BY a.code, a.name_th, a.type
ORDER BY a.code;
```

### Display

| Code | Account | Debit | Credit | Balance |
|---|---|---:|---:|---:|
| 11010 | Cash on Hand | 250,000.00 | 100,000.00 | 150,000.00 |
| 11020 | KBank Current | 1,200,000.00 | 800,000.00 | 400,000.00 |
| ... | | | | |
| **TOTAL** | | **5,000,000.00** | **5,000,000.00** | **0.00** |

Bottom totals **must be equal**. If not, show red banner "TRIAL BALANCE NOT BALANCED — DATA INTEGRITY ISSUE" + admin alert.

For each account type, the balance is presented in its **natural sign**:
- ASSET: positive = debit balance (normal)
- LIABILITY/EQUITY: positive = credit balance (normal)
- REVENUE: positive = credit balance
- EXPENSE: positive = debit balance

When a balance is on the "wrong side" of normal, color it red.

### Group by type subtotals

Optional toggle: group accounts by type and show subtotals.

---

## 2. Profit & Loss (งบกำไรขาดทุน)

Income statement for a period.

### Structure

```
REVENUE
  41010  Service Revenue — Botox          XXXX.XX
  41020  Service Revenue — Filler         XXXX.XX
  41030  Service Revenue — Laser          XXXX.XX
  41040  Service Revenue — Skincare       XXXX.XX
  41090  Service Revenue — Other          XXXX.XX
  42010  Product Sales                    XXXX.XX
  Total Revenue                          XXXXXX.XX
                                          
COST OF SERVICES
  51010  Products Consumed                XXXX.XX
  51020  Doctor Commission                XXXX.XX
  Total COGS                             XXXXXX.XX
                                          
GROSS PROFIT                             XXXXXX.XX
                                          
OPERATING EXPENSES
  61010  Salary                           XXXX.XX
  61020  Rent                             XXXX.XX
  61030  Utilities — Electricity          XXXX.XX
  61040  Utilities — Water                XXXX.XX
  61050  Marketing                        XXXX.XX
  61060  Bank Fees                        XXXX.XX
  61070  Card Processing Fees             XXXX.XX
  Total Operating Expenses               XXXXXX.XX
                                          
OPERATING INCOME                          XXXXX.XX
                                          
OTHER INCOME / (EXPENSE)
  49010  Other Income                     XXXX.XX
  69010  Other Expenses                  (XXXX.XX)
  Total Other                              XXXX.XX
                                          
NET INCOME (BEFORE TAX)                  XXXXX.XX
```

### Calculation

For each REVENUE / EXPENSE account, sum debit/credit movements within the period:

```sql
SELECT
  a.code, a.name_th, a.type,
  CASE 
    WHEN a.type = 'REVENUE' THEN SUM(jl.credit) - SUM(jl.debit)
    WHEN a.type = 'EXPENSE' THEN SUM(jl.debit) - SUM(jl.credit)
  END AS amount
FROM accounts a
JOIN journal_lines jl ON jl.account_code = a.code
JOIN journal_entries je ON je.id = jl.je_id
WHERE 
  je.status = 'POSTED'
  AND je.entry_date BETWEEN :start_date AND :end_date
  AND a.type IN ('REVENUE', 'EXPENSE')
  AND (:branch IS NULL OR jl.branch_code = :branch)
GROUP BY a.code, a.name_th, a.type;
```

### Comparative mode

Show previous period as second column. Difference and % change as third.

### Branch breakdown

`/reports/branch-pnl` shows the same P&L with multiple branch columns:

```
                              TL          EK         RAMA9      Total
REVENUE
  41010  Botox             X.XX        X.XX        X.XX       XX.XX
  ...
```

---

## 3. Balance Sheet (งบฐานะการเงิน)

Snapshot of assets, liabilities, equity at a point in time.

### Structure

```
ASSETS
  Current Assets
    11010  Cash on Hand                        XXX.XX
    11020  KBank Current                       XXX.XX
    11030  SCB Savings                         XXX.XX
    11100  Petty Cash                          XXX.XX
    12010  Accounts Receivable                 XXX.XX
    13010  Inventory                           XXX.XX
    13020  Supplies                            XXX.XX
    14010  VAT Receivable                      XXX.XX
    Total Current Assets                      XXXX.XX
  Non-current Assets
    16010  Equipment                           XXX.XX
    16020  Accum. Depreciation                (XXX.XX)
    Total Non-current Assets                  XXXX.XX
  TOTAL ASSETS                                XXXXX.XX
                                              
LIABILITIES
  Current Liabilities
    21010  Accounts Payable                    XXX.XX
    21110  VAT Payable                         XXX.XX
    21120  Withholding Tax Payable             XXX.XX
    21210  Customer Deposits                   XXX.XX
    Total Current Liabilities                 XXXX.XX
  TOTAL LIABILITIES                          XXXXX.XX
                                              
EQUITY
  31010  Owner's Capital                       XXX.XX
  31020  Retained Earnings                     XXX.XX
  31030  Current Year Earnings                 XXX.XX  ← from P&L
  TOTAL EQUITY                               XXXXX.XX
                                              
TOTAL LIABILITIES + EQUITY                   XXXXX.XX
```

**Invariant: TOTAL ASSETS = TOTAL LIABILITIES + EQUITY.** If not, data integrity issue.

### Calculation

For each ASSET / LIABILITY / EQUITY account, sum all postings up to `as_of_date`:

```sql
SELECT
  a.code, a.name_th, a.type,
  CASE 
    WHEN a.type = 'ASSET' THEN SUM(jl.debit) - SUM(jl.credit)
    ELSE SUM(jl.credit) - SUM(jl.debit)
  END AS amount
FROM accounts a
JOIN journal_lines jl ON jl.account_code = a.code
JOIN journal_entries je ON je.id = jl.je_id
WHERE 
  je.status = 'POSTED'
  AND je.entry_date <= :as_of_date
  AND a.type IN ('ASSET', 'LIABILITY', 'EQUITY')
  AND (:branch IS NULL OR jl.branch_code = :branch)
GROUP BY a.code, a.name_th, a.type;
```

For `31030 Current Year Earnings`: not stored explicitly during the year. Compute on-the-fly = Net income from P&L for current fiscal year up to `as_of_date`.

After year-end close, the closing entries move that to `31020 Retained Earnings` and zero out 31030.

### Hierarchical grouping

Use `Account.parent_code` to group accounts hierarchically. Subtotals at each level. Top-level: Current Assets, Non-current Assets, Current Liabilities, etc. Define "Current" via account code prefix:
- `11`, `12`, `13`, `14`, `15` → Current Assets
- `16`, `17`, `18` → Non-current Assets
- `21`, `22` → Current Liabilities
- `23`, `24`, `25` → Non-current Liabilities
- `31`, `32`, `33` → Equity

---

## 4. Cash Flow Statement (งบกระแสเงินสด)

Indirect method (most common for SMEs).

### Structure

```
CASH FLOW FROM OPERATING ACTIVITIES
  Net Income                                    XXX.XX
  Adjustments:
    Depreciation                                XXX.XX
    Increase in AR                             (XXX.XX)
    Decrease in Inventory                       XXX.XX
    Increase in AP                              XXX.XX
    Increase in VAT Payable                     XXX.XX
    ...
  Net Cash from Operating                       XXX.XX
                                                
CASH FLOW FROM INVESTING ACTIVITIES
    Purchase of Equipment                      (XXX.XX)
    Sale of Equipment                           XXX.XX
  Net Cash from Investing                       XXX.XX
                                                
CASH FLOW FROM FINANCING ACTIVITIES
    Owner's Contribution                        XXX.XX
    Owner's Withdrawal                         (XXX.XX)
    Loan Proceeds                               XXX.XX
    Loan Repayment                             (XXX.XX)
  Net Cash from Financing                       XXX.XX
                                                
NET CHANGE IN CASH                              XXX.XX
                                                
Cash at Beginning of Period                     XXX.XX
Cash at End of Period                           XXX.XX  ← matches Balance Sheet
```

### Calculation logic

This is the trickiest report. Algorithm:

1. **Net income** = P&L net income for the period
2. **Operating adjustments:**
   - Depreciation: sum of debit movements to `16020` (or whichever depreciation account)
   - Working capital changes: `delta(AR) = AR_end - AR_start`. If AR went up, subtract (cash tied up). If down, add.
   - Same for: Inventory, AP, VAT Payable, VAT Receivable, Customer Deposits, etc.
3. **Investing:**
   - Equipment changes: net debit movement to `16xxx` accounts (excluding 16020)
4. **Financing:**
   - Equity changes: net movement to `31010` (excluding the year-end close)
   - Loans: net movement to loan accounts (out of scope unless added)

### Verification

`Cash at End - Cash at Begin = NET CHANGE` must match the sum of three sections. If not, the indirect method calculation is off — likely a missing adjustment.

For prototype, we can produce a simplified cash flow that just shows operating + investing + financing without per-line detail. Detailed version in Phase 7+.

---

## 5. General Ledger (Account Detail)

Per-account transaction listing with running balance.

### Structure

```
Account: 11020 KBank Current
Period: 2026-05-01 to 2026-05-31
Branch: All
                                                     
Date       Doc        Description           Debit     Credit    Balance
─────────────────────────────────────────────────────────────────────────
                                                                400,000.00  ← opening
01/05/26   RCT-...    Receipt SOMCHAI    5,350.00              405,350.00
03/05/26   PAY-...    Pay SUPPLIER A              25,000.00    380,350.00
07/05/26   RCT-...    Receipt LISA       8,200.00              388,550.00
...
─────────────────────────────────────────────────────────────────────────
TOTAL                                  XXX,XXX     XXX,XXX
                                                                XXX,XXX.XX  ← closing
```

### Drill-down

Click any row → opens the source document (Receipt, Payment, JE, etc.).

### Multi-account view

Optional: select multiple accounts to compare side-by-side.

---

## 6. AR Aging

Per-customer outstanding invoices bucketed by overdue days.

### Buckets

| Bucket | Days |
|---|---|
| Current | Not yet due |
| 1-30 | 1-30 days overdue |
| 31-60 | 31-60 days overdue |
| 61-90 | 61-90 days overdue |
| 90+ | More than 90 days overdue |

### Display

```
                         Current   1-30    31-60   61-90   90+    Total
SOMCHAI Co., Ltd.      10,000  5,000              -       -    15,000
LISA Beauty Center      8,000      -    3,000     -       -    11,000
...
TOTAL                  XX,XXX  XX,XXX  XX,XXX   XX,XXX   XX,XXX  XX,XXX
```

Drill: click a customer → list of unpaid invoices for that customer.

### Calculation

For each customer, find unpaid invoices (`status IN ('POSTED', 'PARTIAL_PAID')` and `paid_amount < total`):

```ts
const balance = total.minus(paid_amount);
const daysOverdue = differenceInDays(asOfDate, due_date);
const bucket = 
  daysOverdue <= 0 ? 'CURRENT' :
  daysOverdue <= 30 ? '1-30' :
  daysOverdue <= 60 ? '31-60' :
  daysOverdue <= 90 ? '61-90' : '90+';
```

---

## 7. AP Aging

Mirror of AR aging, for vendors.

---

## 8. VAT Summary

Quick view for the accountant.

```
Period: 2026-05
                                                
Output VAT (sales)                          XXX,XXX.XX
  Total taxable sales (net)                XXX,XXX.XX
  Total tax invoices issued                       XX
  
Input VAT (purchases)                       XXX,XXX.XX
  Total purchases (net)                    XXX,XXX.XX
  Total tax invoices received                     XX
  Claimable                                XXX,XXX.XX
  Non-claimable (flagged)                   XXX,XXX.XX
  
VAT Position
  Output - Input (Claimable)                 XX,XXX.XX
  → Status: PAYABLE (or REFUNDABLE / CARRIED FORWARD)
  
Filing
  ภพ.30 Status: DRAFT / FINALIZED / SUBMITTED
  Filed on:    -
  Submission ref: -
```

Action button: "Generate ภพ.30" → links to `/tax/pp30/new?period=2026-05`.

---

## 9. Cash Position

Quick dashboard of cash & bank balances right now.

```
Cash & Bank Position — As of [today]
                                                
11010  Cash on Hand                         XX,XXX.XX
11020  KBank Current — 0123456789           XX,XXX.XX
11030  SCB Savings — 9876543210             XX,XXX.XX
11100  Petty Cash                              XXX.XX
                                            ──────────
TOTAL                                       XXX,XXX.XX
                                                
Receivables (will become cash)              XXX,XXX.XX
Payables (will reduce cash)               (XXX,XXX.XX)
                                            ──────────
PROJECTED NET CASH                          XXX,XXX.XX
```

Quick chart: 30-day cash position trend (line chart, recharts).

---

## 10. Branch P&L

Same as P&L but with one column per branch and a total column.

Useful for evaluating branch profitability. Allocate corporate expenses with rules (e.g., split rent by sqm, split marketing by branch revenue).

For prototype: simple direct attribution only (no allocation rules).

---

## Report Implementation Checklist (Phase 7)

For each report, implement:

1. **Service function** in `lib/reports/{report-name}.ts` returning typed data
2. **API endpoint** in `routes/reports/{report-name}.ts`
3. **HTML page** in `app/reports/{report-name}/page.tsx`
4. **PDF renderer** in `lib/pdf/reports/{report-name}.tsx`
5. **CSV exporter** in `lib/export/{report-name}-csv.ts`
6. **Drill-down link** to GL detail or source documents

---

## Performance Considerations

- For Trial Balance / P&L / Balance Sheet on a large dataset, consider materialized views (out of scope for prototype, but design queries cleanly so they can be wrapped in a view later).
- Cache report outputs for closed periods (data won't change).
- Parallelize independent report queries (e.g., when generating P&L + BS on same page).
- Default report period: current month or last full month (whichever has more data).

## Number Formatting in PDFs

PDFs render with:
- Right-aligned numbers, monospace digits
- Two decimal places always
- Comma thousands separator
- Negative in parentheses (accounting style)
- "—" for zero values
- Bold for totals, double-rule above grand totals

## Print Settings

PDFs print at A4. Margins 15mm. Use header on every page with report name + date + page number.

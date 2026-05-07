# 02 — Business Rules

This spec defines the operational rules that the service layer must enforce. Every rule here is a hard requirement. The Prisma schema (spec 01) is the data shape; this is the behavior.

## 1. Double-Entry Posting

### 1.1 Every posted JournalEntry must balance

```ts
// In JournalEntryService.post()
const totalDebit = lines.reduce((sum, l) => sum.plus(l.debit), new Decimal(0));
const totalCredit = lines.reduce((sum, l) => sum.plus(l.credit), new Decimal(0));

if (!totalDebit.eq(totalCredit)) {
  throw new BusinessRuleError(
    'JE_NOT_BALANCED',
    `Debit (${totalDebit}) ≠ Credit (${totalCredit})`
  );
}
```

The DB `CHECK` constraint is a backstop. **Never disable it.**

### 1.2 Each JournalLine has exactly one of debit OR credit

Not both, not zero. A line with `debit=0, credit=0` is meaningless and must be rejected at validation.

### 1.3 Minimum 2 lines per JE

A JE must have at least one debit line and one credit line. Single-line "memos" are not allowed.

### 1.4 Account must exist and be postable

```ts
const account = await tx.account.findUnique({ where: { code: line.account_code } });
if (!account) throw new Error('ACCOUNT_NOT_FOUND');
if (!account.is_postable) throw new Error('ACCOUNT_NOT_POSTABLE');  // Header accounts only group
if (!account.is_active) throw new Error('ACCOUNT_INACTIVE');
```

## 2. Period Control

### 2.1 Posting requires OPEN period

```ts
const period = derivePeriodCode(je.entry_date);  // "2026-05"
const fp = await tx.fiscalPeriod.findUnique({ where: { code: period } });
if (!fp) throw new Error('PERIOD_NOT_FOUND');
if (fp.status !== 'OPEN') throw new Error('PERIOD_NOT_OPEN');
```

### 2.2 Period close checklist

Before a period can transition `OPEN → CLOSED`, the service must verify:

1. **No DRAFT JEs in this period** — all JEs must be POSTED or VOID
2. **All bank accounts reconciled for this period** — every BankTransaction in the period either has `reconciled_with_id` or is explicitly marked "ignore"
3. **VAT filing finalized** — TaxFiling for `period_code` and `filing_type=PP30` exists and is `FINALIZED` or `SUBMITTED`
4. **All AR/AP aging shown to user** — soft requirement, just display, but block if unconfirmed
5. **Closing entries posted** — see §3

If any check fails, return a structured error listing what's missing. UI displays a checklist.

### 2.3 Closing entries

When closing the **last period of a fiscal year** (e.g., `2026-12`), post these closing entries automatically:

```
Close revenue accounts to current year earnings:
  Dr. <each 4xxxx account>   (their credit balance)
     Cr. 31030 Current year earnings   (sum)

Close expense accounts to current year earnings:
  Dr. 31030 Current year earnings    (sum)
     Cr. <each 5xxxx, 6xxxx account>  (their debit balance)

Close current year earnings to retained earnings:
  Dr. 31030 Current year earnings    (or reverse if loss)
     Cr. 31020 Retained earnings
```

These are separate `JournalEntry` records with `source_type = 'ADJUSTMENT'` and a description like `"YEAR_END_CLOSE 2026"`. They count toward the period's posting requirement (i.e., post them BEFORE closing the period).

For non-year-end periods, no closing entries needed — just transition to CLOSED.

### 2.4 Period reopen

Only `ADMIN` role can reopen a CLOSED period. Reopening:
1. Sets status back to OPEN
2. Logs to AuditLog with reason
3. Voids any closing entries if reopening December (year-end)

`LOCKED` periods cannot be reopened. Period.

### 2.5 Period auto-creation

On system startup and on the first day of each new month, ensure the upcoming period exists. The seeder creates 24 periods (current year ± 1).

## 3. Document Numbering

All document numbers follow `{TYPE}-{YYYY}-{NNNN}` where:
- `TYPE` is fixed per document type
- `YYYY` is the calendar year of `issue_date` / `entry_date`
- `NNNN` is sequential, zero-padded to 4 digits, **resets each year**

| Document | Prefix |
|---|---|
| JournalEntry | `JE` |
| SalesInvoice | `INV` |
| Tax Invoice (separate) | `TAX` |
| Receipt | `RCT` |
| Bill | `BILL` |
| Payment | `PAY` |
| Tax Filing PP30 | `PP30` |
| Tax Filing PND3 | `PND3` |
| Tax Filing PND53 | `PND53` |
| Withholding Cert | `WHT` |
| Customer | `CUST` |
| Vendor | `VEND` |

### 3.1 Implementation

```ts
async function nextDocNo(
  tx: PrismaClient,
  prefix: string,
  year: number,
  table: 'journal_entries' | 'sales_invoices' | ...
): Promise<string> {
  // Atomic increment using PostgreSQL row lock
  const result = await tx.$queryRaw<{next_num: number}[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(${columnName}, '-', 3) AS INT)), 0) + 1 AS next_num
    FROM ${tableName}
    WHERE ${columnName} LIKE ${`${prefix}-${year}-%`}
    FOR UPDATE
  `;
  const nextNum = result[0].next_num;
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}
```

**Important:** The numbering generator must run inside a transaction. Concurrent posts could otherwise produce duplicate numbers. The `FOR UPDATE` lock prevents this, at the cost of serializing posts within the same year/prefix.

### 3.2 Voids do NOT release numbers

A voided invoice keeps its number. The next invoice gets the next number. Gaps from voids are normal and expected (Thai Revenue Department actually requires you to keep voided documents and explain gaps).

## 4. Document → Journal Entry Mapping

Every business document creates exactly one JE on post. This is the canonical mapping.

### 4.1 SalesInvoice — Post

```
Dr. Accounts Receivable (12010)             total
   Cr. Service Revenue (4xxxx)              subtotal (per line, by revenue_account_code)
   Cr. VAT Payable (21110)                  vat_amount
   Dr. Withholding Tax Receivable (14020)   withholding_amount  (rare for clinic, but possible)
```

If `withholding_amount > 0`:
- AR is debited with `total - withholding_amount` (we only get net)
- Withholding receivable is debited with `withholding_amount`

VAT register insert: one row per invoice with `vat_type=OUTPUT`.

### 4.2 SalesInvoice — Void (after posting)

Create a reversing JE: same lines, debit↔credit swapped. Set the original JE's `reversed_by_id`. Set the new JE's `reversal_of_id`. Both JEs remain POSTED. Original invoice status → VOID.

If invoice has receipts applied, **block the void** with `INVOICE_HAS_PAYMENTS`. User must void the receipts first.

### 4.3 Receipt — Post

```
Dr. Cash/Bank (11010 / 11020 / ...)         total_amount - card_fee
Dr. Bank Fees (61070)                       card_fee  (if applicable)
   Cr. Accounts Receivable (12010)          total_amount
```

Then for each `ReceiptApplication`, reduce the invoice's `paid_amount`. If `paid_amount >= total`, set invoice status to `PAID`. Else `PARTIAL_PAID`.

### 4.4 Receipt — Advance Payment (no invoice yet)

If receipt has no applications (customer prepaid):

```
Dr. Cash/Bank                               total_amount
   Cr. Customer Deposits (21210)            total_amount
```

Customer Deposits (21210) is a liability we owe back as services. When invoice is later issued, transfer:

```
Dr. Customer Deposits                       applied_amount
   Cr. Accounts Receivable                  applied_amount
```

### 4.5 Bill — Post

```
Dr. Expense (5xxxx / 6xxxx)                  per line, by expense_account_code
Dr. VAT Receivable (14010)                   vat_amount
   Cr. Accounts Payable (21010)              total - withholding_amount
   Cr. Withholding Tax Payable (21120)       withholding_amount
```

VAT register insert: `vat_type=INPUT` for each line.

### 4.6 Payment — Post

```
Dr. Accounts Payable (21010)                 sum of applied_amount on bills
   Cr. Cash/Bank (11010 / 11020)             net_paid
   Cr. Withholding Tax Payable (21120)       withholding_total
```

WithholdingRecord insert per payment line where withholding > 0.

### 4.7 TaxFiling PP30 — Post

```
Dr. VAT Payable (21110)                      output_vat (clears the running balance)
   Cr. VAT Receivable (14010)                input_vat (clears the running balance)
   Cr. Cash/Bank (11020 — KBANK ภพ.30)       vat_payable (the difference paid to RD)
```

If `input_vat > output_vat`, it's a VAT refund situation. Either claim refund (debit different AR account) or carry forward.

### 4.8 TaxFiling PND3 / PND53 — Post

```
Dr. Withholding Tax Payable (21120)          withholding_total
   Cr. Cash/Bank (11020)                     withholding_total
```

## 5. Voiding Rules

### 5.1 Drafts can be deleted

A `DRAFT` JE or document can be hard-deleted (no audit JE needed beyond AuditLog). Cascade deletes lines.

### 5.2 Posted documents can only be voided

Voiding:
1. Creates a **reversing JE** (debit↔credit swapped, same accounts, same amounts)
2. Sets the original document/JE status to `VOID`
3. Sets `voided_at`, `voided_by_id`, `void_reason` on the original
4. Links original.reversed_by_id ↔ new.reversal_of_id
5. Logs to AuditLog with full before/after

The reversing JE is itself POSTED (not VOID).

### 5.3 Void cascade

- Voiding a SalesInvoice with applied Receipts → block, must void receipts first
- Voiding a Receipt with applications → automatically reverses the applications (re-opens the invoices to PARTIAL_PAID/POSTED)
- Voiding a Bill with applied Payments → block, must void payments first
- Voiding a Payment with applications → reverses the applications

### 5.4 Cannot void into a closed period

If the original doc's period is CLOSED, voiding fails. User must reopen the period first (admin only) or post the reversal in the current period as an "adjustment" (separate flow, requires admin).

## 6. Tax Rules (See `03-thai-tax.md` for detail)

Quick rules referenced from this file:

- **VAT rate:** 7% standard. 0% for exports/exempt services. Configurable per invoice line.
- **VAT inclusive vs exclusive:** Stored on invoice as flag. Default exclusive (vat added on top).
- **Withholding:** 1% goods/services to companies, 3% services to companies (most common for vendor expenses), 5% rent. See `03-thai-tax.md` for full table.
- **Tax invoice number:** Required only when customer requests full tax invoice. Issued separately from regular invoice number.

## 7. Branch Rules

- Every transactional document has a `branch_code` field
- All JournalLines inherit the JE's branch_code unless explicitly overridden
- Reports filter by branch or roll up
- A single JE can have lines from multiple branches (rare, mostly for inter-branch transfers)
- For inter-branch transfers (e.g., cash moved from TL to EK):
  ```
  Dr. Cash/Bank — branch=EK    amount
     Cr. Cash/Bank — branch=TL    amount
  ```
  Source type: `BANK_TRANSFER`, branch on JE = either branch is fine.

## 8. Bank Reconciliation Rules

### 8.1 Matching states

A `BankTransaction` is in one of:
- `UNMATCHED` — not yet reconciled
- `MATCHED` — has `reconciled_with_id` pointing to a Receipt or Payment
- `IGNORED` — explicitly marked as not relevant (bank fees auto-debited, internal transfers, etc.)

### 8.2 Auto-match heuristics

When a bank statement is imported, attempt auto-match:

1. Exact amount match within ±3 days of `txn_date`, on the same `bank_account`
2. If multiple candidates, prefer the one with closest date
3. If still ambiguous, mark UNMATCHED and let user manually match

Auto-match confidence stored in `reconcile_confidence` (0-1.0). Below 0.8 → require manual confirm.

### 8.3 Manual reconcile flow

User picks an UNMATCHED bank txn → searches Receipts/Payments → confirms → creates the link.

If the bank txn has no matching document (e.g., a bank fee not yet recorded):
- User clicks "Create JE from this transaction"
- System opens a JE form pre-filled: Dr. Bank Fee Expense, Cr. Cash/Bank
- On post, the resulting JE is auto-linked to the bank txn

## 9. Recurring Entries

Out of scope for prototype Phase 1-7. Phase 8+ feature.

## 10. Error Handling Conventions

All business rule violations throw `BusinessRuleError` with:
- `code`: stable enum like `PERIOD_NOT_OPEN`, `JE_NOT_BALANCED`, `INVOICE_HAS_PAYMENTS`
- `message`: human-readable Thai message
- `context`: relevant IDs and values

Frontend maps codes to user-facing messages with i18n. Never display raw error messages from backend.

## 11. Audit Logging

Every state change on a posted entity logs to `AuditLog`:
- POST (draft → posted)
- VOID (posted → voided)
- UPDATE (only allowed on draft, but log it)
- DELETE (only on draft)
- PERIOD_CLOSE, PERIOD_REOPEN
- LOGIN (success and failure)
- EXPORT (any data export with row count)

`before_json` and `after_json` are full row snapshots. Truncate to first 50KB if larger.

## 12. Concurrency

### 12.1 Optimistic locking on documents

All transactional tables include `updated_at`. Frontend sends the timestamp it last saw; backend rejects with `STALE_RECORD` if it doesn't match.

### 12.2 Pessimistic locking on numbering

Already covered in §3.1. `FOR UPDATE` lock during number generation.

### 12.3 Pessimistic locking on period close

When user initiates "Close Period", acquire a row lock on the period and run all checks within the transaction. Prevents two users from closing the same period.

## 13. Money Math Rules

### 13.1 Always Decimal, never Float

```ts
import Decimal from 'decimal.js';

// Configure once at app startup
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

const subtotal = lines.reduce(
  (sum, l) => sum.plus(new Decimal(l.qty).times(l.unit_price).minus(l.discount)),
  new Decimal(0)
);

const vat = subtotal.times(0.07).toDecimalPlaces(2);
const total = subtotal.plus(vat).toDecimalPlaces(2);
```

### 13.2 Round only at display or final assignment

Internal calculations keep full precision. Round to 2 decimals only when:
- Storing in DB (Decimal(15,2) does this automatically)
- Displaying to user
- Comparing for equality (use `.eq()` after both sides are rounded)

### 13.3 VAT-inclusive math

If `is_vat_included = true` on an invoice line:
- `net = gross / 1.07`
- `vat = gross - net`
- Round each independently to 2dp
- Sum line totals to get invoice subtotal/vat/total

### 13.4 Withholding math

```ts
const grossExclVat = lineTotal;  // expense base, no VAT
const wht = grossExclVat.times(whtRate / 100).toDecimalPlaces(2);
const netPayment = grossExclVat.plus(vat).minus(wht);
```

WHT is calculated on the **net (pre-VAT)** amount, not on the gross. This is Thai Revenue Department rule.

## 14. Important "Don't Do This" List

- ❌ Don't `UPDATE` a posted JE's lines. Void and re-post.
- ❌ Don't reuse document numbers. Voids keep their number.
- ❌ Don't allow posting into a closed period via "force" flag.
- ❌ Don't store money as `Float` or `Number` in TS.
- ❌ Don't compute VAT in JS and trust it. Always derive from the line and verify with the constraint.
- ❌ Don't skip the `branch_code` on a JournalLine. Default to JE's branch but always set it.
- ❌ Don't expose raw Prisma errors to the frontend.
- ❌ Don't auto-confirm bank reconciliation matches with confidence < 0.8.

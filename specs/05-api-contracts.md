# 05 — API Contracts

This spec defines all REST endpoints. All responses follow a uniform envelope. All inputs validated with Zod.

## Conventions

### Base URL
`/api/v1`

### Response envelope

**Success:**
```ts
{
  "success": true,
  "data": <payload>,
  "meta"?: {                  // for paginated endpoints
    "total": 124,
    "page": 1,
    "page_size": 20
  }
}
```

**Error:**
```ts
{
  "success": false,
  "error": {
    "code": "PERIOD_NOT_OPEN",
    "message": "งวดบัญชี 2026-04 ปิดแล้ว ไม่สามารถ post ได้",
    "context"?: { "period_code": "2026-04" }
  }
}
```

### HTTP status codes

| Code | Use |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No content (delete success) |
| 400 | Bad request — validation error |
| 401 | Unauthorized — no/invalid session |
| 403 | Forbidden — wrong role |
| 404 | Not found |
| 409 | Conflict — business rule violation, stale record |
| 422 | Unprocessable — JE doesn't balance, etc. |
| 500 | Internal server error |

### Pagination

Query params: `?page=1&page_size=20&sort=field:asc`

`page_size` max = 100. Default = 20.

### Filtering

Query params named per resource. Common: `?status=POSTED&branch=TL&date_from=2026-05-01&date_to=2026-05-31`.

### Authentication

Every endpoint except `/auth/login` requires the `wind-acc-session` cookie.

---

## Auth Endpoints

### POST `/auth/login`
```ts
// Request
{ user_id: string }

// Response 200
{ user: { id, email, name, role } }
// Sets cookie: wind-acc-session
```

### POST `/auth/logout`
204. Clears cookie.

### GET `/auth/me`
```ts
// Response 200
{ user: { id, email, name, role } }
```

---

## GL: Accounts

### GET `/accounts`
Query: `?type=ASSET&active=true&parent_code=11000`
Returns all matching accounts with computed `current_balance`.

### POST `/accounts` (admin)
```ts
// Zod schema
{
  code: z.string().regex(/^\d{4,5}$/),
  name_en: z.string().min(1),
  name_th: z.string().min(1),
  type: z.enum(['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE']),
  parent_code: z.string().optional(),
  is_postable: z.boolean().default(true),
}
```

### GET `/accounts/:code`
Returns account + parent chain + recent transactions.

### PATCH `/accounts/:code` (admin)
Updatable: `name_en`, `name_th`, `is_active`. Cannot change `code` or `type`.

---

## GL: Journal Entries

### GET `/journal-entries`
Query: `?period=2026-05&branch=TL&status=POSTED&source_type=MANUAL&q=invoice%20123&page=1&page_size=20`

Response: paginated list of JEs (header only — no lines).

### GET `/journal-entries/:id`
Returns full JE with lines.

### POST `/journal-entries`
Creates DRAFT.
```ts
{
  entry_date: z.string().date(),
  branch_code: z.string(),
  description: z.string().min(1),
  source_type: z.enum(['MANUAL', 'ADJUSTMENT', ...]),  // Required: use "MANUAL" for manual entries
  source_id: z.string().optional(),
  lines: z.array(z.object({
    account_code: z.string(),
    branch_code: z.string().optional(),
    debit: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    credit: z.string().regex(/^\d+(\.\d{1,2})?$/).default('0'),
    description: z.string().optional(),
    dim_dept: z.string().optional(),
    dim_project: z.string().optional(),
    dim_doctor_id: z.string().optional(),
  })).min(2),
}
```

Example request body:
```json
{
  "entry_date": "2026-05-09",
  "branch_code": "TL",
  "description": "Manual journal entry",
  "source_type": "MANUAL",
  "lines": [
    { "account_code": "11010", "debit": "1000.00" },
    { "account_code": "51000", "credit": "1000.00" }
  ]
}
```

Service layer:
- Validate balanced
- Validate accounts exist & postable
- Save as DRAFT (no JE no yet)

### PATCH `/journal-entries/:id`
Edit DRAFT only. 409 if status != DRAFT.

### POST `/journal-entries/:id/post`
Transitions DRAFT → POSTED.
- Generate je_no
- Validate period OPEN
- Insert JE + lines + total_debit/total_credit
- Returns full posted JE

### POST `/journal-entries/:id/void`
```ts
{ reason: z.string().min(3) }
```
- Creates reversing JE
- Returns both original (now VOID) and reversal

### DELETE `/journal-entries/:id`
DRAFT only. 204.

---

## GL: Periods

### GET `/periods`
Returns all periods with status, JE counts, blocking issues.

### GET `/periods/:code/close-checklist`
Returns array of checklist items with pass/fail and detail links.

### POST `/periods/:code/close`
```ts
{ confirm: z.literal(true) }
```
Runs all checks; if any fail returns 409 with full checklist. Otherwise transitions to CLOSED, posts closing entries (if year-end).

### POST `/periods/:code/reopen` (admin only)
```ts
{ reason: z.string().min(10) }
```

---

## AR: Customers

### GET `/customers`
Query: `?q=name&active=true&page=1`

### POST `/customers`
```ts
{
  code: z.string().optional(),  // auto-generate if blank
  name: z.string().min(1),
  name_th: z.string().optional(),
  tax_id: z.string().regex(/^\d{13}$/).optional(),
  branch_office: z.string().default('00000'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  payment_terms_days: z.number().int().min(0).default(0),
}
```

### GET `/customers/:id`
Customer + open invoices summary + statement link.

### PATCH `/customers/:id`
### DELETE `/customers/:id` (soft)

---

## AR: Sales Invoices

### GET `/sales-invoices`
Query: `?customer_id=...&status=POSTED&overdue=true&period=2026-05`

### POST `/sales-invoices`
```ts
{
  customer_id: z.string(),
  branch_code: z.string(),
  issue_date: z.string().date(),
  due_date: z.string().date(),
  is_tax_invoice: z.boolean().default(false),
  vat_inclusive: z.boolean().default(true),
  notes: z.string().optional(),
  source_type: z.string().optional(),  // e.g., "WIND_VISIT"
  source_ref: z.string().optional(),
  lines: z.array(z.object({
    description: z.string().min(1),
    service_code: z.string().optional(),
    product_code: z.string().optional(),
    qty: z.string().default('1'),  // Must be string: "1", not number 1
    unit_price: z.string(),
    discount: z.string().default('0'),
    vat_rate: z.string().default('7'),
    revenue_account_code: z.string(),  // Use a postable leaf account code (e.g., 41100, not header 41000)
  })).min(1),
}
```

Example request body:
```json
{
  "customer_id": "cmoy5n0bb0000qcoaojfd31tb",
  "branch_code": "TL",
  "issue_date": "2026-05-09",
  "due_date": "2026-06-08",
  "is_tax_invoice": true,
  "vat_inclusive": true,
  "lines": [
    {
      "description": "Professional service",
      "qty": "1",
      "unit_price": "1000.00",
      "revenue_account_code": "41100"
    }
  ]
}
```

### POST `/sales-invoices/:id/post`
Generates invoice_no, tax_invoice_no (if requested), creates JE, inserts VatRegister.

### POST `/sales-invoices/:id/void`
```ts
{ reason: z.string().min(3) }
```
Blocks if has applied receipts.

### GET `/sales-invoices/:id/pdf`
Returns PDF stream.

---

## AR: Receipts

### GET `/receipts`

### POST `/receipts`
```ts
{
  customer_id: z.string(),
  branch_code: z.string(),
  receipt_date: z.string().date(),
  total_amount: z.string(),
  payment_method: z.enum(['CASH','TRANSFER','CREDIT_CARD','DEBIT_CARD','QR','CHEQUE','OTHER']),
  bank_account_id: z.string().optional(),
  card_fee: z.string().default('0'),
  slip_ref: z.string().optional(),
  notes: z.string().optional(),
  applications: z.array(z.object({
    invoice_id: z.string(),
    applied_amount: z.string(),
  })).default([]),
}
```

Validation:
- If method != CASH: `bank_account_id` required
- Sum of applied_amounts ≤ total_amount

### POST `/receipts/:id/post`
Updates each invoice's paid_amount, creates JE.

### POST `/receipts/:id/void`

### GET `/receipts/:id/pdf`

---

## AP: Vendors, Bills, Payments

Mirror AR. Routes: `/vendors`, `/bills`, `/payments`. Bill has `vendor_invoice_no` and withholding logic.

### POST `/bills`
```ts
{
  vendor_id: ...,
  vendor_invoice_no: z.string().optional(),
  branch_code: ...,
  issue_date: ..., due_date: ...,
  vat_inclusive: z.boolean().default(true),
  lines: z.array(z.object({
    description: z.string(),
    expense_account_code: z.string(),
    qty: z.string().default('1'),
    unit_price: z.string(),
    vat_rate: z.string().default('7'),
    withholding_rate: z.string().default('0'),
    withholding_type: z.string().optional(),
  })).min(1),
}
```

### POST `/payments`
```ts
{
  vendor_id: ...,
  branch_code: ...,
  payment_date: ...,
  total_amount: z.string(),  // gross before WHT
  payment_method: ...,
  bank_account_id: z.string().optional(),
  cheque_no: z.string().optional(),
  applications: z.array(z.object({
    bill_id: z.string(),
    applied_amount: z.string(),
  })).default([]),
}
```

WHT certs auto-generated on post.

---

## Tax: Filings

### GET `/tax-filings`
Query: `?type=PP30&period=2026-05`

### POST `/tax-filings/pp30/preview`
```ts
{ period: z.string().regex(/^\d{4}-\d{2}$/) }
```
Returns aggregated VAT register without persisting.

### POST `/tax-filings/pp30`
Creates DRAFT filing.

### POST `/tax-filings/:id/finalize`
Locks VatRegister rows to this filing.

### POST `/tax-filings/:id/submit`
```ts
{ submission_date: ..., submission_ref: ... }
```
Posts closing JE.

### GET `/tax-filings/:id/pdf`
Returns ภพ.30 / ภงด.3 / ภงด.53 PDF.

### GET `/tax-filings/wht-certs/:id/pdf`
Returns 50 ทวิ certificate.

---

## Bank

### GET `/bank-accounts`
### GET `/bank-accounts/:id/transactions`
Query: `?reconciled=false&date_from=...`

### POST `/bank/import`
```ts
{
  bank_account_id: z.string(),
  csv_content?: z.string(),  // mock: paste CSV
  use_mock_data?: z.boolean(),  // mock: generate fake txns
  date_from: z.string().date(),
  date_to: z.string().date(),
}
```

### GET `/bank/reconciliation/:account_id`
Returns: unmatched bank txns, unmatched documents, suggestions.

### POST `/bank/reconcile`
```ts
{
  bank_txn_id: z.string(),
  document_type: z.enum(['RECEIPT','PAYMENT']),
  document_id: z.string(),
}
```

### POST `/bank/unmatch`
```ts
{
  bank_txn_id: z.string(),
  reason: z.string().optional(),
}
```
Clears reconciliation link between bank transaction and document.

### POST `/bank/ignore-txn`
```ts
{ bank_txn_id: z.string(), reason: z.string().optional() }
```
Marks bank transaction as IGNORED (excluded from reconciliation).

### POST `/bank/create-je-from-txn`
```ts
{
  bank_txn_id: z.string(),
  je: {
    entry_date: z.string().date(),
    branch_code: z.string(),
    description: z.string(),
    lines: z.array({
      account_code: z.string(),
      branch_code?: z.string(),
      debit?: z.string(),
      credit?: z.string(),
      description?: z.string(),
    }).min(2),
  },
}
```
Creates and posts a JE from an unmatched bank transaction.

### POST `/bank/verify-slip`  (mock)
```ts
{ slip_ref: z.string() }
// Response (mock)
{ verified: true, sender: '...', amount: '...', date: '...' }
```
Mock endpoint for bank slip verification.

---

## Reports

### GET `/reports/trial-balance?as_of=2026-05-31&branch=TL`
Returns array of accounts with debit_total, credit_total, balance, plus grand totals.

### GET `/reports/profit-loss?period_from=2026-01&period_to=2026-05&branch=ALL&comparative=true`
Returns nested structure: revenue accounts, expense accounts, net income.
Parameters: `period_from`, `period_to` (YYYY-MM format), `branch` (branch code or ALL), `comparative` (optional boolean).

### GET `/reports/balance-sheet?as_of=2026-05-31`
Asset / Liability / Equity sections.

### GET `/reports/cash-flow?period_from=2026-01&period_to=2026-05`
Operating / Investing / Financing sections (indirect method).
Parameters: `period_from`, `period_to` (YYYY-MM format).

### GET `/reports/general-ledger?account=11020&period_from=2026-01&period_to=2026-05`
Per-account transaction list with running balance.
Parameters: `account` (account code), `period_from`, `period_to` (YYYY-MM format).

### GET `/reports/ar-aging?as_of=2026-05-31`
Per-customer aging buckets.

### GET `/reports/ap-aging?as_of=2026-05-31`

### GET `/reports/vat-summary?period_from=2026-01&period_to=2026-05`
VAT input/output summary by period.
Parameters: `period_from`, `period_to` (YYYY-MM format).

### GET `/reports/branch-pnl?period_from=2026-01&period_to=2026-05`
Profit & Loss by branch.
Parameters: `period_from`, `period_to` (YYYY-MM format).

All reports support `?format=pdf|csv|xlsx` for export.

---

## Integrations: Webhooks

### POST `/webhooks/wind-clinic/visit-completed`

Headers: `x-signature: <hmac-sha256>`

```ts
{
  event: 'visit.completed',
  visit_id: string,
  patient_id: string,
  patient_name: string,
  patient_tax_id?: string,
  branch_code: string,
  completed_at: string,
  items: [
    {
      type: 'service' | 'product',
      code: string,
      name: string,
      qty: number,
      unit_price: string,
      discount?: string,
      doctor_id?: string,
      doctor_commission_pct?: number,
    }
  ],
  payment: {
    method: PaymentMethod,
    amount: string,
    card_fee?: string,
    slip_ref?: string,
  },
  request_full_tax_invoice?: boolean,
}
```

Idempotency: `visit_id` is unique. Retries with same `visit_id` return existing invoice/receipt.

Response 200:
```ts
{
  invoice_no: string,
  receipt_no: string,
  je_no: string,
}
```

### POST `/webhooks/wind-stock/period-export`

```ts
{
  period_code: string,
  branch_code: string,
  entries: [
    {
      type: 'RECEIPT' | 'ISSUE' | 'TRANSFER' | ...,
      date: string,
      description: string,
      source_id: string,
      lines: [
        { account_code: string, debit: string, credit: string }
      ]
    }
  ]
}
```

Bulk-creates JE per entry, all marked `source_type=STOCK_EXPORT`.

---

## Settings

### GET `/settings/account-map`
### PATCH `/settings/account-map` (admin)

### GET `/settings/users`
### POST `/settings/users` (admin)
### PATCH `/settings/users/:id` (admin)

### GET `/audit-log`
Query: `?actor_id=...&entity_type=...&date_from=...`

---

## Common Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | No/invalid session |
| `FORBIDDEN` | 403 | Wrong role |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `PERIOD_NOT_OPEN` | 409 | Cannot post into closed period |
| `JE_NOT_BALANCED` | 422 | Debit ≠ Credit |
| `INVOICE_HAS_PAYMENTS` | 409 | Cannot void with applied receipts |
| `BILL_HAS_PAYMENTS` | 409 | Cannot void with applied payments |
| `STALE_RECORD` | 409 | Optimistic lock failure |
| `DUPLICATE_NUMBER` | 409 | Document number conflict |
| `ACCOUNT_NOT_POSTABLE` | 422 | Header account, not postable |
| `ACCOUNT_INACTIVE` | 422 | Account disabled |
| `INVALID_TAX_INVOICE` | 422 | Missing required field for tax invoice |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | HMAC failed |
| `IDEMPOTENT_REPLAY` | 200 | Returned previous result for same key |

Frontend maps each code to a Thai user-facing message.

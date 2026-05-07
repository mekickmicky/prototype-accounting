# 04 — Module Breakdown

This spec defines the feature surface area per module. Each module has its own routes, services, and UI pages but they all share the JE ledger.

## Module Overview

| Module | Purpose | Routes | Phase |
|---|---|---|---|
| **Auth** | Mock login, role-based access | `/login`, `/api/v1/auth/*` | 1 |
| **GL** | Chart of Accounts, Journal Entry, Period | `/gl/*`, `/api/v1/gl/*`, `/api/v1/journal-entries`, `/api/v1/accounts`, `/api/v1/periods` | 2 |
| **AR** | Customers, Invoice, Receipt, AR Aging | `/ar/*`, `/api/v1/ar/*` | 3 |
| **AP** | Vendors, Bill, Payment, AP Aging | `/ap/*`, `/api/v1/ap/*` | 4 |
| **Tax** | VAT register, ภพ.30, ภงด.3/53, certs | `/tax/*`, `/api/v1/tax/*` | 5 |
| **Bank** | Bank accounts, import, reconcile | `/bank/*`, `/api/v1/bank/*` | 6 |
| **Reports** | TB, P&L, BS, CF, GL detail, sub-ledger | `/reports/*`, `/api/v1/reports/*` | 7 |
| **Integrations** | Webhook receivers from wind-clinic, wind-stock | `/api/v1/webhooks/*` | 8 |
| **Settings** | Config (account map, branch, fiscal year start) | `/settings/*` | All phases |

---

## 1. Auth Module

### 1.1 Mock auth flow

1. `/login` shows a dropdown of seeded users with role badges
2. Pick user → POST `/api/v1/auth/login` with `{ user_id }` (no password in prototype)
3. Backend sets HTTP-only cookie `wind-acc-session` with signed JWT { user_id, role, exp }
4. Middleware on every API route validates the cookie

### 1.2 Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Everything: post, void, close period, reopen period, settings, user management |
| `ACCOUNTANT` | Post, void, close period (NOT reopen), generate reports, file taxes |
| `VIEWER` | Read-only on everything |

### 1.3 Permissions matrix

| Action | ADMIN | ACCOUNTANT | VIEWER |
|---|---|---|---|
| View dashboards | ✅ | ✅ | ✅ |
| View all reports | ✅ | ✅ | ✅ |
| Create draft JE/Invoice/Bill/etc. | ✅ | ✅ | ❌ |
| Post documents | ✅ | ✅ | ❌ |
| Void posted documents | ✅ | ✅ | ❌ |
| Close period | ✅ | ✅ | ❌ |
| Reopen period | ✅ | ❌ | ❌ |
| Modify chart of accounts | ✅ | ❌ | ❌ |
| Modify settings | ✅ | ❌ | ❌ |
| Add/remove users | ✅ | ❌ | ❌ |
| Export financial data | ✅ | ✅ | ✅ |

Enforce in API middleware. Frontend hides UI elements based on role but never trusts the frontend.

---

## 2. GL Module

### 2.1 Pages

| Route | Purpose |
|---|---|
| `/gl/dashboard` | Period overview: pending JE count, this period's TB summary, links to common actions |
| `/gl/accounts` | Chart of Accounts tree |
| `/gl/accounts/[code]` | Account detail + transaction history |
| `/gl/journal-entries` | List of JEs with filters |
| `/gl/journal-entries/new` | Create JE form |
| `/gl/journal-entries/[id]` | View/edit JE (edit only if DRAFT) |
| `/gl/periods` | Period list with status |
| `/gl/periods/[code]` | Period detail with close checklist |

### 2.2 Chart of Accounts page

- Tree view, expandable
- Each row shows: code, name (en/th), type, balance (current period)
- Click → drill into transaction list
- "+ New Account" button (admin only)
- Inline edit: name, is_active. Code immutable once created.

### 2.3 Journal Entry list

Filters:
- Period (default: current)
- Branch (default: all)
- Status (default: POSTED + DRAFT, exclude VOID by default)
- Source type
- Date range
- Account (any line touches this account)
- Free text search (description, JE no, source ref)

Columns: JE No, Date, Description, Source, Branch, Total Dr, Total Cr, Status, Posted By

Bulk actions: Export CSV, Print

### 2.4 Journal Entry form

Header: Entry date (default today), Branch (default current user's), Description, Source type (default MANUAL)

Lines table: Line No, Account (autocomplete by code or name), Description, Branch (default = header), Debit, Credit, Dimensions (collapsible advanced)

Footer: Total Dr | Total Cr | Difference (must be 0)

Buttons: Save Draft | Post | Cancel

Validations:
- Min 2 lines
- Each line: account_code required, exactly one of debit/credit > 0
- Total dr = Total cr (display "Out of balance: X" if not)
- Period must be OPEN (show warning if closed)
- All accounts must be postable

### 2.5 Period management

Period list shows: Code, Date Range, Status, Days Until Close, Posted JE Count, Action buttons.

"Close Period" opens a checklist modal:
- ☐ No draft JEs (shows count and link)
- ☐ All bank txns reconciled (shows unreconciled count + link)
- ☐ ภพ.30 finalized (shows status + link to file)
- ☐ AR/AP aging reviewed (just a checkbox the user marks)
- (For Dec only) ☐ Closing entries posted (shows status + auto-post button)

If any unchecked, "Close" button disabled. Otherwise: enter password (admin), confirm, period transitions to CLOSED.

---

## 3. AR Module

### 3.1 Pages

| Route | Purpose |
|---|---|
| `/ar/dashboard` | This month's revenue, AR balance, top overdue customers |
| `/ar/customers` | Customer list |
| `/ar/customers/new` | Add customer |
| `/ar/customers/[id]` | Customer detail: profile, all invoices, all receipts, statement |
| `/ar/invoices` | Invoice list with status filters |
| `/ar/invoices/new` | Create invoice |
| `/ar/invoices/[id]` | Invoice detail + actions (post, print, email, apply receipt) |
| `/ar/receipts` | Receipt list |
| `/ar/receipts/new` | Create receipt with invoice picker |
| `/ar/receipts/[id]` | Receipt detail |
| `/ar/aging` | AR aging report (0-30, 31-60, 61-90, 90+) |

### 3.2 Customer model

Search by code, name, phone. Quick add inline (e.g., from invoice form).

For new customers default `code` to next sequential `CUST-NNNN`. User can override.

### 3.3 Invoice form

Header: Customer (autocomplete), Branch, Issue Date, Due Date, Tax Invoice (toggle), VAT Inclusive (toggle).

Lines table: Description, Service Code (autocomplete from clinic catalog), Qty, Unit Price, Discount, VAT Rate, Revenue Account.

Service catalog autocomplete pulls from a hardcoded JSON in prototype (`lib/catalog/services.ts`). Real catalog from wind-clinic webhook later.

Footer totals: Subtotal | Discount | Subtotal after discount | VAT | Withholding | Total.

Save Draft / Post / Cancel.

On Post:
- Generate invoice number
- (If tax invoice) Generate tax invoice number
- Create JE per spec 02 §4.1
- Insert VatRegister rows
- Set status POSTED

### 3.4 Receipt flow

Two entry points:

**A. From an invoice:** "Record Payment" button → opens receipt form pre-filled with invoice ID and amount.

**B. Standalone:** `/ar/receipts/new` → pick customer → see list of unpaid invoices → check which to pay → enter amounts (default = full balance).

Apply logic: each ReceiptApplication ties this receipt to an invoice with applied_amount. Sum of applied_amounts ≤ receipt total. If less, the remainder is "unapplied" (advance payment).

### 3.5 AR aging

Bucketed by overdue days as of report date:
- Current (not yet due)
- 1-30 days overdue
- 31-60
- 61-90
- 90+

Per customer: total per bucket + grand total.
Per invoice (drill down): invoice no, issue date, days overdue, balance.

Export CSV. Branch filter.

---

## 4. AP Module

Mirror of AR. Routes under `/ap/*`. Vendors, Bills, Payments, AP Aging.

Differences from AR:
- Bills have `vendor_invoice_no` (their reference) and `bill_no` (our reference)
- Bills have withholding logic
- Payments generate WithholdingRecords + WHT certificates

### 4.1 Withholding on Bill form

Each line has WHT rate dropdown (default from vendor profile, configurable per line).

Footer shows: Subtotal | VAT | Withholding | Net to Pay = Subtotal + VAT - Withholding.

### 4.2 Payment form

Pick vendor → see unpaid bills → check + amounts (default full).

If bills had withholding, payment also withholds. WHT certificate is generated on payment post — one cert per payment per vendor (combining all bills paid in this payment).

---

## 5. Tax Module

### 5.1 Pages

| Route | Purpose |
|---|---|
| `/tax/dashboard` | This month's running output VAT, input VAT, WHT |
| `/tax/vat-register` | Browse VAT register |
| `/tax/pp30` | List of PP30 filings |
| `/tax/pp30/new` | Generate new PP30 for a period |
| `/tax/pp30/[id]` | View PP30, finalize, mark submitted |
| `/tax/pnd3` | List of PND3 filings |
| `/tax/pnd3/new` | Generate new PND3 |
| `/tax/pnd3/[id]` | View PND3, finalize, mark submitted |
| `/tax/pnd53` | Same for PND53 |
| `/tax/wht-certs` | Browse withholding certificates |

### 5.2 PP30 generation flow

User: navigate → pick period → "Generate".
System:
1. Aggregate VatRegister for the period
2. Show preview: output VAT total, input VAT total, payable, breakdown by tax invoice
3. User reviews, can flag input invoices as non-claimable
4. Confirm → Filing record created with status DRAFT
5. User clicks "Finalize" → status FINALIZED, VatRegister rows linked to filing (immutable)
6. After paying RD: user enters submission date + ref → status SUBMITTED, closing JE posted

### 5.3 Withholding certificate

Generated as PDF. Listed under `/tax/wht-certs`.

User can search by vendor, date range, period. Click to view/print.

Bulk re-generate all certs for a period (in case template changed).

---

## 6. Bank Module

See spec 07 for bank integration architecture (mock provider).

### 6.1 Pages

| Route | Purpose |
|---|---|
| `/bank/accounts` | Bank account list |
| `/bank/accounts/[id]` | Account detail + transaction list |
| `/bank/import` | Import bank statement (mock) |
| `/bank/reconcile/[account_id]` | Reconciliation workspace |

### 6.2 Reconciliation workspace

Two-pane layout:
- Left: Unmatched bank transactions
- Right: Unmatched receipts/payments

Click a bank txn → see auto-suggestions (matched by amount + date) on the right, ranked by confidence. Click a suggestion → preview the match → confirm.

Manual: click bank txn + click document → "Match selected" button.

If no document found: "Create JE from this txn" → opens JE form pre-filled.

If irrelevant: "Mark as ignored" → hidden from default view.

Bottom bar: "Reconciled balance: X | Bank balance: Y | Difference: Z" — when Z = 0, period is reconciled.

---

## 7. Reports Module

See spec 08 for full report definitions. Routes:

| Route | Report |
|---|---|
| `/reports/trial-balance` | Trial Balance |
| `/reports/profit-loss` | P&L (income statement) |
| `/reports/balance-sheet` | Balance Sheet |
| `/reports/cash-flow` | Cash Flow Statement |
| `/reports/general-ledger` | GL detail (per account, drill from any report) |
| `/reports/ar-aging` | AR Aging |
| `/reports/ap-aging` | AP Aging |
| `/reports/vat-summary` | VAT summary by period |
| `/reports/cash-position` | Cash & bank balance summary |
| `/reports/branch-pnl` | P&L by branch |

Common filter bar: Period range, Branch, As-of date. Export PDF/CSV/XLSX.

---

## 8. Integrations Module

### 8.1 Inbound webhooks

| Endpoint | Source | Triggers |
|---|---|---|
| `/api/v1/webhooks/wind-clinic/visit-completed` | wind-clinic | Auto-create Invoice + Receipt + JE |
| `/api/v1/webhooks/wind-stock/period-export` | wind-stock | Bulk-create JE for stock movements |

Both are HMAC-signed. Validate signature in middleware.

### 8.2 Outbound (future)

- Email invoice to customer
- LINE notification on overdue
- Auto-send tax filings to accounting firm

Out of scope for prototype.

---

## 9. Settings Module

### 9.1 Pages

| Route | Purpose |
|---|---|
| `/settings/company` | Company info (name, tax ID, address, branches) |
| `/settings/account-map` | Default account mappings (revenue account per service type, expense account per category) |
| `/settings/users` | User management (admin only) |
| `/settings/audit-log` | Browse audit log |
| `/settings/numbering` | Document number prefixes (display only in prototype, not editable) |

### 9.2 Account mappings

Critical for auto-generated JEs from webhooks. Stored as JSON or in a `Setting` table:

```json
{
  "wind_clinic_service_to_revenue": {
    "BOTOX": "41010",
    "FILLER": "41020",
    "LASER": "41030",
    "SKINCARE": "41040",
    "OTHER_SERVICE": "41090"
  },
  "wind_clinic_payment_to_bank": {
    "CASH": "11010",
    "CREDIT_CARD_KBANK": "11020",
    "TRANSFER_KBANK": "11020",
    "QR_PROMPTPAY": "11020"
  },
  "card_fee_account": "61070",
  "default_ar_account": "12010",
  "default_ap_account": "21010"
}
```

Editable by admin. UI: form with dropdowns of accounts.

---

## Component Inventory (UI)

These reusable components are referenced across pages. Define once in `components/`:

- `<MoneyInput />` — number input that handles Decimal
- `<MoneyDisplay />` — formats Decimal as `1,234.56` with optional currency symbol
- `<AccountPicker />` — autocomplete with code + name
- `<BranchPicker />` — select with TL/EK/RAMA9
- `<DatePicker />` — Buddhist Era display, Gregorian storage
- `<PeriodPicker />` — picks "2026-05" format
- `<CustomerPicker />` / `<VendorPicker />` — autocomplete with quick-add
- `<JEPreview />` — shows the JE that will be created from a draft document
- `<StatusBadge />` — colored badge for DRAFT/POSTED/VOID/PAID
- `<DocumentRefLink />` — clickable link to source document
- `<ConfirmDialog />` — modal for destructive actions
- `<DataTable />` — base table with sort, filter, pagination, row actions
- `<EmptyState />` — empty list illustration + CTA
- `<PageHeader />` — title + breadcrumb + action buttons
- `<FilterBar />` — date range + branch + status combo
- `<ExportButtons />` — PDF/CSV/XLSX dropdown

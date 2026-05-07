# 01 — Domain Model

This spec defines every entity, its purpose, and its relationships. The Prisma schema at the end of this file is the source of truth. If a question isn't answered here, check `02-business-rules.md`.

## Entity Map (Conceptual)

```
                  ┌──────────────────┐
                  │ FiscalPeriod     │ (controls when JEs can post)
                  └─────────┬────────┘
                            │ posted_in
                            ▼
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Account     │◄───│  JournalEntry    │───►│ JournalLine     │
│ (CoA)        │    │  (header)        │ 1:N│ (debit/credit)  │
└──────────────┘    └─────────┬────────┘    └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
       ┌──────────┐   ┌──────────┐   ┌──────────────┐
       │ Sales    │   │ Receipt  │   │ Bill /       │
       │ Invoice  │   │          │   │ Payment      │
       └──────────┘   └──────────┘   └──────────────┘
              │               │               │
              ▼               ▼               ▼
       ┌──────────┐                   ┌──────────────┐
       │ Customer │                   │ Vendor       │
       └──────────┘                   └──────────────┘
```

Every business document (Invoice, Receipt, Bill, Payment) creates a JournalEntry on post. The JE is the canonical record. Documents are "shaped views" of the underlying journal entries.

## Core Entities

### `Account` — Chart of Accounts

The hierarchical tree of accounts. Each transaction touches one or more accounts via JournalLine.

**Key fields:**
- `code` — Numeric string, e.g., `"1110"`. Unique. Primary visible identifier.
- `name_en`, `name_th` — Bilingual display
- `type` — One of `ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE`
- `parent_id` — Self-reference for hierarchy
- `is_postable` — If `false`, account is a header/grouping only (cannot post directly to it)
- `is_active` — Soft-disable

**Hierarchy convention (Thai SME, 5-digit):**

```
1xxxx  Assets
  11xxx  Current Assets
    11010  Cash on hand
    11020  Cash at bank — KBank
    11030  Cash at bank — SCB
    11100  Petty cash
    12010  Accounts receivable — trade
    13010  Inventory — products       ← from wind-stock
    13020  Inventory — supplies
    14010  VAT receivable (input VAT)
  16xxx  Non-current Assets
    16010  Equipment
    16020  Accumulated depreciation
2xxxx  Liabilities
  21xxx  Current Liabilities
    21010  Accounts payable — trade
    21110  VAT payable (output VAT)
    21120  Withholding tax payable
3xxxx  Equity
    31010  Owner's capital
    31020  Retained earnings
    31030  Current year earnings
4xxxx  Revenue
    41010  Service revenue — Botox
    41020  Service revenue — Filler
    41030  Service revenue — Laser
    41040  Service revenue — Skincare
    41090  Service revenue — Other
    42010  Product sales
    49010  Other income
5xxxx  Expenses (COGS)
    51010  Cost of services — products consumed
    51020  Cost of services — doctor commission
    52010  Inventory loss — damage
    52020  Inventory loss — expired
6xxxx  Operating Expenses
    61010  Salary expense
    61020  Rent expense
    61030  Utilities — electricity
    61040  Utilities — water
    61050  Marketing expense
    61060  Bank fees
    61070  Card processing fees
    69010  Other expenses
```

The seed file (`10-seed-data.md`) provides the full Chart of Accounts tailored to a beauty clinic.

### `FiscalPeriod` — Period Control

Controls when journal entries can be posted. A period must be `OPEN` to accept postings. Closing a period locks it permanently (re-opening requires admin override).

**Key fields:**
- `code` — `"2026-05"` format
- `start_date`, `end_date` — Inclusive range
- `status` — `OPEN | CLOSED | LOCKED`
- `closed_at`, `closed_by_id`

**Transitions:**
- `OPEN → CLOSED`: All required closing entries posted, all reconciliations complete. Can still be re-opened.
- `CLOSED → LOCKED`: Final lock (e.g., after auditor sign-off). Cannot be re-opened.
- `OPEN → LOCKED`: Not allowed. Must close first.

### `JournalEntry` — The Canonical Record

The single source of truth for every accounting event. Once posted, immutable.

**Key fields:**
- `je_no` — `"JE-2026-0001"`. Sequential per year. Required, unique.
- `entry_date` — When the transaction effectively happened (used to determine fiscal period)
- `period_code` — Derived from `entry_date`. Cached for indexing.
- `branch_code` — Which branch this entry belongs to
- `description` — Human-readable summary
- `source_type` — Enum: `MANUAL | SALES_INVOICE | RECEIPT | BILL | PAYMENT | TAX_FILING | BANK_TRANSFER | STOCK_EXPORT | RECURRING | ADJUSTMENT | REVERSAL`
- `source_id` — FK to the originating document (nullable if `MANUAL`)
- `status` — `DRAFT | POSTED | VOID`
- `posted_at`, `posted_by_id`
- `voided_at`, `voided_by_id`, `void_reason`
- `reversal_of_id` — If this is a reversing entry, points to the original
- `reversed_by_id` — If this entry was reversed, points to the reversal

**Invariants:**
- `SUM(lines.debit) = SUM(lines.credit)` — enforced at app and DB level
- Cannot transition `POSTED → DRAFT`
- Cannot edit lines after `POSTED`
- Voiding does NOT change the original; it creates a new JE with reversed signs

### `JournalLine` — The Debits and Credits

Each line in a journal entry. At least 2 per JE (one debit, one credit).

**Key fields:**
- `je_id` — FK to JournalEntry
- `line_no` — 1, 2, 3... within the entry
- `account_code` — FK to Account.code
- `branch_code` — Defaults to JE branch, but can override per line
- `debit` — Decimal(15,2), default 0
- `credit` — Decimal(15,2), default 0
- `description` — Optional line-level description
- `dimension_*` — Optional analytical dimensions (department, project, doctor — for advanced reporting)

**Invariant:** Exactly one of `debit` or `credit` is > 0; the other must be 0.

### `Customer` — Sales Counterparty

**Key fields:**
- `code` — `"CUST-0001"` or freeform code
- `name`, `name_th`
- `tax_id` — 13-digit Thai tax ID
- `branch_office` — `"00000"` (head office) or `"00001"`+ (branch)
- `address`, `phone`, `email`
- `payment_terms_days` — e.g., 30
- `default_ar_account_code` — Usually `12010`
- `is_active`

**Note:** Most customers are individuals (cash patients). The `tax_id` field is optional but required if the patient requests a full tax invoice (ใบกำกับภาษี).

### `Vendor` — Purchase Counterparty

Mirror of Customer. Used for AP.

**Key fields:**
- `code` — `"VEND-0001"`
- `name`, `name_th`
- `tax_id`, `branch_office`
- `address`, `phone`, `email`
- `payment_terms_days`
- `default_ap_account_code` — Usually `21010`
- `withholding_rates` — JSON: `{ "service": 3, "rent": 5 }` for default WHT rates per expense type
- `is_active`

### `SalesInvoice` — Customer Bill

**Key fields:**
- `invoice_no` — `"INV-2026-0001"`
- `customer_id`
- `branch_code`
- `issue_date`, `due_date`
- `tax_invoice_no` — Optional, separate sequence for full tax invoices: `"TAX-2026-0001"`
- `status` — `DRAFT | POSTED | PARTIAL_PAID | PAID | VOID`
- `subtotal`, `vat_amount`, `total` — Decimals
- `withholding_amount` — If customer withholds tax (rare for B2C clinics, but possible for corporate clients)
- `paid_amount` — Running total of receipts applied
- `je_id` — FK to JournalEntry on post
- `lines` — One-to-many SalesInvoiceLine

### `SalesInvoiceLine`

- `description` — e.g., "Botox 50 units"
- `service_code` or `product_code` — Optional reference to clinic catalog
- `qty`, `unit_price`, `discount`
- `vat_rate` — Default 7%, can be 0% for VAT-exempt services
- `revenue_account_code` — Which 4xxxx account this line credits
- `line_total` — qty × unit_price - discount (before VAT)

### `Receipt` — Customer Payment

When a customer pays an invoice (or pays in advance).

**Key fields:**
- `receipt_no` — `"RCT-2026-0001"`
- `customer_id`
- `branch_code`
- `receipt_date`
- `total_amount` — Total received
- `payment_method` — `CASH | TRANSFER | CREDIT_CARD | DEBIT_CARD | QR | CHEQUE | OTHER`
- `bank_account_code` — Which cash/bank account is debited (required if not CASH)
- `card_fee` — Bank/card processing fee (debit to expense, reduces net deposit)
- `slip_ref` — Bank slip reference / transaction ID
- `status` — `DRAFT | POSTED | VOID`
- `je_id`
- `applications` — One-to-many ReceiptApplication (which invoices this payment applies to)

### `ReceiptApplication`

- `receipt_id`
- `sales_invoice_id`
- `applied_amount`
- `applied_at`

### `Bill` — Vendor Invoice

Mirror of SalesInvoice. Records what we owe vendors.

**Key fields:**
- `bill_no` — `"BILL-2026-0001"` (our internal number)
- `vendor_invoice_no` — Vendor's invoice number (their reference)
- `vendor_id`
- `branch_code`
- `issue_date`, `due_date`
- `subtotal`, `vat_amount`, `withholding_amount`, `total`
- `status` — `DRAFT | POSTED | PARTIAL_PAID | PAID | VOID`
- `je_id`
- `lines` — One-to-many BillLine

### `BillLine`

- `description`
- `expense_account_code` — Which 5xxx/6xxx account this line debits
- `qty`, `unit_price`
- `vat_rate`, `withholding_rate`, `withholding_type` — `"service" | "rent" | "transport" | ...`
- `line_total`

### `Payment` — Outgoing Money

Mirror of Receipt. Records when we pay vendors.

**Key fields:**
- `payment_no` — `"PAY-2026-0001"`
- `vendor_id`, `branch_code`, `payment_date`
- `total_amount`, `withholding_total`, `net_paid`
- `payment_method`, `bank_account_code`, `cheque_no`
- `status`, `je_id`
- `applications` — One-to-many PaymentApplication

### `BankAccount` — Bank/Cash Accounts

The "real-world" cash containers. Each maps to one or more GL accounts.

**Key fields:**
- `code` — e.g., `"KBANK-001"`
- `name` — e.g., "KBank Current — 0123456789"
- `bank_name` — `"KBANK" | "SCB" | "BBL" | "KTB" | "BAY" | "TTB" | "GSB" | "CASH" | "OTHER"`
- `account_number` — Last 4 visible, full encrypted in real prod (mocked in prototype)
- `account_type` — `"current" | "savings" | "fixed"`
- `gl_account_code` — Maps to 11020/11030/etc.
- `is_active`

### `BankTransaction` — Imported Bank Movements

Statement lines from the bank, before reconciliation.

**Key fields:**
- `bank_account_id`
- `txn_date`
- `description` — As shown on statement
- `debit`, `credit` — Mirror of bank's view (credit = money in, debit = money out, from bank's perspective)
- `balance` — Running balance after this txn
- `bank_ref` — Bank's transaction reference
- `imported_at`
- `reconciled_with_id` — Nullable FK to Receipt or Payment when matched

### `TaxFiling` — VAT/WHT Filings

**Key fields:**
- `filing_no` — `"PP30-2026-05"` or `"PND3-2026-05"` or `"PND53-2026-05"`
- `filing_type` — `PP30 | PND3 | PND53`
- `period_code` — `"2026-05"`
- `status` — `DRAFT | FINALIZED | SUBMITTED`
- `output_vat`, `input_vat`, `vat_payable` (for PP30)
- `withholding_total`, `recipient_count` (for PND3/PND53)
- `je_id` — Closing JE for VAT or WHT
- `filed_at`, `filed_by_id`
- `pdf_url` — Generated PDF for submission

### `VatRegister` — VAT Detail Lines

Used to generate ภพ.30 reports. Every taxable transaction inserts a row here.

**Key fields:**
- `vat_type` — `OUTPUT | INPUT`
- `txn_date`
- `period_code`
- `tax_invoice_no` — From SalesInvoice or vendor's invoice
- `counterparty_name`, `counterparty_tax_id`
- `net_amount`, `vat_amount`, `gross_amount`
- `vat_rate`
- `source_type`, `source_id`
- `filing_id` — Nullable until included in a filing

### `WithholdingRecord` — WHT Detail

Used to generate ภงด.3/53 and ใบรับรองหัก ณ ที่จ่าย (50 ทวิ).

**Key fields:**
- `payment_id` — FK to Payment
- `vendor_id`, `vendor_tax_id`
- `wht_type` — `"service" | "rent" | "transport" | "professional" | "other"`
- `wht_rate` — 1, 2, 3, 5, etc.
- `gross_amount`, `wht_amount`
- `payment_date`
- `period_code`
- `cert_no` — `"WHT-2026-0001"`
- `cert_pdf_url`
- `filing_id` — PND3 (individual) or PND53 (juristic)

### `User` — System User (Mock Auth)

**Key fields:**
- `id`, `email`, `name`
- `role` — `ADMIN | ACCOUNTANT | VIEWER`
- `is_active`

For the prototype, login is a simple dropdown: pick a seeded user. Real SSO later.

### `AuditLog` — Append-Only Audit Trail

Every state change on a posted document logs here.

**Key fields:**
- `actor_id`, `actor_name`
- `action` — `CREATE | UPDATE | POST | VOID | DELETE | EXPORT | LOGIN | ...`
- `entity_type`, `entity_id`
- `before_json`, `after_json`
- `ip_address`, `user_agent`
- `created_at`

---

## Prisma Schema

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ═════════════════════ ENUMS ═════════════════════

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}

enum PeriodStatus {
  OPEN
  CLOSED
  LOCKED
}

enum JESourceType {
  MANUAL
  SALES_INVOICE
  RECEIPT
  BILL
  PAYMENT
  TAX_FILING
  BANK_TRANSFER
  STOCK_EXPORT
  RECURRING
  ADJUSTMENT
  REVERSAL
}

enum JEStatus {
  DRAFT
  POSTED
  VOID
}

enum DocStatus {
  DRAFT
  POSTED
  PARTIAL_PAID
  PAID
  VOID
}

enum PaymentMethod {
  CASH
  TRANSFER
  CREDIT_CARD
  DEBIT_CARD
  QR
  CHEQUE
  OTHER
}

enum BankName {
  KBANK
  SCB
  BBL
  KTB
  BAY
  TTB
  GSB
  CASH
  OTHER
}

enum FilingType {
  PP30
  PND3
  PND53
}

enum FilingStatus {
  DRAFT
  FINALIZED
  SUBMITTED
}

enum VatType {
  INPUT
  OUTPUT
}

enum UserRole {
  ADMIN
  ACCOUNTANT
  VIEWER
}

// ═════════════════════ MASTERS ═════════════════════

model Account {
  code         String       @id
  name_en      String
  name_th      String
  type         AccountType
  parent_code  String?
  parent       Account?     @relation("AccountHierarchy", fields: [parent_code], references: [code])
  children     Account[]    @relation("AccountHierarchy")
  is_postable  Boolean      @default(true)
  is_active    Boolean      @default(true)
  created_at   DateTime     @default(now())
  updated_at   DateTime     @updatedAt
  lines        JournalLine[]

  @@index([type])
  @@index([parent_code])
  @@map("accounts")
}

model FiscalPeriod {
  code           String        @id   // "2026-05"
  start_date     DateTime      @db.Date
  end_date       DateTime      @db.Date
  status         PeriodStatus  @default(OPEN)
  closed_at      DateTime?
  closed_by_id   String?
  closed_by      User?         @relation("PeriodCloser", fields: [closed_by_id], references: [id])
  created_at     DateTime      @default(now())
  journal_entries JournalEntry[]

  @@map("fiscal_periods")
}

model Customer {
  id                       String         @id @default(cuid())
  code                     String         @unique
  name                     String
  name_th                  String?
  tax_id                   String?
  branch_office            String         @default("00000")
  address                  String?
  phone                    String?
  email                    String?
  payment_terms_days       Int            @default(0)
  default_ar_account_code  String         @default("12010")
  is_active                Boolean        @default(true)
  deleted_at               DateTime?
  created_at               DateTime       @default(now())
  updated_at               DateTime       @updatedAt
  invoices                 SalesInvoice[]
  receipts                 Receipt[]

  @@index([is_active, deleted_at])
  @@map("customers")
}

model Vendor {
  id                       String     @id @default(cuid())
  code                     String     @unique
  name                     String
  name_th                  String?
  tax_id                   String?
  branch_office            String     @default("00000")
  address                  String?
  phone                    String?
  email                    String?
  payment_terms_days       Int        @default(30)
  default_ap_account_code  String     @default("21010")
  withholding_rates        Json?
  is_active                Boolean    @default(true)
  deleted_at               DateTime?
  created_at               DateTime   @default(now())
  updated_at               DateTime   @updatedAt
  bills                    Bill[]
  payments                 Payment[]

  @@index([is_active, deleted_at])
  @@map("vendors")
}

model BankAccount {
  id              String           @id @default(cuid())
  code            String           @unique
  name            String
  bank_name       BankName
  account_number  String?
  account_type    String           @default("current")
  gl_account_code String
  is_active       Boolean          @default(true)
  created_at      DateTime         @default(now())
  updated_at      DateTime         @updatedAt
  transactions    BankTransaction[]
  receipts        Receipt[]
  payments        Payment[]

  @@map("bank_accounts")
}

model User {
  id                  String         @id @default(cuid())
  email               String         @unique
  name                String
  role                UserRole
  is_active           Boolean        @default(true)
  created_at          DateTime       @default(now())
  updated_at          DateTime       @updatedAt
  posted_jes          JournalEntry[] @relation("JEPoster")
  voided_jes          JournalEntry[] @relation("JEVoider")
  closed_periods      FiscalPeriod[] @relation("PeriodCloser")
  audit_logs          AuditLog[]

  @@map("users")
}

// ═════════════════════ GENERAL LEDGER ═════════════════════

model JournalEntry {
  id              String         @id @default(cuid())
  je_no           String         @unique
  entry_date      DateTime       @db.Date
  period_code     String
  period          FiscalPeriod   @relation(fields: [period_code], references: [code])
  branch_code     String
  description     String
  source_type     JESourceType
  source_id       String?
  status          JEStatus       @default(DRAFT)
  posted_at       DateTime?
  posted_by_id    String?
  posted_by       User?          @relation("JEPoster", fields: [posted_by_id], references: [id])
  voided_at       DateTime?
  voided_by_id    String?
  voided_by       User?          @relation("JEVoider", fields: [voided_by_id], references: [id])
  void_reason     String?
  reversal_of_id  String?        @unique
  reversal_of     JournalEntry?  @relation("JEReversal", fields: [reversal_of_id], references: [id])
  reversed_by     JournalEntry?  @relation("JEReversal")
  total_debit     Decimal        @default(0) @db.Decimal(15, 2)
  total_credit    Decimal        @default(0) @db.Decimal(15, 2)
  created_at      DateTime       @default(now())
  updated_at      DateTime       @updatedAt
  lines           JournalLine[]

  @@index([entry_date])
  @@index([period_code, status])
  @@index([branch_code])
  @@index([source_type, source_id])
  @@index([status])
  @@map("journal_entries")
}

model JournalLine {
  id            String       @id @default(cuid())
  je_id         String
  je            JournalEntry @relation(fields: [je_id], references: [id], onDelete: Cascade)
  line_no       Int
  account_code  String
  account       Account      @relation(fields: [account_code], references: [code])
  branch_code   String
  debit         Decimal      @default(0) @db.Decimal(15, 2)
  credit        Decimal      @default(0) @db.Decimal(15, 2)
  description   String?
  dim_dept      String?
  dim_project   String?
  dim_doctor_id String?
  created_at    DateTime     @default(now())

  @@index([account_code])
  @@index([je_id, line_no])
  @@index([branch_code])
  @@map("journal_lines")
}

// ═════════════════════ AR ═════════════════════

model SalesInvoice {
  id                   String                @id @default(cuid())
  invoice_no           String                @unique
  tax_invoice_no       String?               @unique
  customer_id          String
  customer             Customer              @relation(fields: [customer_id], references: [id])
  branch_code          String
  issue_date           DateTime              @db.Date
  due_date             DateTime              @db.Date
  subtotal             Decimal               @default(0) @db.Decimal(15, 2)
  discount             Decimal               @default(0) @db.Decimal(15, 2)
  vat_amount           Decimal               @default(0) @db.Decimal(15, 2)
  withholding_amount   Decimal               @default(0) @db.Decimal(15, 2)
  total                Decimal               @default(0) @db.Decimal(15, 2)
  paid_amount          Decimal               @default(0) @db.Decimal(15, 2)
  status               DocStatus             @default(DRAFT)
  je_id                String?               @unique
  notes                String?
  source_type          String?               // e.g., "WIND_VISIT"
  source_ref           String?               // e.g., "visit_xxx"
  created_at           DateTime              @default(now())
  updated_at           DateTime              @updatedAt
  lines                SalesInvoiceLine[]
  receipt_applications ReceiptApplication[]

  @@index([customer_id])
  @@index([status, due_date])
  @@index([branch_code, issue_date])
  @@map("sales_invoices")
}

model SalesInvoiceLine {
  id                   String       @id @default(cuid())
  invoice_id           String
  invoice              SalesInvoice @relation(fields: [invoice_id], references: [id], onDelete: Cascade)
  line_no              Int
  description          String
  service_code         String?
  product_code         String?
  qty                  Decimal      @default(1) @db.Decimal(15, 4)
  unit_price           Decimal      @default(0) @db.Decimal(15, 2)
  discount             Decimal      @default(0) @db.Decimal(15, 2)
  vat_rate             Decimal      @default(7) @db.Decimal(5, 2)
  revenue_account_code String
  line_total           Decimal      @default(0) @db.Decimal(15, 2)

  @@index([invoice_id, line_no])
  @@map("sales_invoice_lines")
}

model Receipt {
  id              String                @id @default(cuid())
  receipt_no      String                @unique
  customer_id     String
  customer        Customer              @relation(fields: [customer_id], references: [id])
  branch_code     String
  receipt_date    DateTime              @db.Date
  total_amount    Decimal               @default(0) @db.Decimal(15, 2)
  payment_method  PaymentMethod
  bank_account_id String?
  bank_account    BankAccount?          @relation(fields: [bank_account_id], references: [id])
  card_fee        Decimal               @default(0) @db.Decimal(15, 2)
  slip_ref        String?
  status          DocStatus             @default(DRAFT)
  je_id           String?               @unique
  notes           String?
  created_at      DateTime              @default(now())
  updated_at      DateTime              @updatedAt
  applications    ReceiptApplication[]

  @@index([customer_id])
  @@index([receipt_date])
  @@index([branch_code])
  @@map("receipts")
}

model ReceiptApplication {
  id              String       @id @default(cuid())
  receipt_id      String
  receipt         Receipt      @relation(fields: [receipt_id], references: [id], onDelete: Cascade)
  invoice_id      String
  invoice         SalesInvoice @relation(fields: [invoice_id], references: [id])
  applied_amount  Decimal      @db.Decimal(15, 2)
  applied_at      DateTime     @default(now())

  @@unique([receipt_id, invoice_id])
  @@map("receipt_applications")
}

// ═════════════════════ AP ═════════════════════

model Bill {
  id                   String                @id @default(cuid())
  bill_no              String                @unique
  vendor_invoice_no    String?
  vendor_id            String
  vendor               Vendor                @relation(fields: [vendor_id], references: [id])
  branch_code          String
  issue_date           DateTime              @db.Date
  due_date             DateTime              @db.Date
  subtotal             Decimal               @default(0) @db.Decimal(15, 2)
  vat_amount           Decimal               @default(0) @db.Decimal(15, 2)
  withholding_amount   Decimal               @default(0) @db.Decimal(15, 2)
  total                Decimal               @default(0) @db.Decimal(15, 2)
  paid_amount          Decimal               @default(0) @db.Decimal(15, 2)
  status               DocStatus             @default(DRAFT)
  je_id                String?               @unique
  notes                String?
  created_at           DateTime              @default(now())
  updated_at           DateTime              @updatedAt
  lines                BillLine[]
  payment_applications PaymentApplication[]

  @@index([vendor_id])
  @@index([status, due_date])
  @@map("bills")
}

model BillLine {
  id                    String   @id @default(cuid())
  bill_id               String
  bill                  Bill     @relation(fields: [bill_id], references: [id], onDelete: Cascade)
  line_no               Int
  description           String
  expense_account_code  String
  qty                   Decimal  @default(1) @db.Decimal(15, 4)
  unit_price            Decimal  @default(0) @db.Decimal(15, 2)
  vat_rate              Decimal  @default(7) @db.Decimal(5, 2)
  withholding_rate      Decimal  @default(0) @db.Decimal(5, 2)
  withholding_type      String?
  line_total            Decimal  @default(0) @db.Decimal(15, 2)

  @@index([bill_id, line_no])
  @@map("bill_lines")
}

model Payment {
  id                String                @id @default(cuid())
  payment_no        String                @unique
  vendor_id         String
  vendor            Vendor                @relation(fields: [vendor_id], references: [id])
  branch_code       String
  payment_date      DateTime              @db.Date
  total_amount      Decimal               @default(0) @db.Decimal(15, 2)
  withholding_total Decimal               @default(0) @db.Decimal(15, 2)
  net_paid          Decimal               @default(0) @db.Decimal(15, 2)
  payment_method    PaymentMethod
  bank_account_id   String?
  bank_account      BankAccount?          @relation(fields: [bank_account_id], references: [id])
  cheque_no         String?
  status            DocStatus             @default(DRAFT)
  je_id             String?               @unique
  notes             String?
  created_at        DateTime              @default(now())
  updated_at        DateTime              @updatedAt
  applications      PaymentApplication[]
  withholding       WithholdingRecord[]

  @@index([vendor_id])
  @@index([payment_date])
  @@map("payments")
}

model PaymentApplication {
  id             String   @id @default(cuid())
  payment_id     String
  payment        Payment  @relation(fields: [payment_id], references: [id], onDelete: Cascade)
  bill_id        String
  bill           Bill     @relation(fields: [bill_id], references: [id])
  applied_amount Decimal  @db.Decimal(15, 2)
  applied_at     DateTime @default(now())

  @@unique([payment_id, bill_id])
  @@map("payment_applications")
}

// ═════════════════════ BANK ═════════════════════

model BankTransaction {
  id                   String       @id @default(cuid())
  bank_account_id      String
  bank_account         BankAccount  @relation(fields: [bank_account_id], references: [id])
  txn_date             DateTime     @db.Date
  description          String
  debit                Decimal      @default(0) @db.Decimal(15, 2)
  credit               Decimal      @default(0) @db.Decimal(15, 2)
  balance              Decimal?     @db.Decimal(15, 2)
  bank_ref             String?
  imported_at          DateTime     @default(now())
  reconciled_with_type String?      // "RECEIPT" | "PAYMENT"
  reconciled_with_id   String?
  reconciled_at        DateTime?

  @@index([bank_account_id, txn_date])
  @@index([reconciled_with_type, reconciled_with_id])
  @@map("bank_transactions")
}

// ═════════════════════ TAX ═════════════════════

model TaxFiling {
  id                 String              @id @default(cuid())
  filing_no          String              @unique
  filing_type        FilingType
  period_code        String
  status             FilingStatus        @default(DRAFT)
  output_vat         Decimal             @default(0) @db.Decimal(15, 2)
  input_vat          Decimal             @default(0) @db.Decimal(15, 2)
  vat_payable        Decimal             @default(0) @db.Decimal(15, 2)
  withholding_total  Decimal             @default(0) @db.Decimal(15, 2)
  recipient_count    Int                 @default(0)
  je_id              String?             @unique
  pdf_url            String?
  filed_at           DateTime?
  filed_by_id        String?
  created_at         DateTime            @default(now())
  vat_records        VatRegister[]
  wht_records        WithholdingRecord[]

  @@index([filing_type, period_code])
  @@map("tax_filings")
}

model VatRegister {
  id                  String     @id @default(cuid())
  vat_type            VatType
  txn_date            DateTime   @db.Date
  period_code         String
  tax_invoice_no      String?
  counterparty_name   String
  counterparty_tax_id String?
  net_amount          Decimal    @db.Decimal(15, 2)
  vat_amount          Decimal    @db.Decimal(15, 2)
  gross_amount        Decimal    @db.Decimal(15, 2)
  vat_rate            Decimal    @default(7) @db.Decimal(5, 2)
  source_type         String
  source_id           String
  filing_id           String?
  filing              TaxFiling? @relation(fields: [filing_id], references: [id])
  created_at          DateTime   @default(now())

  @@index([period_code, vat_type])
  @@index([source_type, source_id])
  @@map("vat_register")
}

model WithholdingRecord {
  id              String     @id @default(cuid())
  payment_id      String
  payment         Payment    @relation(fields: [payment_id], references: [id])
  vendor_id       String
  vendor_tax_id   String?
  wht_type        String
  wht_rate        Decimal    @db.Decimal(5, 2)
  gross_amount    Decimal    @db.Decimal(15, 2)
  wht_amount      Decimal    @db.Decimal(15, 2)
  payment_date    DateTime   @db.Date
  period_code     String
  cert_no         String     @unique
  cert_pdf_url    String?
  filing_id       String?
  filing          TaxFiling? @relation(fields: [filing_id], references: [id])
  created_at      DateTime   @default(now())

  @@index([period_code])
  @@index([vendor_id])
  @@map("withholding_records")
}

// ═════════════════════ AUDIT ═════════════════════

model AuditLog {
  id          String    @id @default(cuid())
  actor_id    String?
  actor       User?     @relation(fields: [actor_id], references: [id])
  actor_name  String?
  action      String
  entity_type String
  entity_id   String
  before_json Json?
  after_json  Json?
  ip_address  String?
  user_agent  String?
  created_at  DateTime  @default(now())

  @@index([entity_type, entity_id])
  @@index([actor_id])
  @@index([created_at])
  @@map("audit_logs")
}
```

## Database-Level Constraints (Critical)

Add these via raw SQL migration after `prisma migrate`:

```sql
-- Enforce balanced JE: cannot have a posted JE where total_debit ≠ total_credit
ALTER TABLE journal_entries
  ADD CONSTRAINT je_balance_check
  CHECK (status != 'POSTED' OR total_debit = total_credit);

-- Enforce JournalLine: exactly one of debit/credit > 0
ALTER TABLE journal_lines
  ADD CONSTRAINT line_debit_xor_credit
  CHECK ((debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0));

-- Account codes are immutable once referenced (handled at app layer; no FK ON UPDATE CASCADE)
```

## Notes for Claude Code

- All money fields are `Decimal(15, 2)`. Use `Prisma.Decimal` server-side, `decimal.js` `Decimal` everywhere else.
- Never serialize `Decimal` directly to JSON without `.toString()` — frontend must re-parse.
- All dates that don't need time use `@db.Date` (no time component, no TZ confusion).
- `created_at` / `updated_at` on every table for audit purposes.
- Soft delete (`deleted_at`) on master tables only. Transactional tables (JE, Invoice, etc.) use status enum (POSTED → VOID) instead.
- Indexes are intentional — do not add more without measuring. Do not remove these.

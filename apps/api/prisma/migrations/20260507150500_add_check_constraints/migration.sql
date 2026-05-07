-- WIND Accounting — DB-level CHECK constraints (T-1.4)
-- These are the safety net for double-entry, money sign rules, and code formats.
-- The service layer enforces the same rules first; these constraints are the final backstop.

-- ─────────────── JOURNAL ENTRIES / LINES ───────────────

-- Posted JEs must balance to the cent (debit total = credit total).
-- Drafts are exempt so they can be edited line-by-line before posting.
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "je_balance_check"
  CHECK ("status" <> 'POSTED' OR "total_debit" = "total_credit");

-- JE running totals must never go negative.
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "je_totals_non_negative"
  CHECK ("total_debit" >= 0 AND "total_credit" >= 0);

-- Each JournalLine must have exactly one of debit OR credit > 0 (xor, both non-negative).
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "line_debit_xor_credit"
  CHECK (("debit" > 0 AND "credit" = 0) OR ("debit" = 0 AND "credit" > 0));

-- Defensive non-negativity on individual columns (redundant with xor, kept as explicit invariant).
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "line_amounts_non_negative"
  CHECK ("debit" >= 0 AND "credit" >= 0);

-- ─────────────── ACCOUNTS / PERIODS (CODE FORMAT) ───────────────

-- Account code: 4 or 5 digit numeric string (e.g. "1010", "12010").
ALTER TABLE "accounts"
  ADD CONSTRAINT "account_code_format"
  CHECK ("code" ~ '^[0-9]{4,5}$');

-- Fiscal period code: "YYYY-MM" (e.g. "2026-05").
ALTER TABLE "fiscal_periods"
  ADD CONSTRAINT "fiscal_period_code_format"
  CHECK ("code" ~ '^[0-9]{4}-[0-9]{2}$');

-- A period's end_date must be on or after start_date.
ALTER TABLE "fiscal_periods"
  ADD CONSTRAINT "fiscal_period_date_order"
  CHECK ("end_date" >= "start_date");

-- ─────────────── SALES INVOICES ───────────────

ALTER TABLE "sales_invoices"
  ADD CONSTRAINT "sales_invoice_amounts_non_negative"
  CHECK (
    "subtotal" >= 0
    AND "discount" >= 0
    AND "vat_amount" >= 0
    AND "withholding_amount" >= 0
    AND "total" >= 0
    AND "paid_amount" >= 0
  );

ALTER TABLE "sales_invoice_lines"
  ADD CONSTRAINT "sales_invoice_line_amounts_non_negative"
  CHECK (
    "qty" >= 0
    AND "unit_price" >= 0
    AND "discount" >= 0
    AND "vat_rate" >= 0
    AND "line_total" >= 0
  );

-- ─────────────── RECEIPTS ───────────────

-- Receipts represent received money; total must be strictly positive.
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipt_total_positive"
  CHECK ("total_amount" > 0);

ALTER TABLE "receipts"
  ADD CONSTRAINT "receipt_card_fee_non_negative"
  CHECK ("card_fee" >= 0);

ALTER TABLE "receipt_applications"
  ADD CONSTRAINT "receipt_application_amount_positive"
  CHECK ("applied_amount" > 0);

-- ─────────────── BILLS ───────────────

ALTER TABLE "bills"
  ADD CONSTRAINT "bill_amounts_non_negative"
  CHECK (
    "subtotal" >= 0
    AND "vat_amount" >= 0
    AND "withholding_amount" >= 0
    AND "total" >= 0
    AND "paid_amount" >= 0
  );

ALTER TABLE "bill_lines"
  ADD CONSTRAINT "bill_line_amounts_non_negative"
  CHECK (
    "qty" >= 0
    AND "unit_price" >= 0
    AND "vat_rate" >= 0
    AND "withholding_rate" >= 0
    AND "line_total" >= 0
  );

-- ─────────────── PAYMENTS ───────────────

ALTER TABLE "payments"
  ADD CONSTRAINT "payment_total_positive"
  CHECK ("total_amount" > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payment_amounts_non_negative"
  CHECK (
    "withholding_total" >= 0
    AND "net_paid" >= 0
  );

ALTER TABLE "payment_applications"
  ADD CONSTRAINT "payment_application_amount_positive"
  CHECK ("applied_amount" > 0);

-- ─────────────── BANK TRANSACTIONS ───────────────

-- Debit and credit columns of imported bank lines must be non-negative.
-- balance is intentionally unconstrained — overdraft accounts can be negative.
ALTER TABLE "bank_transactions"
  ADD CONSTRAINT "bank_txn_amounts_non_negative"
  CHECK ("debit" >= 0 AND "credit" >= 0);

-- ─────────────── TAX FILINGS / REGISTERS ───────────────

ALTER TABLE "tax_filings"
  ADD CONSTRAINT "tax_filing_amounts_non_negative"
  CHECK (
    "output_vat" >= 0
    AND "input_vat" >= 0
    AND "vat_payable" >= 0
    AND "withholding_total" >= 0
    AND "recipient_count" >= 0
  );

ALTER TABLE "vat_register"
  ADD CONSTRAINT "vat_register_amounts_non_negative"
  CHECK (
    "net_amount" >= 0
    AND "vat_amount" >= 0
    AND "gross_amount" >= 0
    AND "vat_rate" >= 0
  );

ALTER TABLE "withholding_records"
  ADD CONSTRAINT "wht_amounts_non_negative"
  CHECK (
    "gross_amount" >= 0
    AND "wht_amount" >= 0
    AND "wht_rate" >= 0
  );

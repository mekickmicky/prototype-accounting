-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'LOCKED');

-- CreateEnum
CREATE TYPE "JESourceType" AS ENUM ('MANUAL', 'SALES_INVOICE', 'RECEIPT', 'BILL', 'PAYMENT', 'TAX_FILING', 'BANK_TRANSFER', 'STOCK_EXPORT', 'RECURRING', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "JEStatus" AS ENUM ('DRAFT', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'POSTED', 'PARTIAL_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CREDIT_CARD', 'DEBIT_CARD', 'QR', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "BankName" AS ENUM ('KBANK', 'SCB', 'BBL', 'KTB', 'BAY', 'TTB', 'GSB', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "FilingType" AS ENUM ('PP30', 'PND3', 'PND53');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('DRAFT', 'FINALIZED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "VatType" AS ENUM ('INPUT', 'OUTPUT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'VIEWER');

-- CreateTable
CREATE TABLE "accounts" (
    "code" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "name_th" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parent_code" TEXT,
    "is_postable" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT,
    "tax_id" TEXT,
    "branch_office" TEXT NOT NULL DEFAULT '00000',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 0,
    "default_ar_account_code" TEXT NOT NULL DEFAULT '12010',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_th" TEXT,
    "tax_id" TEXT,
    "branch_office" TEXT NOT NULL DEFAULT '00000',
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "payment_terms_days" INTEGER NOT NULL DEFAULT 30,
    "default_ap_account_code" TEXT NOT NULL DEFAULT '21010',
    "withholding_rates" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank_name" "BankName" NOT NULL,
    "account_number" TEXT,
    "account_type" TEXT NOT NULL DEFAULT 'current',
    "gl_account_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "je_no" TEXT NOT NULL,
    "entry_date" DATE NOT NULL,
    "period_code" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" "JESourceType" NOT NULL,
    "source_id" TEXT,
    "status" "JEStatus" NOT NULL DEFAULT 'DRAFT',
    "posted_at" TIMESTAMP(3),
    "posted_by_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,
    "reversal_of_id" TEXT,
    "total_debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "je_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "account_code" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "dim_dept" TEXT,
    "dim_project" TEXT,
    "dim_doctor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoices" (
    "id" TEXT NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "tax_invoice_no" TEXT,
    "customer_id" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withholding_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "je_id" TEXT,
    "notes" TEXT,
    "source_type" TEXT,
    "source_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "service_code" TEXT,
    "product_code" TEXT,
    "qty" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "revenue_account_code" TEXT NOT NULL,
    "line_total" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "receipt_date" DATE NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "bank_account_id" TEXT,
    "card_fee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "slip_ref" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "je_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_applications" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "applied_amount" DECIMAL(15,2) NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "bill_no" TEXT NOT NULL,
    "vendor_invoice_no" TEXT,
    "vendor_id" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "subtotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withholding_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "je_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "expense_account_code" TEXT NOT NULL,
    "qty" DECIMAL(15,4) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "withholding_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "withholding_type" TEXT,
    "line_total" DECIMAL(15,2) NOT NULL DEFAULT 0,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "payment_no" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "branch_code" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "total_amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withholding_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_paid" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "payment_method" "PaymentMethod" NOT NULL,
    "bank_account_id" TEXT,
    "cheque_no" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "je_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_applications" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "applied_amount" DECIMAL(15,2) NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "txn_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "debit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(15,2),
    "bank_ref" TEXT,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconciled_with_type" TEXT,
    "reconciled_with_id" TEXT,
    "reconciled_at" TIMESTAMP(3),

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_filings" (
    "id" TEXT NOT NULL,
    "filing_no" TEXT NOT NULL,
    "filing_type" "FilingType" NOT NULL,
    "period_code" TEXT NOT NULL,
    "status" "FilingStatus" NOT NULL DEFAULT 'DRAFT',
    "output_vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "input_vat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "vat_payable" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "withholding_total" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "je_id" TEXT,
    "pdf_url" TEXT,
    "filed_at" TIMESTAMP(3),
    "filed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tax_filings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_register" (
    "id" TEXT NOT NULL,
    "vat_type" "VatType" NOT NULL,
    "txn_date" DATE NOT NULL,
    "period_code" TEXT NOT NULL,
    "tax_invoice_no" TEXT,
    "counterparty_name" TEXT NOT NULL,
    "counterparty_tax_id" TEXT,
    "net_amount" DECIMAL(15,2) NOT NULL,
    "vat_amount" DECIMAL(15,2) NOT NULL,
    "gross_amount" DECIMAL(15,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 7,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "filing_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vat_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withholding_records" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "vendor_tax_id" TEXT,
    "wht_type" TEXT NOT NULL,
    "wht_rate" DECIMAL(5,2) NOT NULL,
    "gross_amount" DECIMAL(15,2) NOT NULL,
    "wht_amount" DECIMAL(15,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "period_code" TEXT NOT NULL,
    "cert_no" TEXT NOT NULL,
    "cert_pdf_url" TEXT,
    "filing_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withholding_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "webhooks_processed" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_processed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_type_idx" ON "accounts"("type");

-- CreateIndex
CREATE INDEX "accounts_parent_code_idx" ON "accounts"("parent_code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_is_active_deleted_at_idx" ON "customers"("is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_code_key" ON "vendors"("code");

-- CreateIndex
CREATE INDEX "vendors_is_active_deleted_at_idx" ON "vendors"("is_active", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_code_key" ON "bank_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_je_no_key" ON "journal_entries"("je_no");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_entry_date_idx" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "journal_entries_period_code_status_idx" ON "journal_entries"("period_code", "status");

-- CreateIndex
CREATE INDEX "journal_entries_branch_code_idx" ON "journal_entries"("branch_code");

-- CreateIndex
CREATE INDEX "journal_entries_source_type_source_id_idx" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "journal_entries_status_idx" ON "journal_entries"("status");

-- CreateIndex
CREATE INDEX "journal_lines_account_code_idx" ON "journal_lines"("account_code");

-- CreateIndex
CREATE INDEX "journal_lines_je_id_line_no_idx" ON "journal_lines"("je_id", "line_no");

-- CreateIndex
CREATE INDEX "journal_lines_branch_code_idx" ON "journal_lines"("branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_invoice_no_key" ON "sales_invoices"("invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_tax_invoice_no_key" ON "sales_invoices"("tax_invoice_no");

-- CreateIndex
CREATE UNIQUE INDEX "sales_invoices_je_id_key" ON "sales_invoices"("je_id");

-- CreateIndex
CREATE INDEX "sales_invoices_customer_id_idx" ON "sales_invoices"("customer_id");

-- CreateIndex
CREATE INDEX "sales_invoices_status_due_date_idx" ON "sales_invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "sales_invoices_branch_code_issue_date_idx" ON "sales_invoices"("branch_code", "issue_date");

-- CreateIndex
CREATE INDEX "sales_invoice_lines_invoice_id_line_no_idx" ON "sales_invoice_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_no_key" ON "receipts"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_je_id_key" ON "receipts"("je_id");

-- CreateIndex
CREATE INDEX "receipts_customer_id_idx" ON "receipts"("customer_id");

-- CreateIndex
CREATE INDEX "receipts_receipt_date_idx" ON "receipts"("receipt_date");

-- CreateIndex
CREATE INDEX "receipts_branch_code_idx" ON "receipts"("branch_code");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_applications_receipt_id_invoice_id_key" ON "receipt_applications"("receipt_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "bills_bill_no_key" ON "bills"("bill_no");

-- CreateIndex
CREATE UNIQUE INDEX "bills_je_id_key" ON "bills"("je_id");

-- CreateIndex
CREATE INDEX "bills_vendor_id_idx" ON "bills"("vendor_id");

-- CreateIndex
CREATE INDEX "bills_status_due_date_idx" ON "bills"("status", "due_date");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_line_no_idx" ON "bill_lines"("bill_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_payment_no_key" ON "payments"("payment_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_je_id_key" ON "payments"("je_id");

-- CreateIndex
CREATE INDEX "payments_vendor_id_idx" ON "payments"("vendor_id");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "payment_applications_payment_id_bill_id_key" ON "payment_applications"("payment_id", "bill_id");

-- CreateIndex
CREATE INDEX "bank_transactions_bank_account_id_txn_date_idx" ON "bank_transactions"("bank_account_id", "txn_date");

-- CreateIndex
CREATE INDEX "bank_transactions_reconciled_with_type_reconciled_with_id_idx" ON "bank_transactions"("reconciled_with_type", "reconciled_with_id");

-- CreateIndex
CREATE UNIQUE INDEX "tax_filings_filing_no_key" ON "tax_filings"("filing_no");

-- CreateIndex
CREATE UNIQUE INDEX "tax_filings_je_id_key" ON "tax_filings"("je_id");

-- CreateIndex
CREATE INDEX "tax_filings_filing_type_period_code_idx" ON "tax_filings"("filing_type", "period_code");

-- CreateIndex
CREATE INDEX "vat_register_period_code_vat_type_idx" ON "vat_register"("period_code", "vat_type");

-- CreateIndex
CREATE INDEX "vat_register_source_type_source_id_idx" ON "vat_register"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "withholding_records_cert_no_key" ON "withholding_records"("cert_no");

-- CreateIndex
CREATE INDEX "withholding_records_period_code_idx" ON "withholding_records"("period_code");

-- CreateIndex
CREATE INDEX "withholding_records_vendor_id_idx" ON "withholding_records"("vendor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "webhooks_processed_source_event_type_idx" ON "webhooks_processed"("source", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_processed_source_event_id_key" ON "webhooks_processed"("source", "event_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parent_code_fkey" FOREIGN KEY ("parent_code") REFERENCES "accounts"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_code_fkey" FOREIGN KEY ("period_code") REFERENCES "fiscal_periods"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_id_fkey" FOREIGN KEY ("posted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_je_id_fkey" FOREIGN KEY ("je_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_code_fkey" FOREIGN KEY ("account_code") REFERENCES "accounts"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_applications" ADD CONSTRAINT "receipt_applications_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_applications" ADD CONSTRAINT "receipt_applications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_applications" ADD CONSTRAINT "payment_applications_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_register" ADD CONSTRAINT "vat_register_filing_id_fkey" FOREIGN KEY ("filing_id") REFERENCES "tax_filings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholding_records" ADD CONSTRAINT "withholding_records_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withholding_records" ADD CONSTRAINT "withholding_records_filing_id_fkey" FOREIGN KEY ("filing_id") REFERENCES "tax_filings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

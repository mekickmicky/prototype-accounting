-- AlterTable: add is_tax_invoice and vat_inclusive flags (spec 03 §7.1), plus
-- posted_at / posted_by_id / voided_at / voided_by_id / void_reason to mirror
-- the JournalEntry lifecycle fields needed by T-3.7 (post) and T-3.8 (void).
ALTER TABLE "sales_invoices"
  ADD COLUMN "is_tax_invoice" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "vat_inclusive"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "posted_at"      TIMESTAMPTZ,
  ADD COLUMN "posted_by_id"   TEXT,
  ADD COLUMN "voided_at"      TIMESTAMPTZ,
  ADD COLUMN "voided_by_id"   TEXT,
  ADD COLUMN "void_reason"    TEXT;

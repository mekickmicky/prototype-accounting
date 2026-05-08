-- AlterTable: add vat_inclusive and lifecycle tracking fields to bills,
-- mirroring the SalesInvoice field set required by T-4.5 through T-4.8.
ALTER TABLE "bills"
  ADD COLUMN "vat_inclusive"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "posted_at"      TIMESTAMPTZ,
  ADD COLUMN "posted_by_id"   TEXT,
  ADD COLUMN "voided_at"      TIMESTAMPTZ,
  ADD COLUMN "voided_by_id"   TEXT,
  ADD COLUMN "void_reason"    TEXT;

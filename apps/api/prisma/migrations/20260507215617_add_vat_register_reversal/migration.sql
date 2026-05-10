-- This migration was generated against a dev DB that already had certain columns/constraints.
-- All operations are guarded so they are safe no-ops on a fresh database where
-- the affected columns/constraints are created later by 20260508000002/0003/0004.

-- DropForeignKey (IF EXISTS)
ALTER TABLE "vat_register" DROP CONSTRAINT IF EXISTS "vat_register_reversal_of_fkey";

-- AlterTable bills (only if posted_at already exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bills' AND column_name = 'posted_at'
  ) THEN
    EXECUTE 'ALTER TABLE "bills" ALTER COLUMN "posted_at" SET DATA TYPE TIMESTAMP(3)';
    EXECUTE 'ALTER TABLE "bills" ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3)';
  END IF;
END $$;

-- AlterTable sales_invoices (only if posted_at already exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_invoices' AND column_name = 'posted_at'
  ) THEN
    EXECUTE 'ALTER TABLE "sales_invoices" ALTER COLUMN "posted_at" SET DATA TYPE TIMESTAMP(3)';
    EXECUTE 'ALTER TABLE "sales_invoices" ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3)';
  END IF;
END $$;

-- AlterTable vendors (only if vendor_type already exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'vendor_type'
  ) THEN
    EXECUTE 'ALTER TABLE "vendors" ALTER COLUMN "vendor_type" DROP DEFAULT';
  END IF;
END $$;

-- AddForeignKey (only if reversal_of_id column exists and FK not already present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vat_register' AND column_name = 'reversal_of_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vat_register_reversal_of_id_fkey'
  ) THEN
    ALTER TABLE "vat_register" ADD CONSTRAINT "vat_register_reversal_of_id_fkey"
      FOREIGN KEY ("reversal_of_id") REFERENCES "vat_register"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RenameIndex (only if source exists and target doesn't)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'vat_register_reversal_of_id_unique')
     AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'vat_register_reversal_of_id_key') THEN
    ALTER INDEX "vat_register_reversal_of_id_unique" RENAME TO "vat_register_reversal_of_id_key";
  END IF;
END $$;

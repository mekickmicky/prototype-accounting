-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('INDIVIDUAL', 'JURISTIC');

-- AlterTable: rename withholding_rates → default_withholding_rates
ALTER TABLE "vendors" RENAME COLUMN "withholding_rates" TO "default_withholding_rates";

-- AlterTable: add vendor_type (NOT NULL; default JURISTIC handles any pre-existing rows)
ALTER TABLE "vendors" ADD COLUMN "vendor_type" "VendorType" NOT NULL DEFAULT 'JURISTIC';

-- CreateIndex
CREATE INDEX "vendors_vendor_type_idx" ON "vendors"("vendor_type");

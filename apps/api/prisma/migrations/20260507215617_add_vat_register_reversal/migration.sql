-- DropForeignKey
ALTER TABLE "vat_register" DROP CONSTRAINT "vat_register_reversal_of_fkey";

-- AlterTable
ALTER TABLE "bills" ALTER COLUMN "posted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sales_invoices" ALTER COLUMN "posted_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "voided_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vendors" ALTER COLUMN "vendor_type" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "vat_register" ADD CONSTRAINT "vat_register_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "vat_register"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "vat_register_reversal_of_id_unique" RENAME TO "vat_register_reversal_of_id_key";

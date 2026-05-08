-- Add nullable bill_id link to withholding_records (T-4.11).
-- Each WHT certificate is issued at payment post; spec T-4.11 requires the
-- cert to back-link to the source bill (one cert per applied bill+line).
-- Nullable so historical rows / future non-bill-derived WHT (rare) still fit.
ALTER TABLE "withholding_records"
  ADD COLUMN "bill_id" TEXT;

ALTER TABLE "withholding_records"
  ADD CONSTRAINT "withholding_records_bill_id_fkey"
  FOREIGN KEY ("bill_id") REFERENCES "bills"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "withholding_records_bill_id_idx" ON "withholding_records"("bill_id");

-- AlterTable: add status and voided_at to withholding_records so a payment
-- void (T-4.12, spec 02 §5.3) can mark the associated WHT certificates VOID
-- without deleting the row (cert_no is sequential and must remain unique).
ALTER TABLE "withholding_records"
  ADD COLUMN "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "voided_at" TIMESTAMPTZ;

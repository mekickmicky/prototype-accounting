-- AlterTable: add voided_at / voided_by_id / void_reason to payments so
-- T-4.12 (PaymentService.void) can stamp the lifecycle fields described in
-- spec 02 §5.2.
ALTER TABLE "payments"
  ADD COLUMN "voided_at"    TIMESTAMPTZ,
  ADD COLUMN "voided_by_id" TEXT,
  ADD COLUMN "void_reason"  TEXT;

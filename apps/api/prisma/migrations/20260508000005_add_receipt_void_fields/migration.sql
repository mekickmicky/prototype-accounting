-- AlterTable: add voided_at / voided_by_id / void_reason to receipts so
-- T-3.13 (ReceiptService.void) can stamp the lifecycle fields described in
-- spec 02 §5.2.
ALTER TABLE "receipts"
  ADD COLUMN "voided_at"    TIMESTAMPTZ,
  ADD COLUMN "voided_by_id" TEXT,
  ADD COLUMN "void_reason"  TEXT;

-- T-3.8: VatRegister reversal support.
-- When a posted SalesInvoice is voided, its VatRegister row is offset by a
-- reversing row carrying negative amounts and a reversal_of_id back-pointer.
-- This lets PP30 aggregation simply SUM(net_amount, vat_amount, gross_amount)
-- without filtering — the reversal nets the original to zero.

ALTER TABLE "vat_register"
  ADD COLUMN "reversal_of_id" TEXT;

ALTER TABLE "vat_register"
  ADD CONSTRAINT "vat_register_reversal_of_id_key" UNIQUE ("reversal_of_id");

ALTER TABLE "vat_register"
  ADD CONSTRAINT "vat_register_reversal_of_id_fkey"
  FOREIGN KEY ("reversal_of_id") REFERENCES "vat_register"("id");

-- Replace the non-negative amounts constraint to allow negative values strictly
-- on reversal rows; original rows keep the positivity invariant.
ALTER TABLE "vat_register"
  DROP CONSTRAINT "vat_register_amounts_non_negative";

ALTER TABLE "vat_register"
  ADD CONSTRAINT "vat_register_amounts_signed"
  CHECK (
    (
      "reversal_of_id" IS NULL
      AND "net_amount" >= 0
      AND "vat_amount" >= 0
      AND "gross_amount" >= 0
    )
    OR (
      "reversal_of_id" IS NOT NULL
      AND "net_amount" <= 0
      AND "vat_amount" <= 0
      AND "gross_amount" <= 0
    )
  );

ALTER TABLE "vat_register"
  ADD CONSTRAINT "vat_register_vat_rate_non_negative"
  CHECK ("vat_rate" >= 0);

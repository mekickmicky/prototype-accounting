-- T-4.7: VatRegister.claimable flag.
-- Per spec 03 §3, input VAT is only claimable if the vendor's tax invoice is
-- valid (vendor.tax_id present and vendor_invoice_no not blank). When either
-- check fails at bill post time, the row is inserted with claimable=false.
-- The accountant can re-flag rows later from the PP30 preview screen.
-- Existing rows (all OUTPUT to date) default to true.

ALTER TABLE "vat_register"
  ADD COLUMN "claimable" BOOLEAN NOT NULL DEFAULT TRUE;

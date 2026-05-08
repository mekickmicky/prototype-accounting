import { z } from "zod";
import { PeriodCode, PaginationQuery } from "./common";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const TaxFilingTypeSchema = z.enum(["PP30", "PND3", "PND53"]);
export type TaxFilingType = z.infer<typeof TaxFilingTypeSchema>;

export const TaxFilingStatusSchema = z.enum([
  "DRAFT",
  "FINALIZED",
  "SUBMITTED",
  "VOID",
]);
export type TaxFilingStatus = z.infer<typeof TaxFilingStatusSchema>;

// ── List ──────────────────────────────────────────────────────────────────────

export const ListTaxFilingsQuery = PaginationQuery.extend({
  type: TaxFilingTypeSchema.optional(),
  period: PeriodCode.optional(),
});
export type ListTaxFilingsQueryType = z.infer<typeof ListTaxFilingsQuery>;

// ── PP30 ──────────────────────────────────────────────────────────────────────

export const PreviewPP30Body = z.object({
  period: PeriodCode,
});
export type PreviewPP30BodyType = z.infer<typeof PreviewPP30Body>;

export const CreatePP30Body = z.object({
  period: PeriodCode,
});
export type CreatePP30BodyType = z.infer<typeof CreatePP30Body>;

// ── PND3 ──────────────────────────────────────────────────────────────────────

export const PreviewPND3Body = z.object({
  period: PeriodCode,
});
export type PreviewPND3BodyType = z.infer<typeof PreviewPND3Body>;

export const CreatePND3Body = z.object({
  period: PeriodCode,
});
export type CreatePND3BodyType = z.infer<typeof CreatePND3Body>;

// ── PND53 ─────────────────────────────────────────────────────────────────────

export const PreviewPND53Body = z.object({
  period: PeriodCode,
});
export type PreviewPND53BodyType = z.infer<typeof PreviewPND53Body>;

export const CreatePND53Body = z.object({
  period: PeriodCode,
});
export type CreatePND53BodyType = z.infer<typeof CreatePND53Body>;

// ── Shared lifecycle bodies ───────────────────────────────────────────────────

export const FlagNonClaimableBody = z.object({
  vat_register_ids: z.array(z.string().min(1)).min(1),
});
export type FlagNonClaimableBodyType = z.infer<typeof FlagNonClaimableBody>;

export const SubmitFilingBody = z.object({
  submission_date: z.string().date(),
  submission_ref: z.string().min(1),
});
export type SubmitFilingBodyType = z.infer<typeof SubmitFilingBody>;

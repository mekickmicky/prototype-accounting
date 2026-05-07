import { z } from "zod";

export const MoneyString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a valid money string (e.g. "1234.56")');

export const PeriodCode = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format");

export const BranchCode = z.enum(["TL", "EK", "RAMA9"]);
export type BranchCodeType = z.infer<typeof BranchCode>;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});
export type PaginationQueryType = z.infer<typeof PaginationQuery>;

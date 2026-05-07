import { z } from "zod";
import { MoneyString, PeriodCode, BranchCode } from "./common";

// ── Account types ─────────────────────────────────────────────────────────────

export const AccountType = z.enum([
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
]);
export type AccountTypeType = z.infer<typeof AccountType>;

// GET /accounts
export const ListAccountsQuery = z.object({
  type: AccountType.optional(),
  active: z.coerce.boolean().optional(),
  parent_code: z.string().optional(),
});
export type ListAccountsQueryType = z.infer<typeof ListAccountsQuery>;

// POST /accounts (admin)
export const CreateAccountBody = z.object({
  code: z.string().regex(/^\d{4,5}$/),
  name_en: z.string().min(1),
  name_th: z.string().min(1),
  type: AccountType,
  parent_code: z.string().optional(),
  is_postable: z.boolean().default(true),
});
export type CreateAccountBodyType = z.infer<typeof CreateAccountBody>;

// PATCH /accounts/:code (admin) — only name_en, name_th, is_active
export const UpdateAccountBody = z.object({
  name_en: z.string().min(1).optional(),
  name_th: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateAccountBodyType = z.infer<typeof UpdateAccountBody>;

// ── JE source types ───────────────────────────────────────────────────────────

export const JESourceType = z.enum([
  "MANUAL",
  "SALES_INVOICE",
  "RECEIPT",
  "BILL",
  "PAYMENT",
  "TAX_FILING",
  "BANK_TRANSFER",
  "STOCK_EXPORT",
  "RECURRING",
  "ADJUSTMENT",
  "REVERSAL",
]);
export type JESourceTypeType = z.infer<typeof JESourceType>;

export const JEStatus = z.enum(["DRAFT", "POSTED", "VOID"]);
export type JEStatusType = z.infer<typeof JEStatus>;

// Single line in a journal entry
export const JELineBody = z.object({
  account_code: z.string(),
  branch_code: z.string().optional(),
  debit: MoneyString.default("0"),
  credit: MoneyString.default("0"),
  description: z.string().optional(),
  dim_dept: z.string().optional(),
  dim_project: z.string().optional(),
  dim_doctor_id: z.string().optional(),
});
export type JELineBodyType = z.infer<typeof JELineBody>;

// POST /journal-entries — create draft
export const CreateJEBody = z.object({
  entry_date: z.string().date(),
  branch_code: BranchCode,
  description: z.string().min(1),
  source_type: JESourceType,
  source_id: z.string().optional(),
  lines: z.array(JELineBody).min(2),
});
export type CreateJEBodyType = z.infer<typeof CreateJEBody>;

// PATCH /journal-entries/:id — same shape as create (DRAFT only)
export const UpdateJEBody = CreateJEBody;
export type UpdateJEBodyType = CreateJEBodyType;

// POST /journal-entries/:id/void
export const VoidJEBody = z.object({
  reason: z.string().min(3),
});
export type VoidJEBodyType = z.infer<typeof VoidJEBody>;

// GET /journal-entries query params
export const ListJEsQuery = z.object({
  period: PeriodCode.optional(),
  branch: BranchCode.optional(),
  status: JEStatus.optional(),
  source_type: JESourceType.optional(),
  q: z.string().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  account: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});
export type ListJEsQueryType = z.infer<typeof ListJEsQuery>;

// ── Period schemas ────────────────────────────────────────────────────────────

// POST /periods/:code/close
export const ClosePeriodBody = z.object({
  confirm: z.literal(true),
});
export type ClosePeriodBodyType = z.infer<typeof ClosePeriodBody>;

// POST /periods/:code/reopen (admin)
export const ReopenPeriodBody = z.object({
  reason: z.string().min(10),
});
export type ReopenPeriodBodyType = z.infer<typeof ReopenPeriodBody>;

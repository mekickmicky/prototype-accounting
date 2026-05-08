import { z } from "zod";
import { MoneyString, PeriodCode, BranchCode, PaginationQuery } from "./common";

// ── Customer ──────────────────────────────────────────────────────────────────

export const CreateCustomerBody = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  name_th: z.string().optional(),
  tax_id: z
    .string()
    .regex(/^\d{13}$/, "Must be 13-digit Thai tax ID")
    .optional(),
  branch_office: z.string().default("00000"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  payment_terms_days: z.number().int().min(0).default(0),
});
export type CreateCustomerBodyType = z.infer<typeof CreateCustomerBody>;

export const UpdateCustomerBody = z.object({
  name: z.string().min(1).optional(),
  name_th: z.string().optional(),
  tax_id: z
    .string()
    .regex(/^\d{13}$/, "Must be 13-digit Thai tax ID")
    .optional(),
  branch_office: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  payment_terms_days: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateCustomerBodyType = z.infer<typeof UpdateCustomerBody>;

export const ListCustomersQuery = PaginationQuery.extend({
  q: z.string().optional(),
  active: z.coerce.boolean().optional(),
});
export type ListCustomersQueryType = z.infer<typeof ListCustomersQuery>;

// ── Sales Invoice ─────────────────────────────────────────────────────────────

export const SalesInvoiceLineBody = z.object({
  description: z.string().min(1),
  service_code: z.string().optional(),
  product_code: z.string().optional(),
  qty: MoneyString.default("1"),
  unit_price: MoneyString,
  discount: MoneyString.default("0"),
  vat_rate: MoneyString.default("7"),
  revenue_account_code: z.string().min(1),
});
export type SalesInvoiceLineBodyType = z.infer<typeof SalesInvoiceLineBody>;

export const CreateSalesInvoiceBody = z.object({
  customer_id: z.string().min(1),
  branch_code: BranchCode,
  issue_date: z.string().date(),
  due_date: z.string().date(),
  is_tax_invoice: z.boolean().default(false),
  vat_inclusive: z.boolean().default(true),
  notes: z.string().optional(),
  source_type: z.string().optional(),
  source_ref: z.string().optional(),
  lines: z.array(SalesInvoiceLineBody).min(1),
});
export type CreateSalesInvoiceBodyType = z.infer<typeof CreateSalesInvoiceBody>;

export const UpdateSalesInvoiceBody = CreateSalesInvoiceBody.partial().extend({
  lines: z.array(SalesInvoiceLineBody).min(1).optional(),
});
export type UpdateSalesInvoiceBodyType = z.infer<typeof UpdateSalesInvoiceBody>;

export const VoidSalesInvoiceBody = z.object({
  reason: z.string().min(3),
});
export type VoidSalesInvoiceBodyType = z.infer<typeof VoidSalesInvoiceBody>;

export const ListSalesInvoicesQuery = PaginationQuery.extend({
  customer_id: z.string().optional(),
  status: z
    .enum(["DRAFT", "POSTED", "PARTIAL_PAID", "PAID", "VOID"])
    .optional(),
  overdue: z.coerce.boolean().optional(),
  period: PeriodCode.optional(),
  branch: BranchCode.optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  q: z.string().optional(),
});
export type ListSalesInvoicesQueryType = z.infer<typeof ListSalesInvoicesQuery>;

// ── Receipt ───────────────────────────────────────────────────────────────────

export const PaymentMethod = z.enum([
  "CASH",
  "TRANSFER",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "QR",
  "CHEQUE",
  "OTHER",
]);
export type PaymentMethodType = z.infer<typeof PaymentMethod>;

export const ReceiptApplicationBody = z.object({
  invoice_id: z.string().min(1),
  applied_amount: MoneyString,
});
export type ReceiptApplicationBodyType = z.infer<typeof ReceiptApplicationBody>;

export const CreateReceiptBody = z
  .object({
    customer_id: z.string().min(1),
    branch_code: BranchCode,
    receipt_date: z.string().date(),
    total_amount: MoneyString,
    payment_method: PaymentMethod,
    bank_account_id: z.string().optional(),
    card_fee: MoneyString.default("0"),
    slip_ref: z.string().optional(),
    notes: z.string().optional(),
    applications: z.array(ReceiptApplicationBody).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.payment_method !== "CASH" && !val.bank_account_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "bank_account_id required for non-cash payment methods",
        path: ["bank_account_id"],
      });
    }
  });
export type CreateReceiptBodyType = z.infer<typeof CreateReceiptBody>;

export const UpdateReceiptBody = z.object({
  receipt_date: z.string().date().optional(),
  payment_method: PaymentMethod.optional(),
  bank_account_id: z.string().optional(),
  card_fee: MoneyString.optional(),
  slip_ref: z.string().optional(),
  notes: z.string().optional(),
});
export type UpdateReceiptBodyType = z.infer<typeof UpdateReceiptBody>;

export const VoidReceiptBody = z.object({
  reason: z.string().min(3),
});
export type VoidReceiptBodyType = z.infer<typeof VoidReceiptBody>;

export const ListReceiptsQuery = PaginationQuery.extend({
  customer_id: z.string().optional(),
  status: z.enum(["DRAFT", "POSTED", "VOID"]).optional(),
  payment_method: PaymentMethod.optional(),
  period: PeriodCode.optional(),
  branch: BranchCode.optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  q: z.string().optional(),
});
export type ListReceiptsQueryType = z.infer<typeof ListReceiptsQuery>;

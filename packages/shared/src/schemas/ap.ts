import { z } from "zod";
import { MoneyString, PeriodCode, BranchCode, PaginationQuery } from "./common";
import { PaymentMethod } from "./ar";

// ── Vendor ────────────────────────────────────────────────────────────────────

export const VendorTypeSchema = z.enum(["INDIVIDUAL", "JURISTIC"]);

export const CreateVendorBody = z.object({
  code: z.string().optional(),
  name: z.string().min(1),
  name_th: z.string().optional(),
  vendor_type: VendorTypeSchema.default("JURISTIC"),
  tax_id: z
    .string()
    .regex(/^\d{13}$/, "Must be 13-digit Thai tax ID")
    .optional(),
  branch_office: z.string().default("00000"),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  payment_terms_days: z.number().int().min(0).default(0),
  default_ap_account_code: z.string().optional(),
});
export type CreateVendorBodyType = z.infer<typeof CreateVendorBody>;

export const UpdateVendorBody = z.object({
  name: z.string().min(1).optional(),
  name_th: z.string().optional(),
  vendor_type: VendorTypeSchema.optional(),
  tax_id: z
    .string()
    .regex(/^\d{13}$/, "Must be 13-digit Thai tax ID")
    .optional(),
  branch_office: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  payment_terms_days: z.number().int().min(0).optional(),
  default_ap_account_code: z.string().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateVendorBodyType = z.infer<typeof UpdateVendorBody>;

export const ListVendorsQuery = PaginationQuery.extend({
  q: z.string().optional(),
  vendor_type: VendorTypeSchema.optional(),
  active: z.coerce.boolean().optional(),
});
export type ListVendorsQueryType = z.infer<typeof ListVendorsQuery>;

// ── Bill ──────────────────────────────────────────────────────────────────────

export const BillLineBody = z.object({
  description: z.string().min(1),
  expense_account_code: z.string().min(1),
  qty: MoneyString.default("1"),
  unit_price: MoneyString,
  vat_rate: MoneyString.default("7"),
  withholding_rate: MoneyString.default("0"),
  withholding_type: z.string().optional(),
});
export type BillLineBodyType = z.infer<typeof BillLineBody>;

export const CreateBillBody = z.object({
  vendor_id: z.string().min(1),
  vendor_invoice_no: z.string().optional(),
  branch_code: BranchCode,
  issue_date: z.string().date(),
  due_date: z.string().date(),
  vat_inclusive: z.boolean().default(true),
  notes: z.string().optional(),
  lines: z.array(BillLineBody).min(1),
});
export type CreateBillBodyType = z.infer<typeof CreateBillBody>;

export const UpdateBillBody = CreateBillBody.partial().extend({
  lines: z.array(BillLineBody).min(1).optional(),
});
export type UpdateBillBodyType = z.infer<typeof UpdateBillBody>;

export const VoidBillBody = z.object({
  reason: z.string().min(3),
});
export type VoidBillBodyType = z.infer<typeof VoidBillBody>;

export const ListBillsQuery = PaginationQuery.extend({
  vendor_id: z.string().optional(),
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
export type ListBillsQueryType = z.infer<typeof ListBillsQuery>;

// ── Payment ───────────────────────────────────────────────────────────────────

export const PaymentApplicationBody = z.object({
  bill_id: z.string().min(1),
  applied_amount: MoneyString,
});
export type PaymentApplicationBodyType = z.infer<typeof PaymentApplicationBody>;

export const CreatePaymentBody = z
  .object({
    vendor_id: z.string().min(1),
    branch_code: BranchCode,
    payment_date: z.string().date(),
    total_amount: MoneyString,
    payment_method: PaymentMethod,
    bank_account_id: z.string().optional(),
    cheque_no: z.string().optional(),
    notes: z.string().optional(),
    applications: z.array(PaymentApplicationBody).default([]),
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
export type CreatePaymentBodyType = z.infer<typeof CreatePaymentBody>;

export const UpdatePaymentBody = z.object({
  payment_date: z.string().date().optional(),
  payment_method: PaymentMethod.optional(),
  bank_account_id: z.string().optional(),
  cheque_no: z.string().optional(),
  notes: z.string().optional(),
});
export type UpdatePaymentBodyType = z.infer<typeof UpdatePaymentBody>;

export const VoidPaymentBody = z.object({
  reason: z.string().min(3),
});
export type VoidPaymentBodyType = z.infer<typeof VoidPaymentBody>;

export const ListPaymentsQuery = PaginationQuery.extend({
  vendor_id: z.string().optional(),
  status: z.enum(["DRAFT", "POSTED", "VOID"]).optional(),
  payment_method: PaymentMethod.optional(),
  period: PeriodCode.optional(),
  branch: BranchCode.optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  q: z.string().optional(),
});
export type ListPaymentsQueryType = z.infer<typeof ListPaymentsQuery>;

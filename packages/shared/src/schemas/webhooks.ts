import { z } from "zod";
import { BranchCode, MoneyString, PeriodCode } from "./common";

// ─── Visit Completed (wind-clinic → wind-accounting) ───────────────────────

const VisitItemSchema = z.object({
  type: z.enum(["service", "product"]),
  code: z.string().min(1),
  name: z.string().min(1),
  name_th: z.string().optional(),
  qty: z.number().positive(),
  unit_price: MoneyString,
  discount: MoneyString.optional(),
  doctor_id: z.string().optional(),
  doctor_commission_pct: z.number().min(0).max(100).optional(),
});

const PaymentSchema = z.object({
  method: z.enum([
    "CASH",
    "TRANSFER",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "QR",
    "CHEQUE",
    "OTHER",
  ]),
  amount: MoneyString,
  bank_account_code: z.string().optional(),
  card_fee: MoneyString.optional(),
  slip_ref: z.string().optional(),
});

export const VisitCompletedSchema = z.object({
  event: z.literal("visit.completed"),
  visit_id: z.string().min(1),
  patient_id: z.string().min(1),
  patient_name: z.string().min(1),
  patient_name_th: z.string().optional(),
  patient_tax_id: z
    .string()
    .regex(/^\d{13}$/, "Tax ID must be 13 digits")
    .optional(),
  patient_address: z.string().optional(),
  patient_phone: z.string().optional(),
  branch_code: BranchCode,
  visit_date: z.string().datetime({ offset: true }),
  completed_at: z.string().datetime({ offset: true }),
  request_full_tax_invoice: z.boolean(),
  items: z.array(VisitItemSchema).min(1),
  payment: PaymentSchema,
  notes: z.string().optional(),
});

export type VisitCompletedPayload = z.infer<typeof VisitCompletedSchema>;

// ─── Period Export (wind-stock → wind-accounting) ──────────────────────────

const StockEntryLineSchema = z.object({
  account_code: z.string().min(1),
  debit: MoneyString,
  credit: MoneyString,
  description: z.string().optional(),
});

const StockEntrySchema = z.object({
  type: z.enum([
    "RECEIPT",
    "ISSUE",
    "TRANSFER",
    "COUNT",
    "DAMAGE",
    "EXPIRED",
    "THEFT",
    "OTHER",
  ]),
  date: z.string().datetime({ offset: true }),
  description: z.string().min(1),
  source_doc_no: z.string().min(1),
  source_doc_id: z.string().min(1),
  lines: z.array(StockEntryLineSchema).min(2),
});

export const PeriodExportSchema = z.object({
  event: z.literal("stock.period_export"),
  export_id: z.string().min(1),
  period_code: PeriodCode,
  branch_code: BranchCode,
  exported_at: z.string().datetime({ offset: true }),
  source_summary: z.object({
    receipts: z.number().int().min(0),
    issues: z.number().int().min(0),
    transfers: z.number().int().min(0),
    adjustments: z.number().int().min(0),
    counts: z.number().int().min(0),
  }),
  entries: z.array(StockEntrySchema).min(1),
});

export type PeriodExportPayload = z.infer<typeof PeriodExportSchema>;

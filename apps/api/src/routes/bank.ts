import { Elysia } from 'elysia';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { getBankProvider } from '../lib/bank';
import { importStatement } from '../services/bank-import';
import {
  match,
  unmatch,
  ignoreTxn,
  createJEFromTxn,
  getReconciliationView,
} from '../services/bank-reconciliation';

const VerifySlipBody = z.object({
  slip_ref: z.string().min(1),
  expected_amount: z.string().optional(),
  expected_date: z.string().optional(),
});

const ReconcileBody = z.object({
  bank_txn_id: z.string().min(1),
  document_type: z.enum(['RECEIPT', 'PAYMENT']),
  document_id: z.string().min(1),
});

const UnmatchBody = z.object({
  bank_txn_id: z.string().min(1),
  reason: z.string().default(''),
});

const IgnoreTxnBody = z.object({
  bank_txn_id: z.string().min(1),
  reason: z.string().default(''),
});

const JELineInput = z.object({
  account_code: z.string().min(1),
  branch_code: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  description: z.string().optional(),
  dim_dept: z.string().optional(),
  dim_project: z.string().optional(),
  dim_doctor_id: z.string().optional(),
});

const CreateJEFromTxnBody = z.object({
  bank_txn_id: z.string().min(1),
  je: z.object({
    entry_date: z.string(),
    branch_code: z.string().min(1),
    description: z.string().min(1),
    lines: z.array(JELineInput).min(2),
  }),
});

const ImportBody = z.object({
  bank_account_id: z.string().min(1),
  csv_content: z.string().optional(),
  use_mock_data: z.boolean().optional(),
  date_from: z.string().date(),
  date_to: z.string().date(),
});

export const bankRoutes = new Elysia({ prefix: '/bank' })
  .use(authGuard)

  // POST /bank/import — import bank transactions from mock or CSV
  .post('/import', async ({ body, cookie }) => {
    const parsed = ImportBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { bank_account_id, csv_content, use_mock_data, date_from, date_to } = parsed.data;

    const actorId = (cookie as Record<string, { value?: string }>)['wind-acc-session']?.value;

    const result = await importStatement(
      bank_account_id,
      {
        use_mock: use_mock_data ?? false,
        csv_content,
        date_from: new Date(date_from),
        date_to: new Date(date_to),
      },
      actorId,
    );

    return {
      success: true as const,
      data: result,
    };
  })

  // GET /bank/reconciliation/:account_id — composite view for reconcile workspace
  .get('/reconciliation/:account_id', async ({ params }) => {
    const view = await getReconciliationView(params.account_id);
    return {
      success: true as const,
      data: {
        bank_account_id: view.bank_account_id,
        unmatched_bank_txns: view.unmatched_bank_txns.map((t) => ({
          ...t,
          debit: t.debit.toString(),
          credit: t.credit.toString(),
        })),
        unmatched_documents: view.unmatched_documents.map((d) => ({
          type: d.type,
          id: d.id,
          no: d.no,
          date: d.date,
          amount: d.amount.toString(),
          counterpartyName: d.counterpartyName,
        })),
        suggestions_per_txn: Object.fromEntries(
          Object.entries(view.suggestions_per_txn).map(([txnId, suggestions]) => [
            txnId,
            suggestions.map((s) => ({
              document_type: s.type,
              document_id: s.id,
              document_no: s.no,
              document_date: s.date,
              document_amount: s.amount.toString(),
              confidence: s.confidence,
              tier: s.tier,
              counterparty_name: s.counterpartyName,
              days_diff: s.daysDiff,
            })),
          ]),
        ),
      },
    };
  })

  // POST /bank/reconcile — match a bank txn to a Receipt or Payment
  .post('/reconcile', async ({ body, cookie }) => {
    const parsed = ReconcileBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const actorId =
      (cookie as Record<string, { value?: string }>)['wind-acc-session']?.value ?? 'system';
    const { bank_txn_id, document_type, document_id } = parsed.data;
    const txn = await match(bank_txn_id, document_type, document_id, actorId);
    return {
      success: true as const,
      data: {
        ...txn,
        debit: txn.debit.toString(),
        credit: txn.credit.toString(),
      },
    };
  })

  // POST /bank/unmatch — clear a reconcile link
  .post('/unmatch', async ({ body, cookie }) => {
    const parsed = UnmatchBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const actorId =
      (cookie as Record<string, { value?: string }>)['wind-acc-session']?.value ?? 'system';
    const { bank_txn_id, reason } = parsed.data;
    const txn = await unmatch(bank_txn_id, actorId, reason);
    return {
      success: true as const,
      data: {
        ...txn,
        debit: txn.debit.toString(),
        credit: txn.credit.toString(),
      },
    };
  })

  // POST /bank/ignore-txn — mark bank txn as IGNORED
  .post('/ignore-txn', async ({ body, cookie }) => {
    const parsed = IgnoreTxnBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const actorId =
      (cookie as Record<string, { value?: string }>)['wind-acc-session']?.value ?? 'system';
    const { bank_txn_id, reason } = parsed.data;
    const txn = await ignoreTxn(bank_txn_id, actorId, reason);
    return {
      success: true as const,
      data: {
        ...txn,
        debit: txn.debit.toString(),
        credit: txn.credit.toString(),
      },
    };
  })

  // POST /bank/create-je-from-txn — create+post a JE and link bank txn as BANK_FEE
  .post('/create-je-from-txn', async ({ body, cookie }) => {
    const parsed = CreateJEFromTxnBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const actorId =
      (cookie as Record<string, { value?: string }>)['wind-acc-session']?.value ?? 'system';
    const { bank_txn_id, je } = parsed.data;
    const result = await createJEFromTxn(bank_txn_id, { ...je, source_type: 'MANUAL' }, actorId);
    return {
      success: true as const,
      data: {
        je_id: result.je.id,
        je_no: result.je.je_no,
        bank_txn: {
          ...result.bank_txn,
          debit: result.bank_txn.debit.toString(),
          credit: result.bank_txn.credit.toString(),
        },
      },
    };
  })

  // POST /bank/verify-slip — calls provider.verifySlip; mock-predictable for testing
  .post('/verify-slip', async ({ body }) => {
    const parsed = VerifySlipBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { slip_ref, expected_amount, expected_date } = parsed.data;

    const result = await getBankProvider().verifySlip({
      slipRef: slip_ref,
      expectedAmount: expected_amount !== undefined ? new Decimal(expected_amount) : undefined,
      expectedDate: expected_date !== undefined ? new Date(expected_date) : undefined,
    });

    return {
      success: true as const,
      data: {
        verified: result.verified,
        reason: result.reason,
        details: result.details
          ? {
              transRef: result.details.transRef,
              transDate: result.details.transDate,
              sender: result.details.sender,
              receiver: result.details.receiver,
              amount: result.details.amount.toString(),
            }
          : undefined,
      },
    };
  });

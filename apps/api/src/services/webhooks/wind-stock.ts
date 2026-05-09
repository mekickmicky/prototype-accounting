import type { Prisma } from '@prisma/client';
import { D, sumD, type PeriodExportPayload } from '@wind-acc/shared';
import { prisma } from '../../lib/prisma';
import { BusinessRuleError } from '../../lib/errors';
import { withIdempotency } from '../../lib/webhook-idempotency';
import { createDraft, postInTx } from '../journal-entry';

type Tx = Prisma.TransactionClient;

const SYSTEM_ACTOR_ID = 'SYSTEM';
const WEBHOOK_SOURCE = 'wind-stock';

export interface PeriodExportResult {
  period: string;
  created_count: number;
  first_je: string | null;
  last_je: string | null;
}

/**
 * Process a wind-stock period-export webhook (spec 09 §2).
 *
 * Atomicity: the entire import runs inside one `prisma.$transaction`. ANY
 * failure — period not open, missing account code, unbalanced entry, JE post
 * error — rolls back every JE created in this call. The `WebhookProcessed`
 * idempotency record is only persisted when all entries succeed (since
 * `withIdempotency` writes the record after `fn()` returns).
 *
 * Replays of a successful import return the original result with `replayed=true`.
 */
export async function handlePeriodExport(
  payload: PeriodExportPayload,
): Promise<{ result: PeriodExportResult; replayed: boolean }> {
  return prisma.$transaction(tx =>
    withIdempotency<PeriodExportResult>(
      tx,
      WEBHOOK_SOURCE,
      payload.export_id,
      () => processPeriodExport(tx, payload),
    ),
  );
}

async function processPeriodExport(
  tx: Tx,
  payload: PeriodExportPayload,
): Promise<PeriodExportResult> {
  // 1. Period must be OPEN. Per spec 09 §2, throw PERIOD_NOT_OPEN for both
  // missing and non-OPEN periods (we don't allow auto-creating a period as a
  // side effect of a stock import).
  const period = await tx.fiscalPeriod.findUnique({
    where: { code: payload.period_code },
  });
  if (!period || period.status !== 'OPEN') {
    throw new BusinessRuleError('PERIOD_NOT_OPEN', {
      period_code: payload.period_code,
      status: period?.status ?? 'MISSING',
    });
  }

  // 2. Pre-validate ALL account codes in a single SELECT — fail fast with the
  // full missing list before doing any per-entry work.
  const accountCodeSet = new Set<string>();
  for (const entry of payload.entries) {
    for (const line of entry.lines) {
      accountCodeSet.add(line.account_code);
    }
  }
  const accountCodes = [...accountCodeSet];
  const foundAccounts = await tx.account.findMany({
    where: { code: { in: accountCodes } },
    select: { code: true },
  });
  if (foundAccounts.length !== accountCodes.length) {
    const foundSet = new Set(foundAccounts.map(a => a.code));
    const missing = accountCodes.filter(c => !foundSet.has(c));
    throw new BusinessRuleError('ACCOUNT_NOT_FOUND', { missing });
  }

  // 3. Pre-validate per-entry balance so an unbalanced entry rolls the import
  // back BEFORE any JE is created. Defense in depth — `createDraft` also
  // checks balance, but we want the error to name the offending source doc.
  for (const entry of payload.entries) {
    const totalDebit = sumD(entry.lines.map(l => D(l.debit)));
    const totalCredit = sumD(entry.lines.map(l => D(l.credit)));
    if (!totalDebit.eq(totalCredit)) {
      throw new BusinessRuleError('JE_NOT_BALANCED', {
        source_doc_no: entry.source_doc_no,
        total_debit: totalDebit.toFixed(2),
        total_credit: totalCredit.toFixed(2),
        difference: totalDebit.minus(totalCredit).toFixed(2),
      });
    }
  }

  // 4. Bulk-create + post JEs. Each entry becomes its own JE with
  // source_type=STOCK_EXPORT and a `[STOCK]` description prefix.
  const createdJeNos: string[] = [];
  for (const entry of payload.entries) {
    const draft = await createDraft(
      tx,
      {
        entry_date: new Date(entry.date),
        branch_code: payload.branch_code,
        description: `[STOCK] ${entry.description}`,
        source_type: 'STOCK_EXPORT',
        source_id: entry.source_doc_id,
        lines: entry.lines.map(l => ({
          account_code: l.account_code,
          branch_code: payload.branch_code,
          debit: l.debit,
          credit: l.credit,
          description: l.description ?? entry.description,
        })),
      },
      SYSTEM_ACTOR_ID,
    );

    const posted = await postInTx(tx, draft.id, SYSTEM_ACTOR_ID);
    createdJeNos.push(posted.je_no);
  }

  return {
    period: payload.period_code,
    created_count: createdJeNos.length,
    first_je: createdJeNos[0] ?? null,
    last_je: createdJeNos[createdJeNos.length - 1] ?? null,
  };
}

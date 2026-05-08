import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { Decimal } from '@wind-acc/shared';
import { logAuditEvent } from './audit-log';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';
import { getBankProvider } from '../lib/bank';
import { parseBankCSV } from '../lib/bank/csv-parser';
import type { BankTransactionRaw } from '../lib/bank/provider';

type Tx = Prisma.TransactionClient;

export interface ImportSource {
  use_mock?: boolean;
  csv_content?: string;
  date_from: Date;
  date_to: Date;
}

export interface ImportStatementResult {
  imported: number;
  skipped: number;
}

function dedupKey(bank_account_id: string, raw: BankTransactionRaw): string {
  const ref = raw.bankRef?.trim() ?? '';
  if (ref.length > 0) return `R|${bank_account_id}|${ref}`;
  const dateKey = raw.txnDate.toISOString().slice(0, 10);
  const debit = raw.debit.toFixed(2);
  const credit = raw.credit.toFixed(2);
  const hash = crypto
    .createHash('sha256')
    .update(`${bank_account_id}|${dateKey}|${raw.description}|${debit}|${credit}`)
    .digest('hex');
  return `H|${hash}`;
}

export async function importStatement(
  bank_account_id: string,
  source: ImportSource,
  actor_id?: string,
): Promise<ImportStatementResult> {
  if (!source.use_mock && (source.csv_content === undefined || source.csv_content.length === 0)) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'must specify use_mock=true or csv_content',
    });
  }
  if (source.use_mock && source.csv_content !== undefined) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'cannot combine use_mock with csv_content',
    });
  }
  if (source.date_from.getTime() > source.date_to.getTime()) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'date_from must be on or before date_to',
    });
  }

  const bankAccount = await db.bankAccount.findUnique({ where: { id: bank_account_id } });
  if (!bankAccount) throw new BusinessRuleError('NOT_FOUND', { bank_account_id });

  let raws: BankTransactionRaw[];
  if (source.use_mock) {
    raws = await getBankProvider().importStatement({
      bankAccountCode: bankAccount.code,
      dateFrom: source.date_from,
      dateTo: source.date_to,
    });
  } else {
    raws = parseBankCSV(source.csv_content as string);
  }

  raws = raws.filter(
    (r) =>
      r.txnDate.getTime() >= source.date_from.getTime() &&
      r.txnDate.getTime() <= source.date_to.getTime(),
  );

  return db.$transaction(async (tx: Tx) => {
    const knownRefs = raws.map((r) => r.bankRef?.trim()).filter((s): s is string => !!s && s.length > 0);

    const existing = await tx.bankTransaction.findMany({
      where: {
        bank_account_id,
        OR: [
          { txn_date: { gte: source.date_from, lte: source.date_to } },
          ...(knownRefs.length > 0 ? [{ bank_ref: { in: knownRefs } }] : []),
        ],
      },
      select: {
        txn_date: true,
        description: true,
        debit: true,
        credit: true,
        bank_ref: true,
      },
    });

    const seen = new Set<string>();
    for (const row of existing) {
      seen.add(
        dedupKey(bank_account_id, {
          txnDate: row.txn_date,
          description: row.description,
          debit: new Decimal(row.debit.toString()),
          credit: new Decimal(row.credit.toString()),
          bankRef: row.bank_ref ?? '',
        }),
      );
    }

    let imported = 0;
    let skipped = 0;
    for (const raw of raws) {
      const key = dedupKey(bank_account_id, raw);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const ref = raw.bankRef?.trim();
      await tx.bankTransaction.create({
        data: {
          bank_account_id,
          txn_date: raw.txnDate,
          description: raw.description,
          debit: raw.debit.toFixed(2),
          credit: raw.credit.toFixed(2),
          balance: raw.balance ? raw.balance.toFixed(2) : null,
          bank_ref: ref && ref.length > 0 ? ref : null,
        },
      });
      imported++;
    }

    await logAuditEvent(tx, {
      actor_id,
      action: 'IMPORT',
      entity_type: 'BankAccount',
      entity_id: bank_account_id,
      after: {
        source: source.use_mock ? 'mock' : 'csv',
        date_from: source.date_from.toISOString().slice(0, 10),
        date_to: source.date_to.toISOString().slice(0, 10),
        imported,
        skipped,
        total: raws.length,
      },
    });

    return { imported, skipped };
  });
}

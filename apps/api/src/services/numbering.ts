import type { Prisma } from '@prisma/client';

export const DOC_PREFIXES = [
  'JE',
  'INV',
  'TAX',
  'RCT',
  'BILL',
  'PAY',
  'PP30',
  'PND3',
  'PND53',
  'WHT',
  'CUST',
  'VEND',
] as const;

export type DocPrefix = (typeof DOC_PREFIXES)[number];

const SUPPORTED_PREFIXES = new Set<string>(DOC_PREFIXES);

const TABLE_WHITELIST = new Set<string>([
  'journal_entries',
  'sales_invoices',
  'receipts',
  'bills',
  'payments',
  'tax_filings',
  'withholding_records',
  'customers',
  'vendors',
]);

const COLUMN_WHITELIST = new Set<string>([
  'je_no',
  'invoice_no',
  'tax_invoice_no',
  'receipt_no',
  'bill_no',
  'payment_no',
  'filing_no',
  'cert_no',
  'code',
]);

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

function assertSafeIdent(name: string, allowed: Set<string>, kind: 'table' | 'column'): void {
  if (!allowed.has(name) || !SAFE_IDENT.test(name)) {
    throw new Error(`numbering: unsupported ${kind} '${name}'`);
  }
}

function assertInsideTransaction(tx: Prisma.TransactionClient): void {
  // The base PrismaClient exposes $transaction; an interactive transaction
  // client does not. If we see $transaction, the caller forgot to wrap.
  if (typeof (tx as unknown as { $transaction?: unknown }).$transaction === 'function') {
    throw new Error('numbering: nextDocNo must be called inside prisma.$transaction');
  }
}

/**
 * Atomically allocate the next document number for `prefix` in `year`.
 *
 * Uses a transaction-scoped advisory lock keyed by `(prefix, year)` so two
 * concurrent transactions cannot both compute the same MAX+1. Voided
 * documents keep their numbers — gaps are expected and required by the
 * Thai Revenue Department (spec 02 §3.2).
 *
 * Caller must invoke this inside an interactive `prisma.$transaction` and
 * insert the row that consumes the returned number in the same transaction.
 */
export async function nextDocNo(
  tx: Prisma.TransactionClient,
  prefix: DocPrefix,
  year: number,
  table: string,
  column: string,
): Promise<string> {
  assertInsideTransaction(tx);

  if (!SUPPORTED_PREFIXES.has(prefix)) {
    throw new Error(`numbering: unsupported prefix '${prefix}'`);
  }
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`numbering: invalid year '${year}'`);
  }
  assertSafeIdent(table, TABLE_WHITELIST, 'table');
  assertSafeIdent(column, COLUMN_WHITELIST, 'column');

  const likePattern = `${prefix}-${year}-%`;
  const lockKey = `${prefix}:${year}`;

  // Serialize concurrent allocators for the same (prefix, year). Released
  // automatically on COMMIT/ROLLBACK because of the _xact_ variant.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`;

  // FOR UPDATE on existing matches — defensive belt-and-suspenders against
  // any path that bypasses the advisory lock. No-op when the year is empty.
  await tx.$executeRawUnsafe(
    `SELECT 1 FROM ${table} WHERE ${column} LIKE $1 FOR UPDATE`,
    likePattern,
  );

  const rows = await tx.$queryRawUnsafe<{ next_num: number | bigint | string }[]>(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(${column}, '-', 3) AS INT)), 0) + 1 AS next_num
       FROM ${table}
      WHERE ${column} LIKE $1`,
    likePattern,
  );

  const nextNum = Number(rows[0]?.next_num ?? 1);
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

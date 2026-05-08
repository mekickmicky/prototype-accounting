import type { BankAccount, BankName, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { logAuditEvent } from './audit-log';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export interface BankAccountFilters {
  q?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export interface BankAccountListResult {
  items: BankAccount[];
  pagination: { total: number; limit: number; offset: number };
}

export interface CreateBankAccountInput {
  code: string;
  name: string;
  bank_name: BankName;
  account_number?: string;
  account_type?: string;
  gl_account_code: string;
  is_active?: boolean;
}

export interface UpdateBankAccountInput {
  name?: string;
  bank_name?: BankName;
  account_number?: string;
  account_type?: string;
  gl_account_code?: string;
  is_active?: boolean;
}

async function assertGlAccountExists(tx: Tx, gl_account_code: string): Promise<void> {
  const account = await tx.account.findUnique({ where: { code: gl_account_code } });
  if (!account) throw new BusinessRuleError('ACCOUNT_NOT_FOUND', { gl_account_code });
}

export async function listBankAccounts(
  filters: BankAccountFilters = {},
): Promise<BankAccountListResult> {
  const { q, active, limit = 50, offset = 0 } = filters;

  const where: Prisma.BankAccountWhereInput = {};
  if (active !== undefined) where.is_active = active;
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { account_number: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await db.$transaction([
    db.bankAccount.findMany({ where, orderBy: { code: 'asc' }, take: limit, skip: offset }),
    db.bankAccount.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function getBankAccount(id: string): Promise<BankAccount | null> {
  return db.bankAccount.findUnique({ where: { id } });
}

export async function createBankAccount(
  input: CreateBankAccountInput,
  actor_id?: string,
): Promise<BankAccount> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.bankAccount.findUnique({ where: { code: input.code } });
    if (existing) throw new BusinessRuleError('DUPLICATE_NUMBER', { field: 'code', code: input.code });

    await assertGlAccountExists(tx, input.gl_account_code);

    const bankAccount = await tx.bankAccount.create({
      data: {
        code: input.code,
        name: input.name,
        bank_name: input.bank_name,
        account_number: input.account_number ?? null,
        account_type: input.account_type ?? 'current',
        gl_account_code: input.gl_account_code,
        is_active: input.is_active ?? true,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'BankAccount',
      entity_id: bankAccount.id,
      after: bankAccount,
    });

    return bankAccount;
  });
}

export async function updateBankAccount(
  id: string,
  input: UpdateBankAccountInput,
  ifMatch: Date | string,
  actor_id?: string,
): Promise<BankAccount> {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { bank_account_id: id });

    const matchTs = ifMatch instanceof Date ? ifMatch : new Date(ifMatch);
    if (existing.updated_at.getTime() !== matchTs.getTime()) {
      throw new BusinessRuleError('STALE_RECORD', {
        id,
        expected: matchTs.toISOString(),
        actual: existing.updated_at.toISOString(),
      });
    }

    if (input.gl_account_code !== undefined) {
      await assertGlAccountExists(tx, input.gl_account_code);
    }

    const updated = await tx.bankAccount.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.bank_name !== undefined && { bank_name: input.bank_name }),
        ...(input.account_number !== undefined && { account_number: input.account_number }),
        ...(input.account_type !== undefined && { account_type: input.account_type }),
        ...(input.gl_account_code !== undefined && { gl_account_code: input.gl_account_code }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'BankAccount',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

export async function deactivateBankAccount(id: string, actor_id?: string): Promise<void> {
  await db.$transaction(async (tx: Tx) => {
    const existing = await tx.bankAccount.findUnique({ where: { id } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { bank_account_id: id });

    const txnCount = await tx.bankTransaction.count({ where: { bank_account_id: id } });
    if (txnCount > 0) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        bank_account_id: id,
        reason: 'has_transactions',
        count: txnCount,
      });
    }

    const updated = await tx.bankAccount.update({
      where: { id },
      data: { is_active: false },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'DELETE',
      entity_type: 'BankAccount',
      entity_id: id,
      before: existing,
      after: updated,
    });
  });
}

export async function getBalance(id: string, as_of?: Date): Promise<Decimal> {
  const bankAccount = await db.bankAccount.findUnique({ where: { id } });
  if (!bankAccount) throw new BusinessRuleError('NOT_FOUND', { bank_account_id: id });

  const result = await db.journalLine.aggregate({
    where: {
      account_code: bankAccount.gl_account_code,
      je: {
        status: 'POSTED',
        ...(as_of !== undefined && { entry_date: { lte: as_of } }),
      },
    },
    _sum: { debit: true, credit: true },
  });

  const totalDebit = new Decimal(result._sum.debit?.toString() ?? '0');
  const totalCredit = new Decimal(result._sum.credit?.toString() ?? '0');

  return totalDebit.minus(totalCredit);
}

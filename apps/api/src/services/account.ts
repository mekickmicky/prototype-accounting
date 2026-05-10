import type { Account, AccountType, JournalLine, Prisma } from '@prisma/client';
import { D } from '@wind-acc/shared';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

export interface AccountFilters {
  type?: AccountType;
  active?: boolean;
  parent_code?: string | null;
  period_code?: string;
}

export interface AccountWithBalance extends Account {
  current_balance: string;
}

type JeSnippet = Pick<
  import('@prisma/client').JournalEntry,
  'id' | 'je_no' | 'entry_date' | 'description' | 'branch_code'
>;

export interface AccountDetail extends Account {
  parent_chain: Account[];
  children: Account[];
  recent_lines: (JournalLine & { je: JeSnippet })[];
}

export async function listAccounts(filters: AccountFilters = {}): Promise<AccountWithBalance[]> {
  const where: Prisma.AccountWhereInput = {};
  if (filters.type) where.type = filters.type;
  if (filters.active !== undefined) where.is_active = filters.active;
  if (filters.parent_code !== undefined) where.parent_code = filters.parent_code;

  const accounts = await db.account.findMany({ where, orderBy: { code: 'asc' } });

  // Include VOID JE lines so that a voided JE + its reversal net to zero.
  const lineWhere: Prisma.JournalLineWhereInput = { je: { status: { in: ['POSTED', 'VOID'] } } };
  if (filters.period_code) {
    lineWhere.je = { status: { in: ['POSTED', 'VOID'] }, period_code: filters.period_code };
  }

  const aggregates = await db.journalLine.groupBy({
    by: ['account_code'],
    where: lineWhere,
    _sum: { debit: true, credit: true },
  });

  const balanceMap = new Map(
    aggregates.map(a => [
      a.account_code,
      D(a._sum.debit?.toString() ?? '0').minus(D(a._sum.credit?.toString() ?? '0')),
    ]),
  );

  return accounts.map(acc => ({
    ...acc,
    current_balance: (balanceMap.get(acc.code) ?? D(0)).toFixed(2),
  }));
}

async function buildParentChain(parentCode: string | null): Promise<Account[]> {
  const chain: Account[] = [];
  let code: string | null = parentCode;
  while (code) {
    const acc = await db.account.findUnique({ where: { code } });
    if (!acc) break;
    chain.unshift(acc);
    code = acc.parent_code;
  }
  return chain;
}

export async function getAccount(code: string): Promise<AccountDetail | null> {
  const account = await db.account.findUnique({
    where: { code },
    include: { children: { orderBy: { code: 'asc' } } },
  });
  if (!account) return null;

  const parentChain = await buildParentChain(account.parent_code);

  const recentLines = await db.journalLine.findMany({
    where: { account_code: code, je: { status: 'POSTED' } },
    include: {
      je: {
        select: {
          id: true,
          je_no: true,
          entry_date: true,
          description: true,
          branch_code: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
    take: 20,
  });

  const agg = await db.journalLine.aggregate({
    where: { account_code: code, je: { status: { in: ['POSTED', 'VOID'] } } },
    _sum: { debit: true, credit: true },
  });
  const current_balance = D(agg._sum.debit?.toString() ?? '0')
    .minus(D(agg._sum.credit?.toString() ?? '0'))
    .toFixed(2);

  return {
    ...account,
    current_balance,
    parent_chain: parentChain,
    recent_lines: recentLines,
  };
}

export interface CreateAccountInput {
  code: string;
  name_en: string;
  name_th: string;
  type: AccountType;
  parent_code?: string;
  is_postable?: boolean;
}

export async function createAccount(input: CreateAccountInput): Promise<Account> {
  if (input.parent_code) {
    const parent = await db.account.findUnique({ where: { code: input.parent_code } });
    if (!parent) throw new BusinessRuleError('NOT_FOUND', { parent_code: input.parent_code });
  }

  return db.account.create({
    data: {
      code: input.code,
      name_en: input.name_en,
      name_th: input.name_th,
      type: input.type,
      parent_code: input.parent_code ?? null,
      is_postable: input.is_postable ?? true,
    },
  });
}

export interface UpdateAccountInput {
  name_en?: string;
  name_th?: string;
  is_active?: boolean;
}

export async function updateAccount(code: string, input: UpdateAccountInput): Promise<Account> {
  const existing = await db.account.findUnique({ where: { code } });
  if (!existing) throw new BusinessRuleError('NOT_FOUND', { account_code: code });

  return db.account.update({
    where: { code },
    data: {
      ...(input.name_en !== undefined && { name_en: input.name_en }),
      ...(input.name_th !== undefined && { name_th: input.name_th }),
      ...(input.is_active !== undefined && { is_active: input.is_active }),
    },
  });
}

// Soft-delete: blocks if account has any JournalLine; otherwise deactivates.
// Account model has no deleted_at field; is_active=false is the soft-disable mechanism.
export async function deleteAccount(code: string): Promise<void> {
  const existing = await db.account.findUnique({ where: { code } });
  if (!existing) throw new BusinessRuleError('NOT_FOUND', { account_code: code });

  const lineCount = await db.journalLine.count({ where: { account_code: code } });
  if (lineCount > 0) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      account_code: code,
      reason: 'account_has_journal_lines',
    });
  }

  await db.account.update({ where: { code }, data: { is_active: false } });
}

// Called within a transaction by JE service to validate each line's account.
// Throws NOT_FOUND, ACCOUNT_NOT_POSTABLE, or ACCOUNT_INACTIVE.
export async function assertPostable(tx: Tx, code: string): Promise<Account> {
  const account = await tx.account.findUnique({ where: { code } });
  if (!account) throw new BusinessRuleError('NOT_FOUND', { account_code: code });
  if (!account.is_postable) throw new BusinessRuleError('ACCOUNT_NOT_POSTABLE', { account_code: code });
  if (!account.is_active) throw new BusinessRuleError('ACCOUNT_INACTIVE', { account_code: code });
  return account;
}

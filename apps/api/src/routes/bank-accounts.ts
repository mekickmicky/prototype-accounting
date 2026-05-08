import { Elysia } from 'elysia';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  listBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  getBalance,
} from '../services/bank-account';

const BANK_NAMES = ['KBANK', 'SCB', 'BBL', 'KTB', 'BAY', 'TTB', 'GSB', 'CASH', 'OTHER'] as const;

const CreateBankAccountBody = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  bank_name: z.enum(BANK_NAMES),
  account_number: z.string().optional(),
  account_type: z.string().optional(),
  gl_account_code: z.string().min(1),
  is_active: z.boolean().optional(),
});

const UpdateBankAccountBody = z.object({
  name: z.string().min(1).optional(),
  bank_name: z.enum(BANK_NAMES).optional(),
  account_number: z.string().optional(),
  account_type: z.string().optional(),
  gl_account_code: z.string().optional(),
  is_active: z.boolean().optional(),
});

export const bankAccountRoutes = new Elysia({ prefix: '/bank-accounts' })
  .use(authGuard)

  // GET /bank-accounts — list with computed balance
  .get('', async ({ query }) => {
    const q = query.q as string | undefined;
    const active = query.active !== undefined ? (query.active as string) === 'true' : undefined;
    const page = Number(query.page ?? 1);
    const page_size = Number(query.page_size ?? 50);
    const offset = (page - 1) * page_size;

    const result = await listBankAccounts({ q, active, limit: page_size, offset });

    const itemsWithBalance = await Promise.all(
      result.items.map(async (account) => {
        const balance = await getBalance(account.id);
        return { ...account, balance: balance.toString() };
      }),
    );

    return {
      success: true as const,
      data: itemsWithBalance,
      meta: { total: result.pagination.total, page, page_size },
    };
  })

  // POST /bank-accounts — admin only
  .post('', async ({ user, body, set }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');

    const parsed = CreateBankAccountBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const account = await createBankAccount(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: account };
  })

  // GET /bank-accounts/:id — detail with computed balance
  .get('/:id', async ({ params }) => {
    const account = await getBankAccount(params.id);
    if (!account) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'BankAccount', id: params.id });
    }

    const balance = await getBalance(params.id);

    return {
      success: true as const,
      data: { ...account, balance: balance.toString() },
    };
  })

  // PATCH /bank-accounts/:id — admin only; requires If-Match header for optimistic locking
  .patch('/:id', async ({ user, params, body, request }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');

    const parsed = UpdateBankAccountBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }

    const account = await updateBankAccount(params.id, parsed.data, ifMatch, user.user_id);
    return { success: true as const, data: account };
  })

  // GET /bank-accounts/:id/transactions — paginated; filters: reconciled, date_from, date_to
  .get('/:id/transactions', async ({ params, query }) => {
    const account = await getBankAccount(params.id);
    if (!account) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'BankAccount', id: params.id });
    }

    const page = Number(query.page ?? 1);
    const page_size = Number(query.page_size ?? 50);
    const offset = (page - 1) * page_size;

    const where: Prisma.BankTransactionWhereInput = { bank_account_id: params.id };

    if (query.reconciled !== undefined) {
      const wantReconciled = (query.reconciled as string) === 'true';
      where.reconciled_at = wantReconciled ? { not: null } : null;
    }

    if (query.date_from || query.date_to) {
      const dateFilter: Prisma.DateTimeFilter<'BankTransaction'> = {};
      if (query.date_from) dateFilter.gte = new Date(query.date_from as string);
      if (query.date_to) dateFilter.lte = new Date(query.date_to as string);
      where.txn_date = dateFilter;
    }

    const [items, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        orderBy: { txn_date: 'desc' },
        take: page_size,
        skip: offset,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    return {
      success: true as const,
      data: items.map((txn) => ({
        ...txn,
        debit: txn.debit.toString(),
        credit: txn.credit.toString(),
        balance: txn.balance?.toString() ?? null,
      })),
      meta: { total, page, page_size },
    };
  });

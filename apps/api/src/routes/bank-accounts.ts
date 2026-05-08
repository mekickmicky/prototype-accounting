import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth-guard';
import { prisma } from '../lib/prisma';

export const bankAccountRoutes = new Elysia({ prefix: '/bank-accounts' })
  .use(authGuard)
  .get('', async () => {
    const accounts = await prisma.bankAccount.findMany({
      where: { is_active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, bank_name: true, gl_account_code: true },
    });
    return { success: true as const, data: accounts };
  });

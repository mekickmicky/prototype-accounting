import { Elysia } from 'elysia';
import { authGuard } from '../middleware/auth-guard';
import { listAccounts, getAccount, createAccount, updateAccount } from '../services/account';
import { BusinessRuleError } from '../lib/errors';
import { ListAccountsQuery, CreateAccountBody, UpdateAccountBody } from '@wind-acc/shared';

export const accountRoutes = new Elysia({ prefix: '/accounts' })
  .use(authGuard)
  .get('', async ({ query }) => {
    const parsed = ListAccountsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { type, active, parent_code } = parsed.data;
    const accounts = await listAccounts({ type, active, parent_code });
    return { success: true as const, data: accounts };
  })
  .get('/:code', async ({ params }) => {
    const account = await getAccount(params.code);
    if (!account) throw new BusinessRuleError('NOT_FOUND', { account_code: params.code });
    return { success: true as const, data: account };
  })
  .post('', async ({ user, body, set }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');
    const parsed = CreateAccountBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const account = await createAccount(parsed.data);
    set.status = 201;
    return { success: true as const, data: account };
  })
  .patch('/:code', async ({ user, params, body }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');
    const parsed = UpdateAccountBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const account = await updateAccount(params.code, parsed.data);
    return { success: true as const, data: account };
  });

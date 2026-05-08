import { Elysia } from 'elysia';
import Decimal from 'decimal.js';
import type { DocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { ListCustomersQuery, CreateCustomerBody, UpdateCustomerBody } from '@wind-acc/shared';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
} from '../services/customer';
import { getCustomerStatement } from '../lib/reports/customer-statement';

const OPEN_STATUSES: DocStatus[] = ['POSTED', 'PARTIAL_PAID'];

export const customerRoutes = new Elysia({ prefix: '/customers' })
  .use(authGuard)

  // GET /customers — paginated; ?q searches code+name+name_th+phone; ?active filters
  .get('', async ({ query }) => {
    const parsed = ListCustomersQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { q, active, page, page_size } = parsed.data;
    const offset = (page - 1) * page_size;
    const result = await listCustomers({ q, active, limit: page_size, offset });
    return {
      success: true as const,
      data: result.items,
      meta: { total: result.pagination.total, page, page_size },
    };
  })

  // POST /customers — creates customer; auto-generates code if blank
  .post('', async ({ user, body, set }) => {
    const parsed = CreateCustomerBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const customer = await createCustomer(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: customer };
  })

  // GET /customers/:id — customer profile + open invoices summary + statement link
  .get('/:id', async ({ params }) => {
    const customer = await getCustomer(params.id);
    if (!customer) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Customer', id: params.id });
    }

    const [openCount, balanceAgg] = await Promise.all([
      prisma.salesInvoice.count({
        where: { customer_id: params.id, status: { in: OPEN_STATUSES } },
      }),
      prisma.salesInvoice.aggregate({
        where: { customer_id: params.id, status: { in: OPEN_STATUSES } },
        _sum: { total: true, paid_amount: true },
      }),
    ]);

    const outstanding = new Decimal(balanceAgg._sum.total?.toString() ?? '0')
      .minus(balanceAgg._sum.paid_amount?.toString() ?? '0')
      .toDecimalPlaces(2)
      .toString();

    return {
      success: true as const,
      data: {
        ...customer,
        open_invoices: {
          count: openCount,
          outstanding_balance: outstanding,
        },
        statement_url: `/api/v1/customers/${params.id}/statement`,
      },
    };
  })

  // PATCH /customers/:id — update; requires If-Match: <updated_at> for optimistic locking
  .patch('/:id', async ({ user, params, body, request }) => {
    const parsed = UpdateCustomerBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }
    const customer = await updateCustomer(params.id, parsed.data, ifMatch, user.user_id);
    return { success: true as const, data: customer };
  })

  // GET /customers/:id/statement — chronological statement with running balance
  .get('/:id/statement', async ({ params, query }) => {
    const customer = await getCustomer(params.id);
    if (!customer) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Customer', id: params.id });
    }

    const dateFrom = query.date_from ? new Date(query.date_from as string) : undefined;
    const dateTo = query.date_to ? new Date(query.date_to as string) : undefined;

    const statement = await getCustomerStatement({
      customer_id: params.id,
      date_from: dateFrom,
      date_to: dateTo,
    });

    return { success: true as const, data: statement };
  })

  // DELETE /customers/:id — soft delete; blocked if customer has open invoices
  .delete('/:id', async ({ user, params, set }) => {
    await softDeleteCustomer(params.id, user.user_id);
    set.status = 204;
  });

import { Elysia } from 'elysia';
import Decimal from 'decimal.js';
import type { DocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { ListVendorsQuery, CreateVendorBody, UpdateVendorBody } from '@wind-acc/shared';
import {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  softDeleteVendor,
} from '../services/vendor';

const OPEN_STATUSES: DocStatus[] = ['POSTED', 'PARTIAL_PAID'];

export const vendorRoutes = new Elysia({ prefix: '/vendors' })
  .use(authGuard)

  // GET /vendors — paginated; ?q searches code+name+name_th+phone; ?vendor_type, ?active filter
  .get('', async ({ query }) => {
    const parsed = ListVendorsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { q, vendor_type, active, page, page_size } = parsed.data;
    const offset = (page - 1) * page_size;
    const result = await listVendors({ q, vendor_type, active, limit: page_size, offset });
    return {
      success: true as const,
      data: result.items,
      meta: { total: result.pagination.total, page, page_size },
    };
  })

  // POST /vendors — creates vendor; auto-generates code if blank
  .post('', async ({ user, body, set }) => {
    const parsed = CreateVendorBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const vendor = await createVendor(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: vendor };
  })

  // GET /vendors/:id — vendor profile + open bills summary
  .get('/:id', async ({ params }) => {
    const vendor = await getVendor(params.id);
    if (!vendor) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Vendor', id: params.id });
    }

    const [openCount, balanceAgg] = await Promise.all([
      prisma.bill.count({
        where: { vendor_id: params.id, status: { in: OPEN_STATUSES } },
      }),
      prisma.bill.aggregate({
        where: { vendor_id: params.id, status: { in: OPEN_STATUSES } },
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
        ...vendor,
        open_bills: {
          count: openCount,
          outstanding_balance: outstanding,
        },
      },
    };
  })

  // PATCH /vendors/:id — update; requires If-Match: <updated_at> for optimistic locking
  .patch('/:id', async ({ user, params, body, request }) => {
    const parsed = UpdateVendorBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }
    const vendor = await updateVendor(params.id, parsed.data, ifMatch, user.user_id);
    return { success: true as const, data: vendor };
  })

  // DELETE /vendors/:id — soft delete; blocked if vendor has open bills
  .delete('/:id', async ({ user, params, set }) => {
    await softDeleteVendor(params.id, user.user_id);
    set.status = 204;
  });

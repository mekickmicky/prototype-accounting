import { Elysia } from 'elysia';
import { z } from 'zod';
import crypto from 'node:crypto';
import { type Prisma } from '@prisma/client';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { prisma } from '../lib/prisma';

const AccountMapBody = z.object({
  wind_clinic_service_to_revenue: z.record(z.string().min(1)),
  wind_clinic_product_to_revenue: z.record(z.string().min(1)),
  wind_clinic_payment_to_bank: z.record(z.string().min(1)),
  card_fee_account: z.string().min(1),
  default_ar_account: z.string().min(1),
  default_ap_account: z.string().min(1),
  doctor_commission_account: z.string().optional(),
  doctor_commission_payable: z.string().optional(),
});

export const settingsRoutes = new Elysia({ prefix: '/settings' })
  .use(authGuard)
  .get('/account-map', async () => {
    const setting = await prisma.setting.findUnique({ where: { key: 'account_map' } });
    if (!setting) {
      throw new BusinessRuleError('NOT_FOUND', 'account_map setting not found — run seed first');
    }
    return { success: true as const, data: setting.value };
  })
  .patch('/account-map', async ({ user, body }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');

    const parsed = AccountMapBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const updated = await prisma.setting.upsert({
      where: { key: 'account_map' },
      create: { key: 'account_map', value: parsed.data, updated_by: user.id },
      update: { value: parsed.data, updated_by: user.id },
    });

    return { success: true as const, data: updated.value };
  })
  .get('/integrations/log', async ({ query }) => {
    const source = typeof query.source === 'string' && query.source ? query.source : undefined;
    const limit = Math.min(Number(query.limit ?? 50), 200);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);
    const from = query.from ? new Date(String(query.from)) : defaultFrom;
    const to = query.to ? new Date(String(query.to)) : now;

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startOfThisWeek = new Date(startOfToday);
    startOfThisWeek.setDate(startOfThisWeek.getDate() - daysToMonday);

    const where = {
      ...(source ? { source } : {}),
      created_at: { gte: from, lte: to },
    };

    const [rows, todayCount, weekCount] = await Promise.all([
      prisma.webhookProcessed.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
      }),
      prisma.webhookProcessed.count({
        where: { created_at: { gte: startOfToday } },
      }),
      prisma.webhookProcessed.count({
        where: { created_at: { gte: startOfThisWeek } },
      }),
    ]);

    return {
      success: true as const,
      data: {
        rows,
        stats: { today: todayCount, this_week: weekCount },
      },
    };
  })
  .get('/audit-log', async ({ query }) => {
    const action = typeof query.action === 'string' && query.action ? query.action : undefined;
    const entity_type = typeof query.entity_type === 'string' && query.entity_type ? query.entity_type : undefined;
    const page = Math.max(1, parseInt(typeof query.page === 'string' ? query.page : '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(typeof query.limit === 'string' ? query.limit : '50', 10)));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action;
    if (entity_type) where.entity_type = entity_type;
    const from = typeof query.from === 'string' && query.from ? new Date(query.from) : undefined;
    const to = typeof query.to === 'string' && query.to ? new Date(query.to) : undefined;
    if (from || to) {
      where.created_at = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [rows, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          actor_name: true,
          action: true,
          entity_type: true,
          entity_id: true,
          after_json: true,
          reason: true,
          ip_address: true,
          created_at: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { success: true as const, data: { rows, total, page, limit } };
  })
  .post('/integrations/test-webhook', async ({ body }) => {
    const { type, payload } = body as { type: string; payload: Record<string, unknown> };

    if (!type || !payload || typeof payload !== 'object') {
      throw new BusinessRuleError('VALIDATION_ERROR', 'type and payload are required');
    }

    let webhookPath: string;
    let secret: string;

    if (type === 'visit-completed') {
      webhookPath = '/api/v1/webhooks/wind-clinic/visit-completed';
      secret = process.env.WEBHOOK_SECRET_WIND_CLINIC ?? 'dev-secret-wind-clinic';
    } else if (type === 'stock-export') {
      webhookPath = '/api/v1/webhooks/wind-stock/period-export';
      secret = process.env.WEBHOOK_SECRET_WIND_STOCK ?? 'dev-secret-wind-stock';
    } else {
      throw new BusinessRuleError('VALIDATION_ERROR', `Unknown webhook type: ${type}`);
    }

    const rawBody = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const timestamp = Date.now().toString();
    const port = process.env.PORT ?? '3001';
    const url = `http://localhost:${port}${webhookPath}`;

    let responseStatus = 0;
    let responseBody: unknown;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body: rawBody,
      });
      responseStatus = res.status;
      try {
        responseBody = await res.json();
      } catch {
        responseBody = { raw: await res.text() };
      }
    } catch (err) {
      throw new BusinessRuleError(
        'WEBHOOK_SEND_FAILED',
        `Network error reaching webhook endpoint: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      success: true as const,
      data: {
        status: responseStatus,
        ok: responseStatus >= 200 && responseStatus < 300,
        body: responseBody,
      },
    };
  });

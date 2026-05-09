import { Elysia } from 'elysia';
import { PeriodExportSchema, VisitCompletedSchema } from '@wind-acc/shared';
import { BusinessRuleError } from '../lib/errors';
import { webhookAuth } from '../middleware/webhook-auth';
import { handlePeriodExport } from '../services/webhooks/wind-stock';
import { handleVisitCompleted } from '../services/webhooks/wind-clinic';
import { prisma } from '../lib/prisma';
import { logAuditEvent } from '../services/audit-log';

export const webhookRoutes = new Elysia({ prefix: '/webhooks' })
  .group(
    '/wind-stock',
    (app) =>
      app
        .use(webhookAuth('WEBHOOK_SECRET_WIND_STOCK'))
        .post('/period-export', async ({ body }) => {
          const parsed = PeriodExportSchema.safeParse(body);
          if (!parsed.success) {
            throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
          }
          const { result, replayed } = await handlePeriodExport(parsed.data);
          void logAuditEvent(prisma, {
            action: 'WEBHOOK_RECEIVED',
            entity_type: 'webhook',
            entity_id: parsed.data.export_id,
            after: { source: 'wind-stock', replayed: replayed ?? false, ...result },
            reason: replayed ? 'replayed' : undefined,
          }).catch(() => {});
          return {
            success: true as const,
            data: { ...result, ...(replayed ? { replayed: true } : {}) },
          };
        }),
  )
  .group(
    '/wind-clinic',
    (app) =>
      app
        .use(webhookAuth('WEBHOOK_SECRET_WIND_CLINIC'))
        .post('/visit-completed', async ({ body }) => {
          const parsed = VisitCompletedSchema.safeParse(body);
          if (!parsed.success) {
            throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
          }
          const { result, replayed } = await handleVisitCompleted(parsed.data);
          void logAuditEvent(prisma, {
            action: 'WEBHOOK_RECEIVED',
            entity_type: 'webhook',
            entity_id: parsed.data.visit_id,
            after: { source: 'wind-clinic', replayed: replayed ?? false, ...result },
            reason: replayed ? 'replayed' : undefined,
          }).catch(() => {});
          return {
            success: true as const,
            data: { ...result, ...(replayed ? { replayed: true } : {}) },
          };
        }),
  );

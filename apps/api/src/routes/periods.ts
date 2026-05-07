import { Elysia } from 'elysia';
import { authGuard, requireRole } from '../middleware/auth-guard';
import { prisma } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { closeChecklist, closePeriod, reopenPeriod } from '../services/period';
import { ClosePeriodBody, ReopenPeriodBody } from '@wind-acc/shared';

export const periodRoutes = new Elysia({ prefix: '/periods' })
  .use(authGuard)
  // GET /periods — list all periods with status, JE counts
  .get('', async () => {
    const periods = await prisma.fiscalPeriod.findMany({
      orderBy: { code: 'desc' },
      include: {
        _count: { select: { journal_entries: true } },
      },
    });

    const periodCodes = periods.map(p => p.code);
    const draftCounts = await prisma.journalEntry.groupBy({
      by: ['period_code'],
      where: { period_code: { in: periodCodes }, status: 'DRAFT' },
      _count: { _all: true },
    });
    const postedCounts = await prisma.journalEntry.groupBy({
      by: ['period_code'],
      where: { period_code: { in: periodCodes }, status: 'POSTED' },
      _count: { _all: true },
    });

    const draftMap = new Map(draftCounts.map(r => [r.period_code, r._count._all]));
    const postedMap = new Map(postedCounts.map(r => [r.period_code, r._count._all]));

    const data = periods.map(p => ({
      code: p.code,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      closed_at: p.closed_at,
      closed_by_id: p.closed_by_id,
      created_at: p.created_at,
      je_count: p._count.journal_entries,
      draft_je_count: draftMap.get(p.code) ?? 0,
      posted_je_count: postedMap.get(p.code) ?? 0,
    }));

    return { success: true as const, data };
  })
  // GET /periods/:code/close-checklist
  .get('/:code/close-checklist', async ({ params }) => {
    const checklist = await closeChecklist(params.code);
    return { success: true as const, data: checklist };
  })
  // POST /periods/:code/close
  .post('/:code/close', async ({ params, body, user, set }) => {
    const parsed = ClosePeriodBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    try {
      await closePeriod(params.code, user.id);
    } catch (err) {
      if (err instanceof BusinessRuleError && err.code === 'PERIOD_CLOSE_BLOCKED') {
        // Re-run checklist to return the current state to the client
        const checklist = await closeChecklist(params.code).catch(() => []);
        set.status = 409;
        return {
          success: false as const,
          error: {
            code: 'PERIOD_CLOSE_BLOCKED' as const,
            message: 'ไม่สามารถปิดงวดได้ เนื่องจากรายการยังไม่ครบถ้วน',
            context: { ...(err.context ?? {}), checklist },
          },
        };
      }
      throw err;
    }

    return { success: true as const, data: { period_code: params.code, status: 'CLOSED' } };
  })
  // POST /periods/:code/reopen (admin only)
  .post('/:code/reopen', async ({ params, body, user }) => {
    if (user.role !== 'ADMIN') throw new BusinessRuleError('FORBIDDEN');

    const parsed = ReopenPeriodBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    await reopenPeriod(params.code, user.id, parsed.data.reason);
    return { success: true as const, data: { period_code: params.code, status: 'OPEN' } };
  });

import { Elysia } from 'elysia';
import { z } from 'zod';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { authGuard } from '../middleware/auth-guard';
import { trialBalance, type BranchFilter } from '../lib/reports/trial-balance';
import { BusinessRuleError } from '../lib/errors';
import { buildTrialBalanceCSV } from '../lib/exports/csv';
import { buildTrialBalanceXLSX } from '../lib/exports/xlsx';
import { TrialBalancePDF } from '../pdf/trial-balance';

const TrialBalanceQuery = z.object({
  as_of: z.string().date(),
  branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
  format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
});

export const reportRoutes = new Elysia({ prefix: '/reports' })
  .use(authGuard)
  .get('/trial-balance', async ({ query }) => {
    const parsed = TrialBalanceQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { as_of, branch, format } = parsed.data;
    const result = await trialBalance({
      as_of: new Date(as_of),
      branch: branch as BranchFilter,
      group_by_type: true,
    });

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    if (format === 'csv') {
      return new Response(buildTrialBalanceCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="trial-balance-${as_of}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildTrialBalanceXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="trial-balance-${as_of}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(TrialBalancePDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="trial-balance-${as_of}.pdf"`,
      },
    });
  });

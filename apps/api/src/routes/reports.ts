import { Elysia } from 'elysia';
import { z } from 'zod';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { authGuard } from '../middleware/auth-guard';
import { trialBalance, type BranchFilter } from '../lib/reports/trial-balance';
import { arAging } from '../lib/reports/ar-aging';
import { apAging } from '../lib/reports/ap-aging';
import { BusinessRuleError } from '../lib/errors';
import { buildTrialBalanceCSV, buildArAgingCSV, buildApAgingCSV } from '../lib/exports/csv';
import { buildTrialBalanceXLSX, buildArAgingXLSX, buildApAgingXLSX } from '../lib/exports/xlsx';
import { TrialBalancePDF } from '../pdf/trial-balance';
import { ArAgingPDF } from '../pdf/ar-aging';
import { ApAgingPDF } from '../pdf/ap-aging';

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
  })
  .get('/ar-aging', async ({ query }) => {
    const ArAgingQuery = z.object({
      as_of: z.string().date(),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });

    const parsed = ArAgingQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { as_of, branch, format } = parsed.data;
    const result = await arAging({
      as_of: new Date(as_of),
      branch: branch as BranchFilter,
    });

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    if (format === 'csv') {
      return new Response(buildArAgingCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ar-aging-${as_of}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildArAgingXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="ar-aging-${as_of}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(ArAgingPDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ar-aging-${as_of}.pdf"`,
      },
    });
  })
  .get('/ap-aging', async ({ query }) => {
    const ApAgingQuery = z.object({
      as_of: z.string().date(),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });

    const parsed = ApAgingQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { as_of, branch, format } = parsed.data;
    const result = await apAging({
      as_of: new Date(as_of),
      branch: branch as BranchFilter,
    });

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    if (format === 'csv') {
      return new Response(buildApAgingCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ap-aging-${as_of}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildApAgingXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="ap-aging-${as_of}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(ApAgingPDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ap-aging-${as_of}.pdf"`,
      },
    });
  });

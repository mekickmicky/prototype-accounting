import { Elysia } from 'elysia';
import { z } from 'zod';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { authGuard } from '../middleware/auth-guard';
import { trialBalance, type BranchFilter } from '../lib/reports/trial-balance';
import { arAging } from '../lib/reports/ar-aging';
import { apAging } from '../lib/reports/ap-aging';
import { vatSummary } from '../lib/reports/vat-summary';
import { cashPosition } from '../lib/reports/cash-position';
import type { BranchFilter as CashBranchFilter } from '../lib/reports/cash-position';
import { branchPnl } from '../lib/reports/branch-pnl';
import { profitLoss } from '../lib/reports/profit-loss';
import { balanceSheet } from '../lib/reports/balance-sheet';
import { cashFlow } from '../lib/reports/cash-flow';
import { generalLedger } from '../lib/reports/general-ledger';
import type { BranchFilter as ReportBranchFilter } from '../lib/reports/common';
import { BusinessRuleError } from '../lib/errors';
import { dateRangeForPeriod } from '../lib/reports/common';
import {
  buildTrialBalanceCSV, buildArAgingCSV, buildApAgingCSV, buildVatSummaryCSV,
  buildCashPositionCSV, buildBranchPnLCSV,
  buildProfitLossCSV, buildBalanceSheetCSV, buildCashFlowCSV, buildGeneralLedgerCSV,
} from '../lib/exports/csv';
import {
  buildTrialBalanceXLSX, buildArAgingXLSX, buildApAgingXLSX, buildVatSummaryXLSX,
  buildCashPositionXLSX, buildBranchPnLXLSX,
  buildProfitLossXLSX, buildBalanceSheetXLSX, buildCashFlowXLSX, buildGeneralLedgerXLSX,
} from '../lib/exports/xlsx';
import { TrialBalancePDF } from '../pdf/trial-balance';
import { ArAgingPDF } from '../pdf/ar-aging';
import { ApAgingPDF } from '../pdf/ap-aging';
import { VatSummaryPDF } from '../pdf/vat-summary';
import { CashPositionPDF } from '../pdf/cash-position';
import { BranchPnLPDF } from '../pdf/branch-pnl';
import { ProfitLossPDF } from '../pdf/profit-loss';
import { BalanceSheetPDF } from '../pdf/balance-sheet';
import { CashFlowPDF } from '../pdf/cash-flow';
import { GeneralLedgerPDF } from '../pdf/general-ledger';

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
  })
  .get('/vat-summary', async ({ query }) => {
    const VatSummaryQuery = z.object({
      period_from: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      period_to: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });

    const parsed = VatSummaryQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { period_from, period_to, format } = parsed.data;
    const result = await vatSummary({ period_from, period_to });

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    const fileSlug = `${result.period_from}_${result.period_to}`;

    if (format === 'csv') {
      return new Response(buildVatSummaryCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="vat-summary-${fileSlug}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildVatSummaryXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="vat-summary-${fileSlug}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(VatSummaryPDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="vat-summary-${fileSlug}.pdf"`,
      },
    });
  })
  .get('/cash-position', async ({ query }) => {
    const CashPositionQuery = z.object({
      as_of: z.string().date(),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });

    const parsed = CashPositionQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { as_of, branch, format } = parsed.data;
    const result = await cashPosition({
      as_of: new Date(as_of),
      branch: branch as CashBranchFilter,
    });

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    if (format === 'csv') {
      return new Response(buildCashPositionCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="cash-position-${as_of}-${branch}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildCashPositionXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="cash-position-${as_of}-${branch}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(CashPositionPDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="cash-position-${as_of}-${branch}.pdf"`,
      },
    });
  })
  .get('/branch-pnl', async ({ query }) => {
    const BranchPnLQuery = z.object({
      period_from: z.string().regex(/^\d{4}-\d{2}$/),
      period_to: z.string().regex(/^\d{4}-\d{2}$/),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });

    const parsed = BranchPnLQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }

    const { period_from, period_to, format } = parsed.data;
    const { start } = dateRangeForPeriod(period_from);
    const { end } = dateRangeForPeriod(period_to);
    const result = await branchPnl({ start_date: start, end_date: end });

    const fileSlug = `${period_from}_${period_to}`;

    if (format === 'json') {
      return { success: true as const, data: result };
    }

    if (format === 'csv') {
      return new Response(buildBranchPnLCSV(result), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="branch-pnl-${fileSlug}.csv"`,
        },
      });
    }

    if (format === 'xlsx') {
      const buf = await buildBranchPnLXLSX(result);
      return new Response(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="branch-pnl-${fileSlug}.xlsx"`,
        },
      });
    }

    // format === 'pdf'
    const pdfBuf = await renderToBuffer(createElement(BranchPnLPDF, { result }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="branch-pnl-${fileSlug}.pdf"`,
      },
    });
  })
  .get('/profit-loss', async ({ query }) => {
    const PLQuery = z.object({
      period_from: z.string().regex(/^\d{4}-\d{2}$/),
      period_to: z.string().regex(/^\d{4}-\d{2}$/),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      comparative: z.string().optional().transform(v => v === 'true'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });
    const parsed = PLQuery.safeParse(query);
    if (!parsed.success) throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    const { period_from, period_to, branch, comparative, format } = parsed.data;
    const { start } = dateRangeForPeriod(period_from);
    const { end } = dateRangeForPeriod(period_to);
    const result = await profitLoss({ start_date: start, end_date: end, branch: branch as ReportBranchFilter, comparative });
    const fileSlug = `${period_from}_${period_to}-${branch}`;
    if (format === 'json') return { success: true as const, data: result };
    if (format === 'csv') return new Response(buildProfitLossCSV(result), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="profit-loss-${fileSlug}.csv"` } });
    if (format === 'xlsx') { const buf = await buildProfitLossXLSX(result); return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="profit-loss-${fileSlug}.xlsx"` } }); }
    const pdfBuf = await renderToBuffer(createElement(ProfitLossPDF, { result }));
    return new Response(pdfBuf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="profit-loss-${fileSlug}.pdf"` } });
  })
  .get('/balance-sheet', async ({ query }) => {
    const BSQuery = z.object({
      as_of: z.string().date(),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      comparative: z.string().optional().transform(v => v === 'true'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });
    const parsed = BSQuery.safeParse(query);
    if (!parsed.success) throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    const { as_of, branch, comparative, format } = parsed.data;
    const result = await balanceSheet({ as_of: new Date(as_of), branch: branch as ReportBranchFilter, comparative });
    const fileSlug = `${as_of}-${branch}`;
    if (format === 'json') return { success: true as const, data: result };
    if (format === 'csv') return new Response(buildBalanceSheetCSV(result), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="balance-sheet-${fileSlug}.csv"` } });
    if (format === 'xlsx') { const buf = await buildBalanceSheetXLSX(result); return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="balance-sheet-${fileSlug}.xlsx"` } }); }
    const pdfBuf = await renderToBuffer(createElement(BalanceSheetPDF, { result }));
    return new Response(pdfBuf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="balance-sheet-${fileSlug}.pdf"` } });
  })
  .get('/cash-flow', async ({ query }) => {
    const CFQuery = z.object({
      period_from: z.string().regex(/^\d{4}-\d{2}$/),
      period_to: z.string().regex(/^\d{4}-\d{2}$/),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });
    const parsed = CFQuery.safeParse(query);
    if (!parsed.success) throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    const { period_from, period_to, branch, format } = parsed.data;
    const { start } = dateRangeForPeriod(period_from);
    const { end } = dateRangeForPeriod(period_to);
    const result = await cashFlow({ start_date: start, end_date: end, branch: branch as ReportBranchFilter });
    const fileSlug = `${period_from}_${period_to}-${branch}`;
    if (format === 'json') return { success: true as const, data: result };
    if (format === 'csv') return new Response(buildCashFlowCSV(result), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cash-flow-${fileSlug}.csv"` } });
    if (format === 'xlsx') { const buf = await buildCashFlowXLSX(result); return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="cash-flow-${fileSlug}.xlsx"` } }); }
    const pdfBuf = await renderToBuffer(createElement(CashFlowPDF, { result }));
    return new Response(pdfBuf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="cash-flow-${fileSlug}.pdf"` } });
  })
  .get('/general-ledger', async ({ query }) => {
    const GLQuery = z.object({
      account: z.string().min(1),
      period_from: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      period_to: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      branch: z.enum(['TL', 'EK', 'RAMA9', 'ALL']).default('ALL'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    });
    const parsed = GLQuery.safeParse(query);
    if (!parsed.success) throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    const { account, period_from, period_to, branch, format } = parsed.data;
    const result = await generalLedger({ account_code: account, period_from, period_to, branch: branch as ReportBranchFilter });
    const periodSlug = period_from && period_to ? `${period_from}_${period_to}` : 'all';
    const fileSlug = `${account}-${periodSlug}-${branch}`;
    if (format === 'json') return { success: true as const, data: result };
    if (format === 'csv') return new Response(buildGeneralLedgerCSV(result), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="general-ledger-${fileSlug}.csv"` } });
    if (format === 'xlsx') { const buf = await buildGeneralLedgerXLSX(result); return new Response(buf, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="general-ledger-${fileSlug}.xlsx"` } }); }
    const pdfBuf = await renderToBuffer(createElement(GeneralLedgerPDF, { result }));
    return new Response(pdfBuf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="general-ledger-${fileSlug}.pdf"` } });
  });

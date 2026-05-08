import { Elysia } from 'elysia';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import {
  ListBillsQuery,
  CreateBillBody,
  UpdateBillBody,
  VoidBillBody,
} from '@wind-acc/shared';
import {
  createDraft,
  update,
  post,
  voidBill,
} from '../services/bill';
import { BillPDF } from '../pdf/bill';

const OPEN_STATUSES: DocStatus[] = ['POSTED', 'PARTIAL_PAID'];

export const billRoutes = new Elysia({ prefix: '/bills' })
  .use(authGuard)

  // GET /bills — paginated list with filters
  .get('', async ({ query }) => {
    const parsed = ListBillsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { vendor_id, status, overdue, period, branch, date_from, date_to, q, page, page_size } =
      parsed.data;
    const offset = (page - 1) * page_size;

    const where: Parameters<typeof prisma.bill.findMany>[0]['where'] = {};

    if (vendor_id) where.vendor_id = vendor_id;
    if (branch) where.branch_code = branch;

    if (overdue) {
      where.status = { in: OPEN_STATUSES };
      where.due_date = { lt: new Date() };
    } else if (status) {
      where.status = status;
    }

    if (period) {
      const [y, m] = period.split('-').map(Number);
      where.issue_date = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    } else {
      if (date_from) {
        where.issue_date = { ...(where.issue_date as object | undefined), gte: new Date(date_from) };
      }
      if (date_to) {
        where.issue_date = { ...(where.issue_date as object | undefined), lte: new Date(date_to) };
      }
    }

    if (q) {
      where.OR = [
        { bill_no: { contains: q, mode: 'insensitive' } },
        { vendor_invoice_no: { contains: q, mode: 'insensitive' } },
        { vendor: { name: { contains: q, mode: 'insensitive' } } },
        { vendor: { name_th: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.bill.findMany({
        where,
        include: {
          lines: { orderBy: { line_no: 'asc' } },
          vendor: { select: { id: true, code: true, name: true, name_th: true, vendor_type: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: page_size,
      }),
      prisma.bill.count({ where }),
    ]);

    return {
      success: true as const,
      data: items,
      meta: { total, page, page_size },
    };
  })

  // POST /bills — create DRAFT
  .post('', async ({ user, body, set }) => {
    const parsed = CreateBillBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const result = await createDraft(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: result.bill, warnings: result.warnings };
  })

  // GET /bills/:id
  .get('/:id', async ({ params }) => {
    const bill = await prisma.bill.findUnique({
      where: { id: params.id },
      include: {
        lines: { orderBy: { line_no: 'asc' } },
        vendor: true,
        payment_applications: {
          include: {
            payment: {
              select: { id: true, payment_no: true, payment_date: true, total_amount: true },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });
    if (!bill) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Bill', id: params.id });
    }
    return { success: true as const, data: bill };
  })

  // PATCH /bills/:id — update DRAFT; requires If-Match header
  .patch('/:id', async ({ user, params, body, request }) => {
    const parsed = UpdateBillBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }
    const result = await update(params.id, parsed.data, user.user_id, ifMatch);
    return { success: true as const, data: result.bill, warnings: result.warnings };
  })

  // POST /bills/:id/post
  .post('/:id/post', async ({ user, params }) => {
    const bill = await post(params.id, user.user_id);
    return { success: true as const, data: bill };
  })

  // POST /bills/:id/void
  .post('/:id/void', async ({ user, params, body }) => {
    const parsed = VoidBillBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const bill = await voidBill(params.id, user.user_id, parsed.data.reason);
    return { success: true as const, data: bill };
  })

  // GET /bills/:id/pdf
  .get('/:id/pdf', async ({ params }) => {
    const bill = await prisma.bill.findUnique({
      where: { id: params.id },
      include: {
        vendor: true,
        lines: { orderBy: { line_no: 'asc' } },
      },
    });
    if (!bill) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Bill', id: params.id });
    }
    if (bill.status === 'DRAFT') {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id: params.id,
        reason: 'cannot_generate_pdf_for_draft',
      });
    }

    const data = {
      bill_no: bill.bill_no,
      vendor_invoice_no: bill.vendor_invoice_no,
      branch_code: bill.branch_code,
      issue_date: bill.issue_date,
      due_date: bill.due_date,
      vat_inclusive: bill.vat_inclusive,
      subtotal: bill.subtotal.toString(),
      vat_amount: bill.vat_amount.toString(),
      withholding_amount: bill.withholding_amount.toString(),
      total: bill.total.toString(),
      net_payable: bill.total.minus(bill.withholding_amount).toString(),
      notes: bill.notes,
      vendor: {
        name: bill.vendor.name,
        name_th: bill.vendor.name_th,
        tax_id: bill.vendor.tax_id,
        address: bill.vendor.address,
        phone: bill.vendor.phone,
      },
      company_name: 'WIND CLINIC Co., Ltd.',
      company_tax_id: '0105566123456',
      lines: bill.lines.map((l) => ({
        line_no: l.line_no,
        description: l.description,
        expense_account_code: l.expense_account_code,
        qty: l.qty.toString(),
        unit_price: l.unit_price.toString(),
        vat_rate: l.vat_rate.toString(),
        withholding_rate: l.withholding_rate.toString(),
        withholding_type: l.withholding_type,
        line_total: l.line_total.toString(),
      })),
    };

    const buf = await renderToBuffer(createElement(BillPDF, { data }));
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="bill-${bill.bill_no}.pdf"`,
      },
    });
  });

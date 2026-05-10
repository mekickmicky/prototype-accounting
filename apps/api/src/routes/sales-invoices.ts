import { Elysia } from 'elysia';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import type { DocStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import {
  ListSalesInvoicesQuery,
  CreateSalesInvoiceBody,
  UpdateSalesInvoiceBody,
  VoidSalesInvoiceBody,
} from '@wind-acc/shared';
import {
  createDraft,
  update,
  post,
  voidInvoice,
} from '../services/sales-invoice';
import { SalesInvoicePDF, type CompanyInfo, type BranchInfo } from '../pdf/sales-invoice';
import { TaxInvoicePDF, validateTaxInvoiceData } from '../pdf/tax-invoice';

const WIND_CLINIC_COMPANY: CompanyInfo = {
  name_en: 'WIND CLINIC Co., Ltd.',
  name_th: 'บริษัท วินด์ คลินิก จำกัด',
  tax_id: '0105566123456',
  address: 'XX/X ถนนสุขุมวิท กรุงเทพฯ 10110',
  phone: '02-XXX-XXXX',
  email: 'contact@wind-clinic.com',
};

const BRANCH_MAP: Record<string, BranchInfo> = {
  TL:    { code: 'TL',    name: 'ทองหล่อ', branch_office: '00000' },
  EK:    { code: 'EK',    name: 'เอกมัย',   branch_office: '00001' },
  RAMA9: { code: 'RAMA9', name: 'พระราม 9', branch_office: '00002' },
};

const OPEN_STATUSES: DocStatus[] = ['POSTED', 'PARTIAL_PAID'];

export const salesInvoiceRoutes = new Elysia({ prefix: '/sales-invoices' })
  .use(authGuard)

  // GET /sales-invoices — paginated list with filters
  .get('', async ({ query }) => {
    const parsed = ListSalesInvoicesQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { customer_id, status, overdue, period, branch, date_from, date_to, q, page, page_size } =
      parsed.data;
    const offset = (page - 1) * page_size;

    const where: Parameters<typeof prisma.salesInvoice.findMany>[0]['where'] = {};

    if (customer_id) where.customer_id = customer_id;
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
        lt:  new Date(y, m, 1),
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
        { invoice_no: { contains: q, mode: 'insensitive' } },
        { tax_invoice_no: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { name_th: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: { lines: { orderBy: { line_no: 'asc' } }, customer: { select: { id: true, code: true, name: true, name_th: true } } },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: page_size,
      }),
      prisma.salesInvoice.count({ where }),
    ]);

    return {
      success: true as const,
      data: items,
      meta: { total, page, page_size },
    };
  })

  // POST /sales-invoices — create DRAFT
  .post('', async ({ user, body, set }) => {
    const parsed = CreateSalesInvoiceBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const invoice = await createDraft(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: invoice };
  })

  // GET /sales-invoices/:id
  .get('/:id', async ({ params }) => {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: params.id },
      include: {
        lines: { orderBy: { line_no: 'asc' } },
        customer: true,
        receipt_applications: {
          include: { receipt: { select: { id: true, receipt_no: true, receipt_date: true, total_amount: true } } },
          orderBy: { applied_at: 'asc' },
        },
      },
    });
    if (!invoice) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'SalesInvoice', id: params.id });
    }
    return { success: true as const, data: invoice };
  })

  // PATCH /sales-invoices/:id — update DRAFT; requires If-Match header
  .patch('/:id', async ({ user, params, body, request }) => {
    const parsed = UpdateSalesInvoiceBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }
    const invoice = await update(params.id, parsed.data, user.user_id, ifMatch);
    return { success: true as const, data: invoice };
  })

  // POST /sales-invoices/:id/post
  .post('/:id/post', async ({ user, params }) => {
    const invoice = await post(params.id, user.user_id);
    return { success: true as const, data: invoice };
  })

  // POST /sales-invoices/:id/void
  .post('/:id/void', async ({ user, params, body }) => {
    const parsed = VoidSalesInvoiceBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const invoice = await voidInvoice(params.id, user.user_id, parsed.data.reason);
    return { success: true as const, data: invoice };
  })

  // GET /sales-invoices/:id/pdf — streams invoice PDF
  .get('/:id/pdf', async ({ params }) => {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: params.id },
      include: { lines: { orderBy: { line_no: 'asc' } }, customer: true },
    });
    if (!invoice) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'SalesInvoice', id: params.id });
    }
    if (invoice.status === 'DRAFT') {
      throw new BusinessRuleError('VALIDATION_ERROR', { id: params.id, reason: 'cannot_generate_pdf_for_draft' });
    }

    const branchInfo = BRANCH_MAP[invoice.branch_code] ?? {
      code: invoice.branch_code,
      name: invoice.branch_code,
      branch_office: '00000',
    };

    const data = {
      invoice_no: invoice.invoice_no,
      tax_invoice_no: invoice.tax_invoice_no,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      is_tax_invoice: invoice.is_tax_invoice,
      vat_inclusive: invoice.vat_inclusive,
      subtotal: invoice.subtotal.toString(),
      discount: invoice.discount.toString(),
      vat_amount: invoice.vat_amount.toString(),
      total: invoice.total.toString(),
      notes: invoice.notes,
      lines: invoice.lines.map(l => ({
        line_no: l.line_no,
        description: l.description,
        qty: l.qty.toString(),
        unit_price: l.unit_price.toString(),
        discount: l.discount.toString(),
        vat_rate: l.vat_rate.toString(),
        line_total: l.line_total.toString(),
      })),
      customer: {
        name: invoice.customer.name,
        name_th: invoice.customer.name_th,
        tax_id: invoice.customer.tax_id,
        branch_office: invoice.customer.branch_office,
        address: invoice.customer.address,
        phone: invoice.customer.phone,
        email: invoice.customer.email,
        payment_terms_days: invoice.customer.payment_terms_days,
      },
      company: WIND_CLINIC_COMPANY,
      branch: branchInfo,
      is_fully_paid: invoice.status === 'PAID',
    };

    const PdfComponent = invoice.is_tax_invoice ? TaxInvoicePDF : SalesInvoicePDF;
    if (invoice.is_tax_invoice) {
      validateTaxInvoiceData(data);
    }

    const buf = await renderToBuffer(createElement(PdfComponent, { data }));
    const filename = `invoice-${invoice.invoice_no}.pdf`;
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  });

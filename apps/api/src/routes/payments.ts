import { Elysia } from 'elysia';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import {
  WHT_RATES,
  ListPaymentsQuery,
  CreatePaymentBody,
  UpdatePaymentBody,
  VoidPaymentBody,
} from '@wind-acc/shared';
import { WhtCertPDF, type WhtCertData } from '../pdf/wht-cert';
import { PaymentVoucherPDF, type PaymentVoucherData } from '../pdf/payment-voucher';
import {
  createDraft,
  updateDraft,
  post,
  voidPayment,
} from '../services/payment';
import type { PaymentMethod } from '@prisma/client';

const WIND_CLINIC_ISSUER = {
  name_en: 'WIND CLINIC Co., Ltd.',
  name_th: 'บริษัท วินด์ คลินิก จำกัด',
  tax_id: '0105566123456',
  address: 'XX/X ถนนสุขุมวิท กรุงเทพฯ 10110',
};

const BRANCH_OFFICE_MAP: Record<string, string> = {
  TL: '00000',
  EK: '00001',
  RAMA9: '00002',
};

async function buildWhtCertData(certId: string, paymentId?: string): Promise<WhtCertData> {
  const where: Parameters<typeof prisma.withholdingRecord.findUnique>[0]['where'] = { id: certId };

  const cert = await prisma.withholdingRecord.findUnique({
    where,
    include: {
      payment: {
        select: { id: true, branch_code: true },
      },
    },
  });

  if (!cert) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'WithholdingRecord', id: certId });
  }

  if (paymentId && cert.payment_id !== paymentId) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'WithholdingRecord', id: certId });
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: cert.vendor_id },
    select: { name: true, name_th: true, tax_id: true, address: true },
  });
  if (!vendor) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'Vendor', id: cert.vendor_id });
  }

  const year = cert.period_code.slice(0, 4);

  const ytd = await prisma.withholdingRecord.aggregate({
    where: {
      vendor_id: cert.vendor_id,
      period_code: { startsWith: `${year}-` },
    },
    _sum: { gross_amount: true, wht_amount: true },
  });

  const whtEntry = WHT_RATES.find(r => r.key === cert.wht_type);
  const wht_type_label = whtEntry?.label_th ?? cert.wht_type;
  const wht_type_rd_code = whtEntry?.rd_code ?? '';

  const branchCode = cert.payment.branch_code;
  const branch_office = BRANCH_OFFICE_MAP[branchCode] ?? '00000';

  return {
    cert_no: cert.cert_no,
    payment_date: cert.payment_date,
    wht_type_label,
    wht_type_rd_code,
    wht_rate: cert.wht_rate.toString(),
    gross_amount: cert.gross_amount.toString(),
    wht_amount: cert.wht_amount.toString(),
    ytd_gross: (ytd._sum.gross_amount ?? 0).toString(),
    ytd_wht: (ytd._sum.wht_amount ?? 0).toString(),
    issuer: { ...WIND_CLINIC_ISSUER, branch_office },
    vendor: {
      name: vendor.name,
      name_th: vendor.name_th,
      tax_id: vendor.tax_id,
      address: vendor.address,
    },
  };
}

export const paymentRoutes = new Elysia({ prefix: '/payments' })
  .use(authGuard)

  // GET /payments — paginated list
  .get('', async ({ query }) => {
    const parsed = ListPaymentsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { vendor_id, status, payment_method, period, branch, date_from, date_to, q, page, page_size } =
      parsed.data;
    const offset = (page - 1) * page_size;

    const where: Parameters<typeof prisma.payment.findMany>[0]['where'] = {};

    if (vendor_id) where.vendor_id = vendor_id;
    if (status) where.status = status;
    if (payment_method) where.payment_method = payment_method as PaymentMethod;
    if (branch) where.branch_code = branch;

    if (period) {
      const [y, m] = period.split('-').map(Number);
      where.payment_date = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1),
      };
    } else {
      if (date_from) {
        where.payment_date = { ...(where.payment_date as object | undefined), gte: new Date(date_from) };
      }
      if (date_to) {
        where.payment_date = { ...(where.payment_date as object | undefined), lte: new Date(date_to) };
      }
    }

    if (q) {
      where.OR = [
        { payment_no: { contains: q, mode: 'insensitive' } },
        { vendor: { name: { contains: q, mode: 'insensitive' } } },
        { vendor: { name_th: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          vendor: { select: { id: true, code: true, name: true, name_th: true } },
          applications: true,
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: page_size,
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      success: true as const,
      data: items,
      meta: { total, page, page_size },
    };
  })

  // POST /payments — create DRAFT
  .post('', async ({ user, body, set }) => {
    const parsed = CreatePaymentBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const payment = await createDraft(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: payment };
  })

  // GET /payments/:id
  .get('/:id', async ({ params }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        vendor: true,
        bank_account: { select: { id: true, name: true, account_number: true } },
        applications: {
          include: {
            bill: {
              select: { id: true, bill_no: true, issue_date: true, total: true },
            },
          },
          orderBy: { applied_at: 'asc' },
        },
        withholding: { orderBy: { created_at: 'asc' } },
      },
    });
    if (!payment) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Payment', id: params.id });
    }
    return { success: true as const, data: payment };
  })

  // PATCH /payments/:id — update DRAFT
  .patch('/:id', async ({ user, params, body }) => {
    const parsed = UpdatePaymentBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const payment = await updateDraft(params.id, parsed.data, user.user_id);
    return { success: true as const, data: payment };
  })

  // POST /payments/:id/post
  .post('/:id/post', async ({ user, params }) => {
    const payment = await post(params.id, user.user_id);
    return { success: true as const, data: payment };
  })

  // POST /payments/:id/void
  .post('/:id/void', async ({ user, params, body }) => {
    const parsed = VoidPaymentBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const payment = await voidPayment(params.id, user.user_id, parsed.data.reason);
    return { success: true as const, data: payment };
  })

  // GET /payments/:id/pdf — payment voucher PDF
  .get('/:id/pdf', async ({ params }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        vendor: { select: { name: true, name_th: true, tax_id: true } },
        bank_account: { select: { name: true, account_number: true } },
        applications: {
          include: {
            bill: { select: { bill_no: true, issue_date: true, total: true } },
          },
          orderBy: { applied_at: 'asc' },
        },
      },
    });
    if (!payment) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Payment', id: params.id });
    }
    if (payment.status === 'DRAFT') {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        id: params.id,
        reason: 'cannot_generate_pdf_for_draft',
      });
    }

    const voucherData: PaymentVoucherData = {
      payment_no: payment.payment_no,
      payment_date: payment.payment_date,
      branch_code: payment.branch_code,
      payment_method: payment.payment_method,
      cheque_no: payment.cheque_no,
      notes: payment.notes,
      total_amount: payment.total_amount.toString(),
      withholding_total: payment.withholding_total.toString(),
      net_paid: payment.net_paid.toString(),
      vendor_name: payment.vendor.name,
      vendor_name_th: payment.vendor.name_th,
      vendor_tax_id: payment.vendor.tax_id,
      bank_account_name: payment.bank_account?.name ?? null,
      bank_account_no: payment.bank_account?.account_number ?? null,
      company_name: WIND_CLINIC_ISSUER.name_en,
      company_tax_id: WIND_CLINIC_ISSUER.tax_id,
      bills: payment.applications.map((app) => ({
        bill_no: app.bill.bill_no,
        bill_date: app.bill.issue_date,
        original_amount: app.bill.total.toString(),
        paid_amount: app.applied_amount.toString(),
      })),
    };

    const element = React.createElement(PaymentVoucherPDF, { data: voucherData });
    const buffer = await renderToBuffer(element);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="payment-${payment.payment_no}.pdf"`,
      },
    });
  })

  // GET /payments/:id/wht-certs — list WHT certificates for this payment
  .get('/:id/wht-certs', async ({ params }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!payment) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Payment', id: params.id });
    }
    const certs = await prisma.withholdingRecord.findMany({
      where: { payment_id: params.id },
      orderBy: { created_at: 'asc' },
    });
    return { success: true as const, data: certs };
  })

  // GET /payments/:id/wht-certs/:cert_id/pdf
  .get('/:id/wht-certs/:cert_id/pdf', async ({ params }) => {
    const data = await buildWhtCertData(params.cert_id, params.id);
    const element = React.createElement(WhtCertPDF, { data });
    const buffer = await renderToBuffer(element);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="wht-cert-${data.cert_no}.pdf"`,
      },
    });
  });


import { Elysia } from 'elysia';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { D } from '@wind-acc/shared';
import {
  ListReceiptsQuery,
  CreateReceiptBody,
  UpdateReceiptBody,
  VoidReceiptBody,
} from '@wind-acc/shared';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import {
  createDraft,
  post,
  voidReceipt,
  listReceipts,
  getReceipt,
  updateDraft,
} from '../services/receipt';
import { ReceiptPDF } from '../pdf/receipt';
import type { ReceiptPDFData } from '../pdf/receipt';

export const receiptRoutes = new Elysia({ prefix: '/receipts' })
  .use(authGuard)

  // GET /receipts — paginated list
  .get('', async ({ query }) => {
    const parsed = ListReceiptsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { customer_id, status, period, payment_method, branch, date_from, date_to, q, page, page_size } = parsed.data;
    const offset = (page - 1) * page_size;
    const result = await listReceipts({
      customer_id,
      status,
      period,
      payment_method,
      branch,
      date_from,
      date_to,
      q,
      limit: page_size,
      offset,
    });
    return {
      success: true as const,
      data: result.items,
      meta: { total: result.total, page, page_size },
    };
  })

  // POST /receipts — create DRAFT
  .post('', async ({ user, body, set }) => {
    const parsed = CreateReceiptBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const receipt = await createDraft(parsed.data, user.user_id);
    set.status = 201;
    return { success: true as const, data: receipt };
  })

  // GET /receipts/:id
  .get('/:id', async ({ params }) => {
    const receipt = await getReceipt(params.id);
    if (!receipt) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Receipt', id: params.id });
    }
    return { success: true as const, data: receipt };
  })

  // PATCH /receipts/:id — update DRAFT only
  .patch('/:id', async ({ user, params, body }) => {
    const parsed = UpdateReceiptBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const receipt = await updateDraft(params.id, parsed.data, user.user_id);
    return { success: true as const, data: receipt };
  })

  // POST /receipts/:id/post
  .post('/:id/post', async ({ user, params }) => {
    const receipt = await post(params.id, user.user_id);
    return { success: true as const, data: receipt };
  })

  // POST /receipts/:id/void
  .post('/:id/void', async ({ user, params, body }) => {
    const parsed = VoidReceiptBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const receipt = await voidReceipt(params.id, user.user_id, parsed.data.reason);
    return { success: true as const, data: receipt };
  })

  // GET /receipts/:id/pdf — render ใบเสร็จรับเงิน
  .get('/:id/pdf', async ({ params }) => {
    const receipt = await getReceipt(params.id);
    if (!receipt) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'Receipt', id: params.id });
    }

    // Load invoice numbers for each application
    const invoiceIds = receipt.applications.map(a => a.invoice_id);
    const invoices = invoiceIds.length > 0
      ? await prisma.salesInvoice.findMany({
          where: { id: { in: invoiceIds } },
          select: { id: true, invoice_no: true },
        })
      : [];
    const invoiceMap = new Map(invoices.map(inv => [inv.id, inv.invoice_no]));

    const sumApplied = receipt.applications.reduce(
      (acc, a) => acc.plus(D(a.applied_amount.toString())),
      D(0),
    );
    const total = D(receipt.total_amount.toString());
    const advance = total.minus(sumApplied);

    const pdfData: ReceiptPDFData = {
      receipt_no: receipt.receipt_no,
      receipt_date: receipt.receipt_date,
      customer_name: receipt.customer.name,
      customer_name_th: receipt.customer.name_th,
      customer_tax_id: receipt.customer.tax_id,
      customer_address: receipt.customer.address,
      customer_phone: receipt.customer.phone,
      payment_method: receipt.payment_method,
      bank_name: receipt.bank_account?.name ?? null,
      slip_ref: receipt.slip_ref,
      total_amount: total.toFixed(2),
      card_fee: D(receipt.card_fee.toString()).toFixed(2),
      applications: receipt.applications.map(a => ({
        invoice_no: invoiceMap.get(a.invoice_id) ?? a.invoice_id,
        applied_amount: D(a.applied_amount.toString()).toFixed(2),
      })),
      sum_applied: sumApplied.toFixed(2),
      advance: advance.toFixed(2),
      notes: receipt.notes,
    };

    const pdfBuf = await renderToBuffer(createElement(ReceiptPDF, { data: pdfData }));
    return new Response(pdfBuf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="receipt-${receipt.receipt_no}.pdf"`,
      },
    });
  });

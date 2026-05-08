import { Elysia } from 'elysia';
import { createElement } from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import type { VatType } from '@prisma/client';
import { D, sumD } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import {
  ListTaxFilingsQuery,
  PreviewPP30Body,
  CreatePP30Body,
  PreviewPND3Body,
  CreatePND3Body,
  PreviewPND53Body,
  CreatePND53Body,
  FlagNonClaimableBody,
  SubmitFilingBody,
} from '@wind-acc/shared';
import {
  createDraftPP30,
  flagNonClaimable,
  finalizePP30,
  submitPP30,
  createDraftPND,
  finalizePND,
  submitPND,
} from '../services/tax-filing';
import { aggregatePP30 } from '../lib/tax/pp30-aggregate';
import type { PP30Aggregate, VatRegisterRow } from '../lib/tax/pp30-aggregate';
import { aggregatePND } from '../lib/tax/pnd-aggregate';
import type { PndAggregateResult, PndRow, PndVendorGroup } from '../lib/tax/pnd-aggregate';
import { PP30PDF } from '../pdf/pp30';
import type { PP30Data } from '../pdf/pp30';
import { Pnd3PDF } from '../pdf/pnd3';
import type { Pnd3Data } from '../pdf/pnd3';
import { Pnd53PDF } from '../pdf/pnd53';
import type { Pnd53Data } from '../pdf/pnd53';
import { WhtCertPDF, type WhtCertData } from '../pdf/wht-cert';
import { WHT_RATES } from '@wind-acc/shared';

const WIND_CLINIC_ISSUER = {
  name_en: 'WIND CLINIC Co., Ltd.',
  name_th: 'บริษัท วินด์ คลินิก จำกัด',
  tax_id: '0105566123456',
  branch_office: '00000',
  address: 'XX/X ถนนสุขุมวิท กรุงเทพฯ 10110',
};

const BRANCH_OFFICE_MAP: Record<string, string> = {
  TL: '00000',
  EK: '00001',
  RAMA9: '00002',
};

// Reconstruct a PP30Aggregate from rows locked to a submitted filing.
function buildAggregateFromRows(
  period_code: string,
  records: Array<{
    id: string;
    vat_type: VatType;
    txn_date: Date;
    period_code: string;
    tax_invoice_no: string | null;
    counterparty_name: string;
    counterparty_tax_id: string | null;
    net_amount: { toString(): string };
    vat_amount: { toString(): string };
    gross_amount: { toString(): string };
    vat_rate: { toString(): string };
    source_type: string;
    source_id: string;
    claimable: boolean;
    filing_id: string | null;
    reversal_of_id: string | null;
  }>,
): PP30Aggregate {
  const rows: VatRegisterRow[] = records.map(r => ({
    id: r.id,
    vat_type: r.vat_type,
    txn_date: r.txn_date.toISOString(),
    period_code: r.period_code,
    tax_invoice_no: r.tax_invoice_no,
    counterparty_name: r.counterparty_name,
    counterparty_tax_id: r.counterparty_tax_id,
    net_amount: D(r.net_amount.toString()).toFixed(2),
    vat_amount: D(r.vat_amount.toString()).toFixed(2),
    gross_amount: D(r.gross_amount.toString()).toFixed(2),
    vat_rate: D(r.vat_rate.toString()).toFixed(2),
    source_type: r.source_type,
    source_id: r.source_id,
    claimable: r.claimable,
    filing_id: r.filing_id,
    reversal_of_id: r.reversal_of_id,
  }));

  const output_rows = rows.filter(r => r.vat_type === 'OUTPUT');
  const input_rows = rows.filter(r => r.vat_type === 'INPUT' && r.claimable);
  const non_claimable_rows = rows.filter(r => r.vat_type === 'INPUT' && !r.claimable);

  const outputVat = sumD(output_rows.map(r => D(r.vat_amount)));
  const inputVat = sumD(input_rows.map(r => D(r.vat_amount)));
  const vatPayable = outputVat.minus(inputVat);

  return {
    period_code,
    output_vat: outputVat.toFixed(2),
    input_vat: inputVat.toFixed(2),
    vat_payable: vatPayable.toFixed(2),
    output_rows,
    input_rows,
    non_claimable_rows,
  };
}

async function buildPndAggregateFromLocked(filing: {
  id: string;
  period_code: string;
  filing_type: string;
}): Promise<PndAggregateResult> {
  const vendorType = filing.filing_type === 'PND3' ? 'INDIVIDUAL' : 'JURISTIC';
  const pndType = filing.filing_type === 'PND3' ? 'PND3' : 'PND53';

  const records = await prisma.withholdingRecord.findMany({
    where: { filing_id: filing.id },
    include: {
      payment: {
        select: {
          vendor: { select: { id: true, name: true, name_th: true, tax_id: true } },
        },
      },
    },
    orderBy: [{ vendor_id: 'asc' }, { payment_date: 'asc' }, { cert_no: 'asc' }],
  });

  const rows: PndRow[] = records.map(r => ({
    record_id: r.id,
    vendor_id: r.vendor_id,
    vendor_name: r.payment.vendor.name,
    vendor_name_th: r.payment.vendor.name_th,
    vendor_tax_id: r.vendor_tax_id ?? r.payment.vendor.tax_id,
    wht_type: r.wht_type,
    wht_rate: r.wht_rate.toString(),
    gross_amount: r.gross_amount.toString(),
    wht_amount: r.wht_amount.toString(),
    cert_no: r.cert_no,
    payment_date: r.payment_date,
    payment_id: r.payment_id,
  }));

  const groupMap = new Map<string, PndVendorGroup>();
  for (const row of rows) {
    let g = groupMap.get(row.vendor_id);
    if (!g) {
      g = {
        vendor_id: row.vendor_id,
        vendor_name: row.vendor_name,
        vendor_name_th: row.vendor_name_th,
        vendor_tax_id: row.vendor_tax_id,
        total_gross: '0.00',
        total_wht: '0.00',
        lines: [],
      };
      groupMap.set(row.vendor_id, g);
    }
    g.lines.push(row);
  }

  const groups: PndVendorGroup[] = [];
  for (const g of groupMap.values()) {
    g.total_gross = sumD(g.lines.map(l => D(l.gross_amount))).toFixed(2);
    g.total_wht = sumD(g.lines.map(l => D(l.wht_amount))).toFixed(2);
    groups.push(g);
  }

  return {
    period_code: filing.period_code,
    pnd_type: pndType,
    vendor_type: vendorType,
    total_gross: sumD(rows.map(r => D(r.gross_amount))).toFixed(2),
    total_wht: sumD(rows.map(r => D(r.wht_amount))).toFixed(2),
    recipient_count: groups.length,
    rows,
    groups,
  };
}

async function buildWhtCertData(certId: string, paymentId?: string): Promise<WhtCertData> {
  const cert = await prisma.withholdingRecord.findUnique({
    where: { id: certId },
    include: { payment: { select: { id: true, branch_code: true } } },
  });

  if (!cert) throw new BusinessRuleError('NOT_FOUND', { entity: 'WithholdingRecord', id: certId });
  if (paymentId && cert.payment_id !== paymentId) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'WithholdingRecord', id: certId });
  }

  const vendor = await prisma.vendor.findUnique({
    where: { id: cert.vendor_id },
    select: { name: true, name_th: true, tax_id: true, address: true },
  });
  if (!vendor) throw new BusinessRuleError('NOT_FOUND', { entity: 'Vendor', id: cert.vendor_id });

  const year = cert.period_code.slice(0, 4);
  const ytd = await prisma.withholdingRecord.aggregate({
    where: { vendor_id: cert.vendor_id, period_code: { startsWith: `${year}-` } },
    _sum: { gross_amount: true, wht_amount: true },
  });

  const whtEntry = WHT_RATES.find(r => r.key === cert.wht_type);
  const branch_office = BRANCH_OFFICE_MAP[cert.payment.branch_code] ?? '00000';

  return {
    cert_no: cert.cert_no,
    payment_date: cert.payment_date,
    wht_type_label: whtEntry?.label_th ?? cert.wht_type,
    wht_type_rd_code: whtEntry?.rd_code ?? '',
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

export const taxFilingRoutes = new Elysia({ prefix: '/tax-filings' })
  .use(authGuard)

  // GET /tax-filings — list with optional ?type and ?period filters
  .get('', async ({ query }) => {
    const parsed = ListTaxFilingsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const { type, period, page, page_size } = parsed.data;
    const offset = (page - 1) * page_size;

    const where: Parameters<typeof prisma.taxFiling.findMany>[0]['where'] = {};
    if (type) where.filing_type = type;
    if (period) where.period_code = period;

    const [items, total] = await Promise.all([
      prisma.taxFiling.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: page_size,
      }),
      prisma.taxFiling.count({ where }),
    ]);

    return { success: true as const, data: items, meta: { total, page, page_size } };
  })

  // POST /tax-filings/pp30/preview — aggregate without persisting
  .post('/pp30/preview', async ({ body }) => {
    const parsed = PreviewPP30Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const aggregate = await aggregatePP30(parsed.data.period);
    return { success: true as const, data: aggregate };
  })

  // POST /tax-filings/pp30 — create DRAFT filing
  .post('/pp30', async ({ user, body, set }) => {
    const parsed = CreatePP30Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const filing = await createDraftPP30(parsed.data.period, user.user_id);
    set.status = 201;
    return { success: true as const, data: filing };
  })

  // POST /tax-filings/pnd3/preview — aggregate INDIVIDUAL vendor WHT without persisting
  .post('/pnd3/preview', async ({ body }) => {
    const parsed = PreviewPND3Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const aggregate = await aggregatePND(parsed.data.period, 'INDIVIDUAL');
    return { success: true as const, data: aggregate };
  })

  // POST /tax-filings/pnd3 — create DRAFT PND3 filing
  .post('/pnd3', async ({ user, body, set }) => {
    const parsed = CreatePND3Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const filing = await createDraftPND(parsed.data.period, 'PND3', user.user_id);
    set.status = 201;
    return { success: true as const, data: filing };
  })

  // POST /tax-filings/pnd53/preview — aggregate JURISTIC vendor WHT without persisting
  .post('/pnd53/preview', async ({ body }) => {
    const parsed = PreviewPND53Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const aggregate = await aggregatePND(parsed.data.period, 'JURISTIC');
    return { success: true as const, data: aggregate };
  })

  // POST /tax-filings/pnd53 — create DRAFT PND53 filing
  .post('/pnd53', async ({ user, body, set }) => {
    const parsed = CreatePND53Body.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const filing = await createDraftPND(parsed.data.period, 'PND53', user.user_id);
    set.status = 201;
    return { success: true as const, data: filing };
  })

  // GET /tax-filings/wht-certs — list / filter WHT certificates
  .get('/wht-certs', async ({ query }) => {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.page_size ?? 25)));
    const offset = (page - 1) * pageSize;

    const where: Parameters<typeof prisma.withholdingRecord.findMany>[0]['where'] = {};
    if (query.vendor_id) where.vendor_id = query.vendor_id as string;
    if (query.status) where.status = query.status as string;
    if (query.period) where.period_code = query.period as string;
    if (query.date_from || query.date_to) {
      where.payment_date = {};
      if (query.date_from) where.payment_date.gte = new Date(query.date_from as string);
      if (query.date_to) where.payment_date.lte = new Date(query.date_to as string);
    }
    if (query.q) {
      const q = query.q as string;
      where.OR = [
        { cert_no: { contains: q, mode: 'insensitive' } },
        { payment: { vendor: { name: { contains: q, mode: 'insensitive' } } } },
        { payment: { vendor: { name_th: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.withholdingRecord.findMany({
        where,
        include: {
          payment: {
            select: {
              id: true,
              payment_no: true,
              vendor: { select: { id: true, code: true, name: true, name_th: true } },
            },
          },
        },
        orderBy: { payment_date: 'desc' },
        skip: offset,
        take: pageSize,
      }),
      prisma.withholdingRecord.count({ where }),
    ]);

    return { success: true as const, data: items, meta: { total, page, page_size: pageSize } };
  })

  // POST /tax-filings/wht-certs/bulk-regenerate
  .post('/wht-certs/bulk-regenerate', async ({ body }) => {
    const b = body as { period?: string };
    if (!b?.period || !/^\d{4}-\d{2}$/.test(b.period)) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        field: 'period',
        reason: 'required, format YYYY-MM',
      });
    }

    const records = await prisma.withholdingRecord.findMany({
      where: { period_code: b.period, status: 'ACTIVE' },
      select: { id: true, cert_no: true },
    });

    const errors: string[] = [];
    for (const rec of records) {
      try {
        await buildWhtCertData(rec.id);
      } catch {
        errors.push(rec.cert_no);
      }
    }

    if (errors.length > 0) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        reason: 'some_certs_failed',
        failed_cert_nos: errors,
      });
    }

    return {
      success: true as const,
      data: { count: records.length, period: b.period, cert_nos: records.map(r => r.cert_no) },
    };
  })

  // GET /tax-filings/wht-certs/:id/pdf
  .get('/wht-certs/:id/pdf', async ({ params }) => {
    const data = await buildWhtCertData(params.id);
    const element = React.createElement(WhtCertPDF, { data });
    const buffer = await renderToBuffer(element);
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="wht-cert-${data.cert_no}.pdf"`,
      },
    });
  })

  // GET /tax-filings/:id
  .get('/:id', async ({ params }) => {
    const filing = await prisma.taxFiling.findUnique({ where: { id: params.id } });
    if (!filing) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'TaxFiling', id: params.id });
    }
    return { success: true as const, data: filing };
  })

  // POST /tax-filings/:id/flag-non-claimable
  .post('/:id/flag-non-claimable', async ({ user, params, body }) => {
    const parsed = FlagNonClaimableBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const filing = await flagNonClaimable(params.id, parsed.data.vat_register_ids, user.user_id);
    return { success: true as const, data: filing };
  })

  // POST /tax-filings/:id/finalize — dispatch to PP30 or PND lifecycle
  .post('/:id/finalize', async ({ user, params }) => {
    const filing = await prisma.taxFiling.findUnique({
      where: { id: params.id },
      select: { filing_type: true },
    });
    if (!filing) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'TaxFiling', id: params.id });
    }
    const updated =
      filing.filing_type === 'PP30'
        ? await finalizePP30(params.id, user.user_id)
        : await finalizePND(params.id, user.user_id);
    return { success: true as const, data: updated };
  })

  // POST /tax-filings/:id/submit — dispatch to PP30 or PND lifecycle
  .post('/:id/submit', async ({ user, params, body }) => {
    const parsed = SubmitFilingBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const filing = await prisma.taxFiling.findUnique({
      where: { id: params.id },
      select: { filing_type: true },
    });
    if (!filing) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'TaxFiling', id: params.id });
    }
    const updated =
      filing.filing_type === 'PP30'
        ? await submitPP30(params.id, parsed.data, user.user_id)
        : await submitPND(params.id, parsed.data, user.user_id);
    return { success: true as const, data: updated };
  })

  // GET /tax-filings/:id/pdf — render PP30, PND3, or PND53 PDF
  .get('/:id/pdf', async ({ params }) => {
    const filing = await prisma.taxFiling.findUnique({ where: { id: params.id } });
    if (!filing) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'TaxFiling', id: params.id });
    }

    if (filing.filing_type === 'PP30') {
      let aggregate: PP30Aggregate;
      if (filing.status === 'SUBMITTED') {
        const records = await prisma.vatRegister.findMany({
          where: { filing_id: filing.id },
          orderBy: [{ txn_date: 'asc' }, { created_at: 'asc' }],
        });
        aggregate = buildAggregateFromRows(filing.period_code, records);
      } else {
        aggregate = await aggregatePP30(filing.period_code);
      }
      const pdfData: PP30Data = {
        aggregate,
        filing_no: filing.filing_no,
        issuer: WIND_CLINIC_ISSUER,
        printed_at: new Date(),
      };
      const buffer = await renderToBuffer(createElement(PP30PDF, { data: pdfData }));
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pp30-${filing.filing_no}.pdf"`,
        },
      });
    }

    if (filing.filing_type === 'PND3') {
      const aggregate: PndAggregateResult =
        filing.status === 'SUBMITTED'
          ? await buildPndAggregateFromLocked(filing)
          : await aggregatePND(filing.period_code, 'INDIVIDUAL');
      const pdfData: Pnd3Data = {
        aggregate,
        filing_no: filing.filing_no,
        issuer: WIND_CLINIC_ISSUER,
        printed_at: new Date(),
      };
      const buffer = await renderToBuffer(createElement(Pnd3PDF, { data: pdfData }));
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pnd3-${filing.filing_no}.pdf"`,
        },
      });
    }

    if (filing.filing_type === 'PND53') {
      const aggregate: PndAggregateResult =
        filing.status === 'SUBMITTED'
          ? await buildPndAggregateFromLocked(filing)
          : await aggregatePND(filing.period_code, 'JURISTIC');
      const pdfData: Pnd53Data = {
        aggregate,
        filing_no: filing.filing_no,
        issuer: WIND_CLINIC_ISSUER,
        printed_at: new Date(),
      };
      const buffer = await renderToBuffer(createElement(Pnd53PDF, { data: pdfData }));
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="pnd53-${filing.filing_no}.pdf"`,
        },
      });
    }

    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'unknown_filing_type',
      filing_type: filing.filing_type,
    });
  });

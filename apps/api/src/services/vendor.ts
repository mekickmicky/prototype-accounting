import type { DocStatus, Prisma, Vendor, VendorType } from '@prisma/client';
import { logAuditEvent } from './audit-log';
import { nextDocNo } from './numbering';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const OPEN_STATUSES: DocStatus[] = ['DRAFT', 'POSTED', 'PARTIAL_PAID'];

const TAX_ID_RE = /^\d{13}$/;

const DEFAULT_WITHHOLDING_RATES = {
  services: '3',
  rent: '5',
  goods: '0',
  advertising: '2',
  interest: '1',
  professional: '3',
  royalties: '3',
  transportation: '1',
};

export interface VendorFilters {
  q?: string;
  vendor_type?: VendorType;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export interface VendorListResult {
  items: Vendor[];
  pagination: { total: number; limit: number; offset: number };
}

export interface CreateVendorInput {
  code?: string;
  name: string;
  name_th?: string;
  vendor_type: VendorType;
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
  default_ap_account_code?: string;
  default_withholding_rates?: Record<string, string>;
}

export interface UpdateVendorInput {
  name?: string;
  name_th?: string;
  vendor_type?: VendorType;
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
  default_ap_account_code?: string;
  default_withholding_rates?: Record<string, string>;
  is_active?: boolean;
}

function validateTaxId(tax_id: string | undefined | null): void {
  if (tax_id && !TAX_ID_RE.test(tax_id)) {
    throw new BusinessRuleError('VALIDATION_ERROR', { field: 'tax_id', reason: 'must_be_13_digits' });
  }
}

export async function listVendors(filters: VendorFilters = {}): Promise<VendorListResult> {
  const { q, vendor_type, active, limit = 50, offset = 0 } = filters;

  const where: Prisma.VendorWhereInput = { deleted_at: null };
  if (active !== undefined) where.is_active = active;
  if (vendor_type !== undefined) where.vendor_type = vendor_type;
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { name_th: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await db.$transaction([
    db.vendor.findMany({ where, orderBy: { code: 'asc' }, take: limit, skip: offset }),
    db.vendor.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function getVendor(id: string): Promise<Vendor | null> {
  return db.vendor.findFirst({ where: { id, deleted_at: null } });
}

export async function createVendor(
  input: CreateVendorInput,
  actor_id?: string,
): Promise<Vendor> {
  validateTaxId(input.tax_id);

  return db.$transaction(async (tx: Tx) => {
    let code = input.code?.trim();
    if (!code) {
      code = await nextDocNo(tx, 'VEND', new Date().getFullYear(), 'vendors', 'code');
    } else {
      const existing = await tx.vendor.findUnique({ where: { code } });
      if (existing) throw new BusinessRuleError('DUPLICATE_NUMBER', { field: 'code', code });
    }

    const vendor = await tx.vendor.create({
      data: {
        code,
        name: input.name,
        name_th: input.name_th ?? null,
        vendor_type: input.vendor_type,
        tax_id: input.tax_id ?? null,
        branch_office: input.branch_office ?? '00000',
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        payment_terms_days: input.payment_terms_days ?? 30,
        default_ap_account_code: input.default_ap_account_code ?? '21010',
        default_withholding_rates: input.default_withholding_rates ?? DEFAULT_WITHHOLDING_RATES,
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'Vendor',
      entity_id: vendor.id,
      after: vendor,
    });

    return vendor;
  });
}

export async function updateVendor(
  id: string,
  input: UpdateVendorInput,
  ifMatch: Date | string,
  actor_id?: string,
): Promise<Vendor> {
  validateTaxId(input.tax_id);

  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.vendor.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { vendor_id: id });

    const matchTs = ifMatch instanceof Date ? ifMatch : new Date(ifMatch);
    if (existing.updated_at.getTime() !== matchTs.getTime()) {
      throw new BusinessRuleError('STALE_RECORD', {
        id,
        expected: matchTs.toISOString(),
        actual: existing.updated_at.toISOString(),
      });
    }

    const updated = await tx.vendor.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.name_th !== undefined && { name_th: input.name_th }),
        ...(input.vendor_type !== undefined && { vendor_type: input.vendor_type }),
        ...(input.tax_id !== undefined && { tax_id: input.tax_id }),
        ...(input.branch_office !== undefined && { branch_office: input.branch_office }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.payment_terms_days !== undefined && { payment_terms_days: input.payment_terms_days }),
        ...(input.default_ap_account_code !== undefined && { default_ap_account_code: input.default_ap_account_code }),
        ...(input.default_withholding_rates !== undefined && { default_withholding_rates: input.default_withholding_rates }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'Vendor',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

export async function softDeleteVendor(id: string, actor_id?: string): Promise<void> {
  await db.$transaction(async (tx: Tx) => {
    const existing = await tx.vendor.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { vendor_id: id });

    const openCount = await tx.bill.count({
      where: { vendor_id: id, status: { in: OPEN_STATUSES } },
    });
    if (openCount > 0) {
      throw new BusinessRuleError('VENDOR_HAS_OPEN_BILLS', { vendor_id: id, open_count: openCount });
    }

    const deleted = await tx.vendor.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'DELETE',
      entity_type: 'Vendor',
      entity_id: id,
      before: existing,
      after: deleted,
    });
  });
}

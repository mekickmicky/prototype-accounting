import type { Customer, DocStatus, Prisma } from '@prisma/client';
import { logAuditEvent } from './audit-log';
import { nextDocNo } from './numbering';
import { BusinessRuleError } from '../lib/errors';
import { prisma as db } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

const OPEN_STATUSES: DocStatus[] = ['DRAFT', 'POSTED', 'PARTIAL_PAID'];

const TAX_ID_RE = /^\d{13}$/;

export interface CustomerFilters {
  q?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
}

export interface CustomerListResult {
  items: Customer[];
  pagination: { total: number; limit: number; offset: number };
}

export interface CreateCustomerInput {
  code?: string;
  name: string;
  name_th?: string;
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
  default_ar_account_code?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  name_th?: string;
  tax_id?: string;
  branch_office?: string;
  address?: string;
  phone?: string;
  email?: string;
  payment_terms_days?: number;
  default_ar_account_code?: string;
  is_active?: boolean;
}

function validateTaxId(tax_id: string | undefined | null): void {
  if (tax_id && !TAX_ID_RE.test(tax_id)) {
    throw new BusinessRuleError('VALIDATION_ERROR', { field: 'tax_id', reason: 'must_be_13_digits' });
  }
}

export async function listCustomers(filters: CustomerFilters = {}): Promise<CustomerListResult> {
  const { q, active, limit = 50, offset = 0 } = filters;

  const where: Prisma.CustomerWhereInput = { deleted_at: null };
  if (active !== undefined) where.is_active = active;
  if (q) {
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { name_th: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await db.$transaction([
    db.customer.findMany({ where, orderBy: { code: 'asc' }, take: limit, skip: offset }),
    db.customer.count({ where }),
  ]);

  return { items, pagination: { total, limit, offset } };
}

export async function getCustomer(id: string): Promise<Customer | null> {
  return db.customer.findFirst({ where: { id, deleted_at: null } });
}

export async function createCustomer(
  input: CreateCustomerInput,
  actor_id?: string,
): Promise<Customer> {
  validateTaxId(input.tax_id);

  return db.$transaction(async tx => {
    let code = input.code?.trim();
    if (!code) {
      code = await nextDocNo(tx, 'CUST', new Date().getFullYear(), 'customers', 'code');
    } else {
      const existing = await tx.customer.findUnique({ where: { code } });
      if (existing) throw new BusinessRuleError('DUPLICATE_NUMBER', { field: 'code', code });
    }

    const customer = await tx.customer.create({
      data: {
        code,
        name: input.name,
        name_th: input.name_th ?? null,
        tax_id: input.tax_id ?? null,
        branch_office: input.branch_office ?? '00000',
        address: input.address ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        payment_terms_days: input.payment_terms_days ?? 0,
        default_ar_account_code: input.default_ar_account_code ?? '12010',
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'CREATE',
      entity_type: 'Customer',
      entity_id: customer.id,
      after: customer,
    });

    return customer;
  });
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  ifMatch: Date | string,
  actor_id?: string,
): Promise<Customer> {
  validateTaxId(input.tax_id);

  return db.$transaction(async tx => {
    const existing = await tx.customer.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { customer_id: id });

    const matchTs = ifMatch instanceof Date ? ifMatch : new Date(ifMatch);
    if (existing.updated_at.getTime() !== matchTs.getTime()) {
      throw new BusinessRuleError('STALE_RECORD', {
        id,
        expected: matchTs.toISOString(),
        actual: existing.updated_at.toISOString(),
      });
    }

    const updated = await tx.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.name_th !== undefined && { name_th: input.name_th }),
        ...(input.tax_id !== undefined && { tax_id: input.tax_id }),
        ...(input.branch_office !== undefined && { branch_office: input.branch_office }),
        ...(input.address !== undefined && { address: input.address }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.payment_terms_days !== undefined && { payment_terms_days: input.payment_terms_days }),
        ...(input.default_ar_account_code !== undefined && { default_ar_account_code: input.default_ar_account_code }),
        ...(input.is_active !== undefined && { is_active: input.is_active }),
      },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'UPDATE',
      entity_type: 'Customer',
      entity_id: id,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

export async function softDeleteCustomer(id: string, actor_id?: string): Promise<void> {
  await db.$transaction(async (tx: Tx) => {
    const existing = await tx.customer.findFirst({ where: { id, deleted_at: null } });
    if (!existing) throw new BusinessRuleError('NOT_FOUND', { customer_id: id });

    const openCount = await tx.salesInvoice.count({
      where: { customer_id: id, status: { in: OPEN_STATUSES } },
    });
    if (openCount > 0) {
      throw new BusinessRuleError('CUSTOMER_HAS_OPEN_INVOICES', { customer_id: id, open_count: openCount });
    }

    const deleted = await tx.customer.update({
      where: { id },
      data: { deleted_at: new Date(), is_active: false },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'DELETE',
      entity_type: 'Customer',
      entity_id: id,
      before: existing,
      after: deleted,
    });
  });
}

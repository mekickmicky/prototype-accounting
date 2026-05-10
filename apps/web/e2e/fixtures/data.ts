import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stackForWorker } from './stack';

const __dirname = dirname(fileURLToPath(import.meta.url));

function today(): string {
  return new Date().toISOString().split('T')[0]!;
}

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().split('T')[0]!;
}

async function apiRequest(
  workerIndex: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const { apiUrl } = stackForWorker(workerIndex);

  const { resolve } = await import('node:path');
  const { readFileSync } = await import('node:fs');
  const statePath = resolve(__dirname, `.auth-admin-w${workerIndex}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    cookies: { name: string; value: string; domain: string }[];
  };
  const cookieHeader = state.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  return fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function get<T>(workerIndex: number, path: string): Promise<T> {
  const res = await apiRequest(workerIndex, 'GET', path);
  const json = (await res.json()) as { success: boolean; data?: T; error?: { code: string; message: string } };
  if (!json.success) {
    throw new Error(`API error: ${json.error?.code} - ${json.error?.message}`);
  }
  if (!json.data) {
    throw new Error(`API response missing data field`);
  }
  return json.data;
}

async function post<T>(workerIndex: number, path: string, body: unknown): Promise<T> {
  const res = await apiRequest(workerIndex, 'POST', path, body);
  const json = (await res.json()) as { success: boolean; data?: T; error?: { code: string; message: string } };
  if (!json.success) {
    throw new Error(`API error: ${json.error?.code} - ${json.error?.message} (POST ${path})`);
  }
  if (!json.data) {
    throw new Error(`API response missing data field (POST ${path})`);
  }
  return json.data;
}

// ── Customer ───────────────────────────────────────────────────────────────────

export async function ensureCustomer(
  workerIndex: number,
  name: string,
): Promise<{ id: string; name: string }> {
  const customers = await get<{ id: string; code: string; name: string; created_at: string }[]>(
    workerIndex,
    '/api/v1/customers?page_size=100',
  );
  const existing = customers.find((c) => c.name === name);
  if (existing) return { id: existing.id, name: existing.name };

  return post(workerIndex, '/api/v1/customers', { name });
}

// ── Vendor ─────────────────────────────────────────────────────────────────────

export async function ensureVendor(
  workerIndex: number,
  name: string,
  _whtRate: number = 3,
  vendorType?: string,
): Promise<{ id: string; name: string }> {
  const list = await get<{ id: string; code: string; name: string }[]>(
    workerIndex,
    '/api/v1/vendors?page_size=100',
  );
  const existing = list.find((v) => v.name === name);
  if (existing) return { id: existing.id, name: existing.name };

  return post(workerIndex, '/api/v1/vendors', {
    name,
    vendor_type: vendorType ?? 'JURISTIC',
  });
}

// ── Invoice ────────────────────────────────────────────────────────────────────

export async function ensurePostedInvoice(
  workerIndex: number,
  customerId: string,
  lines: { description: string; qty: number; unit_price: number; vat_rate?: number }[],
): Promise<{ id: string; document_no: string }> {
  const invoice = await post<{ id: string; document_no: string }>(
    workerIndex,
    '/api/v1/sales-invoices',
    {
      customer_id: customerId,
      branch_code: 'TL',
      issue_date: today(),
      due_date: futureDate(30),
      vat_inclusive: false,
      lines: lines.map((l) => ({
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        vat_rate: String(l.vat_rate ?? 7),
        revenue_account_code: '41010',
      })),
    },
  );
  await post(workerIndex, `/api/v1/sales-invoices/${invoice.id}/post`, {});
  return invoice;
}

// ── Bill ───────────────────────────────────────────────────────────────────────

export async function ensurePostedBill(
  workerIndex: number,
  vendorId: string,
  lines: { description: string; qty: number; unit_price: number; vat_rate?: number }[],
): Promise<{ id: string; document_no: string }> {
  const bill = await post<{ id: string; document_no: string }>(
    workerIndex,
    '/api/v1/bills',
    {
      vendor_id: vendorId,
      branch_code: 'TL',
      issue_date: today(),
      due_date: futureDate(30),
      vat_inclusive: false,
      lines: lines.map((l) => ({
        description: l.description,
        qty: String(l.qty),
        unit_price: String(l.unit_price),
        vat_rate: String(l.vat_rate ?? 7),
        withholding_rate: '3',
        withholding_type: 'services',
        expense_account_code: '51010',
      })),
    },
  );
  await post(workerIndex, `/api/v1/bills/${bill.id}/post`, {});
  return bill;
}

// ── Receipt ────────────────────────────────────────────────────────────────────

export async function ensurePostedReceipt(
  workerIndex: number,
  invoiceId: string,
  amount: number,
): Promise<{ id: string; document_no: string }> {
  const invoice = await get<{ id: string; customer_id: string }>(
    workerIndex,
    `/api/v1/sales-invoices/${invoiceId}`,
  );
  const receipt = await post<{ id: string; document_no: string }>(
    workerIndex,
    '/api/v1/receipts',
    {
      customer_id: invoice.customer_id,
      branch_code: 'TL',
      receipt_date: today(),
      total_amount: String(amount),
      payment_method: 'CASH',
      applications: [{ invoice_id: invoiceId, applied_amount: String(amount) }],
    },
  );
  await post(workerIndex, `/api/v1/receipts/${receipt.id}/post`, {});
  return receipt;
}

// ── Payment ────────────────────────────────────────────────────────────────────

export async function ensurePostedPayment(
  workerIndex: number,
  billId: string,
  amount: number,
): Promise<{ id: string; document_no: string }> {
  const bill = await get<{ id: string; vendor_id: string }>(
    workerIndex,
    `/api/v1/bills/${billId}`,
  );
  const payment = await post<{ id: string; document_no: string }>(
    workerIndex,
    '/api/v1/payments',
    {
      vendor_id: bill.vendor_id,
      branch_code: 'TL',
      payment_date: today(),
      total_amount: String(amount),
      payment_method: 'CASH',
      applications: [{ bill_id: billId, applied_amount: String(amount) }],
    },
  );
  await post(workerIndex, `/api/v1/payments/${payment.id}/post`, {});
  return payment;
}

// ── Period ─────────────────────────────────────────────────────────────────────

export async function ensureClosedPeriod(
  workerIndex: number,
  periodCode: string,
): Promise<void> {
  await post(workerIndex, `/api/v1/periods/${periodCode}/close`, {});
}

// ── Reset ──────────────────────────────────────────────────────────────────────

/**
 * Optional reset endpoint — silently no-ops if the endpoint doesn't exist.
 */
export async function resetWorkerData(workerIndex: number): Promise<void> {
  await apiRequest(workerIndex, 'POST', '/api/v1/__e2e__/reset', {});
}

import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { adminTest } from '../fixtures/auth';
import { stackForWorker } from '../fixtures/stack';
import {
  ensureCustomer,
  ensureVendor,
  ensurePostedInvoice,
  ensurePostedBill,
  ensurePostedPayment,
} from '../fixtures/data';

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadCookieHeader(workerIndex: number): string {
  const statePath = resolve(__dirname, `../fixtures/.auth-admin-w${workerIndex}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    cookies: { name: string; value: string }[];
  };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function apiPost<T>(workerIndex: number, path: string, body: unknown): Promise<T> {
  const { apiUrl } = stackForWorker(workerIndex);
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: loadCookieHeader(workerIndex) },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function apiGet<T>(workerIndex: number, path: string): Promise<T> {
  const { apiUrl } = stackForWorker(workerIndex);
  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Cookie: loadCookieHeader(workerIndex) },
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}

async function fetchPdfBytes(workerIndex: number, path: string): Promise<Buffer> {
  const { apiUrl } = stackForWorker(workerIndex);
  const res = await fetch(`${apiUrl}${path}`, {
    headers: { Cookie: loadCookieHeader(workerIndex) },
  });
  if (!res.ok) throw new Error(`PDF endpoint ${path} returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function assertValidPdf(buf: Buffer, minBytes = 5000): void {
  const header = buf.slice(0, 4).toString('ascii');
  expect(header).toBe('%PDF');
  expect(buf.byteLength).toBeGreaterThan(minBytes);
}

// ── Shared state ──────────────────────────────────────────────────────────────

let invoiceId = '';
let pp30Id = '';
let pnd3Id = '';
let pnd53Id = '';
let paymentId = '';
let whtCertId = '';

// ── Suite ─────────────────────────────────────────────────────────────────────

adminTest.describe.serial('PDF Exports', () => {
  adminTest.beforeAll(async ({}, testInfo) => {
    const wi = testInfo.parallelIndex;

    const customer = await ensureCustomer(wi, 'PDF E2E Customer');
    const indVendor = await ensureVendor(wi, 'PDF E2E IndVendor', 3, 'INDIVIDUAL');
    const jurVendor = await ensureVendor(wi, 'PDF E2E JurVendor', 3, 'JURISTIC');

    // Seed invoice (produces output VAT for PP30)
    const invoice = await ensurePostedInvoice(wi, customer.id, [
      { description: 'PDF Test Service', qty: 1, unit_price: 10000, vat_rate: 7 },
    ]);
    invoiceId = invoice.id;

    // Seed payments (produce WHT records for PND3/PND53)
    const indBill = await ensurePostedBill(wi, indVendor.id, [
      { description: 'PDF Test Ind Service', qty: 1, unit_price: 5000 },
    ]);
    const pmt = await ensurePostedPayment(wi, indBill.id, 5000);
    paymentId = pmt.id;

    const jurBill = await ensurePostedBill(wi, jurVendor.id, [
      { description: 'PDF Test Jur Service', qty: 1, unit_price: 8000 },
    ]);
    await ensurePostedPayment(wi, jurBill.id, 8000);

    // Create PP30 filing and finalize it so PDF renders correctly
    const pp30 = await apiPost<{ id: string }>(wi, '/api/v1/tax-filings/pp30', { period: '2026-05' });
    pp30Id = pp30.id;
    await apiPost(wi, `/api/v1/tax-filings/${pp30Id}/finalize`, {});

    // Create PND3 filing (DRAFT is sufficient for PDF)
    const pnd3 = await apiPost<{ id: string }>(wi, '/api/v1/tax-filings/pnd3', { period: '2026-05' });
    pnd3Id = pnd3.id;

    // Create PND53 filing
    const pnd53 = await apiPost<{ id: string }>(wi, '/api/v1/tax-filings/pnd53', { period: '2026-05' });
    pnd53Id = pnd53.id;

    // Get the WHT cert auto-created from the payment above
    const certs = await apiGet<Array<{ id: string }>>(
      wi,
      '/api/v1/tax-filings/wht-certs?period=2026-05&page_size=5',
    );
    expect(certs.length).toBeGreaterThan(0);
    whtCertId = certs[0]!.id;
  });

  // PDF-01 🔴
  adminTest('PDF-01: Invoice PDF — valid %PDF, size > 5KB', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    await page.goto(`${webUrl}/ar/invoices/${invoiceId}`);
    await expect(page).not.toHaveURL(/\/login/);

    await expect(page.locator('[data-testid="action-export-pdf"]')).toBeVisible({ timeout: 10_000 });

    const buf = await fetchPdfBytes(wi, `/api/v1/sales-invoices/${invoiceId}/pdf`);
    assertValidPdf(buf, 5000);
  });

  // PDF-02 🔴
  adminTest('PDF-02: PP30 PDF — valid %PDF, FINALIZED filing', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    await page.goto(`${webUrl}/tax/pp30/${pp30Id}`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="action-export-pdf"]')).toBeVisible({ timeout: 10_000 });

    const buf = await fetchPdfBytes(wi, `/api/v1/tax-filings/${pp30Id}/pdf`);
    assertValidPdf(buf, 5000);
  });

  // PDF-03 🔴
  adminTest('PDF-03: PND3 PDF — valid %PDF', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    await page.goto(`${webUrl}/tax/pnd3/${pnd3Id}`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('[data-testid="action-export-pdf"]')).toBeVisible({ timeout: 10_000 });

    const buf = await fetchPdfBytes(wi, `/api/v1/tax-filings/${pnd3Id}/pdf`);
    assertValidPdf(buf, 5000);
  });

  // PDF-04 🔴
  adminTest('PDF-04: PND53 PDF — valid %PDF, total-withholding not NaN', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    await page.goto(`${webUrl}/tax/pnd53/${pnd53Id}`);
    await expect(page).not.toHaveURL(/\/login/);

    // Spec requirement: assert total-withholding present before PDF click
    const totalEl = page.locator('[data-testid="total-withholding"]');
    await expect(totalEl).toBeVisible({ timeout: 10_000 });
    const totalText = await totalEl.innerText();
    const totalValue = totalText.replace(/[฿,\s]/g, '');
    expect(totalValue).toMatch(/^\d+\.\d{2}$/);
    expect(Number(totalValue)).toBeGreaterThan(0);

    await expect(page.locator('[data-testid="action-export-pdf"]')).toBeVisible({ timeout: 5_000 });

    const buf = await fetchPdfBytes(wi, `/api/v1/tax-filings/${pnd53Id}/pdf`);
    assertValidPdf(buf, 5000);
  });

  // PDF-05 🔴
  adminTest('PDF-05: WHT Certificate PDF — valid %PDF', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    await page.goto(`${webUrl}/tax/wht-certs`);
    await expect(page).not.toHaveURL(/\/login/);

    // Verify "Preview PDF" action button is present on first row
    await expect(page.locator('[data-testid="action-pdf"]').first()).toBeVisible({ timeout: 10_000 });

    const buf = await fetchPdfBytes(wi, `/api/v1/tax-filings/wht-certs/${whtCertId}/pdf`);
    assertValidPdf(buf, 5000);
  });

  // PDF-06 🔴 — regression test for T-14.5
  adminTest('PDF-06: Payment voucher PDF — valid %PDF, size > 3KB, download fires', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);
    const wi = testInfo.parallelIndex;

    // Verify the payment is accessible via API before navigating (diagnose 500 errors)
    const apiResp = await fetch(`${apiUrl}/api/v1/payments/${paymentId}`, {
      headers: { Cookie: loadCookieHeader(wi) },
    });
    const apiBody = await apiResp.json() as { success: boolean; error?: { code: string; message: string } };
    expect(apiResp.status, `API GET /payments/${paymentId} failed: ${JSON.stringify(apiBody.error)}`).toBe(200);

    await page.goto(`${webUrl}/ap/payments/${paymentId}`);
    await expect(page).not.toHaveURL(/\/login/);
    // Wait for client-side fetch to complete (useEffect fires after hydration)
    await expect(page.locator('[data-testid="status-badge"]')).toContainText('Posted', { timeout: 15_000 });

    const downloadLink = page.locator('[data-testid="action-export-pdf"]');
    await expect(downloadLink).toBeVisible({ timeout: 5_000 });

    // Payment page has `download` attribute so waitForEvent('download') fires
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      downloadLink.click(),
    ]);
    expect(download).toBeTruthy();

    const buf = await fetchPdfBytes(wi, `/api/v1/payments/${paymentId}/pdf`);
    assertValidPdf(buf, 3000);
  });

  // PDF-07 🔴 — edge-case: long Thai name + max VAT lines + notes with newlines
  adminTest('PDF-07: Invoice with edge-case data — no crash, valid %PDF', async ({}, testInfo) => {
    const wi = testInfo.parallelIndex;

    const customer = await ensureCustomer(wi, 'PDF E2E Customer');

    const edgeInvoice = await ensurePostedInvoice(wi, customer.id, [
      {
        description:
          'บริการทดสอบ PDF ที่มีชื่อยาวมากเกินกว่าห้าสิบตัวอักษรเพื่อทดสอบ line wrapping ใน react-pdf',
        qty: 1,
        unit_price: 1000,
        vat_rate: 7,
      },
      { description: 'บริการที่ 2 — ทดสอบ multi-line\nรายละเอียดเพิ่มเติม', qty: 2, unit_price: 500, vat_rate: 7 },
      { description: 'Service 3 — fills invoice', qty: 1, unit_price: 2000, vat_rate: 7 },
      { description: 'Service 4 — additional line for max fill', qty: 3, unit_price: 750, vat_rate: 7 },
      { description: 'Service 5 — fifth VAT line', qty: 1, unit_price: 1500, vat_rate: 7 },
    ]);

    const buf = await fetchPdfBytes(wi, `/api/v1/sales-invoices/${edgeInvoice.id}/pdf`);
    assertValidPdf(buf, 5000);
  });
});

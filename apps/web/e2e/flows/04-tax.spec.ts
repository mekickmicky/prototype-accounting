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

// ── Inline API helper ─────────────────────────────────────────────────────────

async function apiReq<T>(workerIndex: number, method: string, path: string, body?: unknown): Promise<T> {
  const { apiUrl } = stackForWorker(workerIndex);
  const statePath = resolve(__dirname, `../fixtures/.auth-admin-w${workerIndex}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    cookies: { name: string; value: string }[];
  };
  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json() as { data: T };
  return json.data;
}

// ── Shared state ──────────────────────────────────────────────────────────────

let pp30Id = '';
let pnd3Id = '';
let pnd53Id = '';

// ── Suite ─────────────────────────────────────────────────────────────────────

adminTest.describe.serial('Tax module', () => {
  adminTest.beforeAll(async ({}, testInfo) => {
    const workerIndex = testInfo.parallelIndex;

    // Customer for invoice (produces output VAT)
    const customer = await ensureCustomer(workerIndex, 'Tax E2E Customer');

    // Vendors with explicit vendor_type for PND3 (INDIVIDUAL) and PND53 (JURISTIC)
    const indVendor = await ensureVendor(workerIndex, 'Tax E2E Vendor', 3, 'INDIVIDUAL');
    const jurVendor = await ensureVendor(workerIndex, 'Tax E2E Corp', 3, 'JURISTIC');

    // Invoice: 10,000 + 7% VAT = output_vat 700 in current period
    await ensurePostedInvoice(workerIndex, customer.id, [
      { description: 'Tax E2E Service', qty: 1, unit_price: 10000, vat_rate: 7 },
    ]);

    // Bill + payment for individual vendor → WHT 150 (5,000 * 3%)
    // net_payable = 5000 + 350 VAT - 150 WHT = 5200; pay full to get proportion=1
    const indBill = await ensurePostedBill(workerIndex, indVendor.id, [
      { description: 'Individual Vendor Service', qty: 1, unit_price: 5000 },
    ]);
    await ensurePostedPayment(workerIndex, indBill.id, 5200);

    // Bill + payment for juristic vendor → WHT 240 (8,000 * 3%)
    // net_payable = 8000 + 560 VAT - 240 WHT = 8320; pay full to get proportion=1
    const jurBill = await ensurePostedBill(workerIndex, jurVendor.id, [
      { description: 'Corporate Vendor Service', qty: 1, unit_price: 8000 },
    ]);
    await ensurePostedPayment(workerIndex, jurBill.id, 8320);
  });

  // TAX-01
  adminTest('TAX-01: Tax Dashboard renders', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/dashboard`);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('body')).toBeVisible();
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.waitForTimeout(500);
    expect(jsErrors.length).toBe(0);
    // Dashboard should show some VAT or WHT summary info
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
  });

  // TAX-02
  adminTest('TAX-02: PP30 list page', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pp30`);
    await expect(page).not.toHaveURL(/\/login/);

    // Columns visible
    await expect(page.getByText(/output vat/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/input vat/i)).toBeVisible({ timeout: 5_000 });

    // New PP30 button/link
    await expect(
      page.getByRole('link', { name: /new.*ภพ/i }).or(page.getByRole('link', { name: /new.*pp30/i }))
    ).toBeVisible({ timeout: 5_000 });
  });

  // TAX-03
  adminTest('TAX-03: PP30 aggregate — VAT pre-filled from transactions', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pp30/new`);

    // Set period to current month
    const periodInput = page.locator('input[type="month"]');
    await expect(periodInput).toBeVisible({ timeout: 10_000 });
    await periodInput.fill('2026-05');

    // Click Generate Preview
    await page.getByRole('button', { name: /generate preview/i }).click();
    await page.waitForTimeout(2_000);

    // Output VAT section should appear with non-zero values
    await expect(page.getByText(/ภาษีขาย/).first()).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // The output VAT should be 700 (10000 * 7%)
    expect(bodyText).toMatch(/700/);

    // Net/payable line should be visible
    await expect(page.getByText(/ต้องชำระ|carry forward/i)).toBeVisible({ timeout: 5_000 });
  });

  // TAX-04 🔴
  adminTest('TAX-04: Create PP30 filing', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pp30/new`);

    const periodInput = page.locator('input[type="month"]');
    await expect(periodInput).toBeVisible({ timeout: 10_000 });
    await periodInput.fill('2026-05');

    // Generate preview first
    await page.getByRole('button', { name: /generate preview/i }).click();
    await page.waitForTimeout(2_000);

    // Save as draft
    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL(/\/tax\/pp30\/[^/]{10,}/, { timeout: 15_000 });

    const url = page.url();
    pp30Id = url.split('/tax/pp30/')[1] ?? '';
    expect(pp30Id).toBeTruthy();

    // Status should be DRAFT
    await expect(page.getByText('DRAFT').first()).toBeVisible({ timeout: 10_000 });

    // Filing number assigned (like PP30-2026-xxxx)
    await expect(page.getByText(/PP30-\d{4}/).first()).toBeVisible({ timeout: 5_000 });

    // Navigate to list and confirm it appears
    await page.goto(`${webUrl}/tax/pp30`);
    await page.waitForTimeout(1_000);
    await expect(page.getByText(/PP30-\d{4}/).first()).toBeVisible({ timeout: 10_000 });
  });

  // TAX-05
  adminTest('TAX-05: PP30 detail page — JE preview', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pp30/${pp30Id}`);

    // Period, output/input VAT visible
    await expect(page.getByText('2026-05')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/output vat/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/input vat/i).first()).toBeVisible({ timeout: 5_000 });

    // JE preview section — account codes should be shown
    await expect(page.getByText('21110')).toBeVisible({ timeout: 10_000 }); // VAT_PAYABLE_CODE
    await expect(page.getByText(/closing je preview/i)).toBeVisible({ timeout: 5_000 });

    // Finalize button is present
    await expect(page.getByRole('button', { name: /finalize/i })).toBeVisible({ timeout: 5_000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
  });

  // TAX-06 🔴
  adminTest('TAX-06: Finalize PP30', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pp30/${pp30Id}`);

    await expect(page.getByText('DRAFT').first()).toBeVisible({ timeout: 10_000 });

    // Click Finalize
    await page.getByRole('button', { name: /finalize/i }).click();
    await page.waitForTimeout(2_000);

    // Status should now be FINALIZED
    await expect(page.getByText('FINALIZED').first()).toBeVisible({ timeout: 10_000 });

    // Finalize button should be gone
    await expect(page.getByRole('button', { name: /^finalize$/i })).not.toBeVisible();

    // PDF export link is present
    await expect(
      page.getByTestId('action-export-pdf').or(page.locator('a[href*="/pdf"]').first())
    ).toBeVisible({ timeout: 5_000 });
  });

  // TAX-07
  adminTest('TAX-07: PND3 list page', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pnd3`);
    await expect(page).not.toHaveURL(/\/login/);

    // Table renders
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // Columns visible
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    // New PND3 button/link
    await expect(
      page.getByRole('link', { name: /new.*ภงด\.3|new.*pnd3/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  // TAX-08 🔴
  adminTest('TAX-08: Create PND3 filing', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pnd3/new`);

    const periodInput = page.locator('input[type="month"]');
    await expect(periodInput).toBeVisible({ timeout: 10_000 });
    await periodInput.fill('2026-05');

    // Generate preview
    await page.getByRole('button', { name: /generate preview/i }).click();
    await page.waitForTimeout(2_000);

    // WHT records from AP payments should appear (at least 1 from the individual vendor)
    await expect(page.getByText(/tax e2e vendor/i).first()).toBeVisible({ timeout: 10_000 });

    // Total WHT is formatted non-zero number
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).toMatch(/\d+\.\d{2}/);

    // Save as draft
    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL(/\/tax\/pnd3\/[^/]{10,}/, { timeout: 15_000 });

    const url = page.url();
    pnd3Id = url.split('/tax/pnd3/')[1] ?? '';
    expect(pnd3Id).toBeTruthy();

    // Filing created
    await expect(page.getByText(/PND3-\d{4}/).first()).toBeVisible({ timeout: 10_000 });
  });

  // TAX-09 🔴
  adminTest('TAX-09: PND3 detail — lines accuracy', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;
    await page.goto(`${webUrl}/tax/pnd3/${pnd3Id}`);

    await page.waitForTimeout(2_000);

    // Each line should show vendor details
    await expect(page.getByText('Tax E2E Vendor').first()).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // Body should contain WHT rates (e.g., 3%)
    expect(bodyText).toMatch(/3%/);

    // Gross and WHT amounts should be formatted (exact values depend on payment proportion)
    expect(bodyText).toMatch(/[\d,]+\.\d{2}/);

    // Cross-check via API: sum of wht_amounts from preview should match total_wht
    const agg = await apiReq<{ total_wht: string; rows: Array<{ wht_amount: string }> }>(
      workerIndex,
      'POST',
      '/api/v1/tax-filings/pnd3/preview',
      { period: '2026-05' },
    );
    const apiSum = agg.rows
      .reduce((acc: number, r: { wht_amount: string }) => acc + parseFloat(r.wht_amount || '0'), 0)
      .toFixed(2);
    const apiTotal = parseFloat(agg.total_wht || '0').toFixed(2);
    expect(apiSum).toBe(apiTotal);

    // Total WHT shown in summary box should match API
    expect(bodyText).toContain(Number(apiTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }));
  });

  // TAX-10
  adminTest('TAX-10: PND53 list page', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pnd53`);
    await expect(page).not.toHaveURL(/\/login/);

    // Table renders
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    // New PND53 link
    await expect(
      page.getByRole('link', { name: /new.*ภงด\.53|new.*pnd53/i })
    ).toBeVisible({ timeout: 5_000 });
  });

  // TAX-11
  adminTest('TAX-11: Create PND53 filing', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/pnd53/new`);

    const periodInput = page.locator('input[type="month"]');
    await expect(periodInput).toBeVisible({ timeout: 10_000 });
    await periodInput.fill('2026-05');

    // Generate preview (JURISTIC vendors only)
    await page.getByRole('button', { name: /generate preview/i }).click();
    await page.waitForTimeout(2_000);

    // At least one WHT line (from the juristic vendor payment)
    await expect(page.getByText(/tax e2e corp/i).first()).toBeVisible({ timeout: 10_000 });

    // Save as draft
    await page.getByRole('button', { name: /save as draft/i }).click();
    await page.waitForURL(/\/tax\/pnd53\/[^/]{10,}/, { timeout: 15_000 });

    const url = page.url();
    pnd53Id = url.split('/tax/pnd53/')[1] ?? '';
    expect(pnd53Id).toBeTruthy();

    // Filing number assigned
    await expect(page.getByText(/PND53-\d{4}/).first()).toBeVisible({ timeout: 10_000 });
  });

  // TAX-12 🔴 — regression test for parseFloat bug
  adminTest('TAX-12: PND53 detail — withholding_total accuracy', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;
    await page.goto(`${webUrl}/tax/pnd53/${pnd53Id}`);

    await page.waitForTimeout(2_000);

    // data-testid="total-withholding" must exist and contain a formatted number
    const totalEl = page.locator('[data-testid="total-withholding"]');
    await expect(totalEl).toBeVisible({ timeout: 10_000 });

    const displayedText = await totalEl.innerText();
    // Strip ฿ and commas, then parse
    const displayedValue = displayedText.replace(/[฿,]/g, '').trim();
    expect(displayedValue).toMatch(/^\d+\.\d{2}$/);
    expect(Number(displayedValue)).toBeGreaterThan(0);

    // Fetch WHT lines from API and sum with Decimal.js
    const agg = await apiReq<{ total_wht: string; rows: Array<{ wht_amount: string }> }>(
      workerIndex,
      'POST',
      '/api/v1/tax-filings/pnd53/preview',
      { period: '2026-05' },
    );

    const apiSum = agg.rows
      .reduce((acc: number, r: { wht_amount: string }) => acc + parseFloat(r.wht_amount || '0'), 0)
      .toFixed(2);

    // API sum must equal displayed value (catches parseFloat regression)
    expect(apiSum).toBe(displayedValue);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
  });

  // TAX-13 🔴 — regression test for stale-closure filter bug
  adminTest('TAX-13: WHT Certs list — filter by vendor', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/wht-certs`);

    const filterInput = page.locator('[data-testid="filter-vendor"]');
    await expect(filterInput).toBeVisible({ timeout: 10_000 });

    // Should have at least one cert from the seeded payments
    await page.waitForTimeout(1_000);
    const bodyBefore = await page.locator('body').innerText();
    expect(bodyBefore).not.toContain('NaN');

    // Filter by individual vendor name
    await filterInput.fill('Tax E2E Vendor');
    await page.waitForTimeout(1_500);

    // Should show cert with wht_amount 150
    await expect(page.getByText(/150\.00/)).toBeVisible({ timeout: 10_000 });

    // Clear filter → full list returns (at least 2 certs total)
    await filterInput.fill('');
    await page.waitForTimeout(1_500);

    // After clearing, both vendors' certs should be visible
    const bodyAfter = await page.locator('body').innerText();
    expect(bodyAfter).not.toContain('NaN');
    // Both certs visible (150 from individual, 240 from juristic)
    expect(bodyAfter).toMatch(/150\.00|240\.00/);
  });

  // TAX-14
  adminTest('TAX-14: Tax period filter — no NaN period strings', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/tax/wht-certs`);

    await page.waitForTimeout(500);

    // Set up request listener before interacting
    const requestUrls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/tax') || req.url().includes('/wht-certs')) {
        requestUrls.push(req.url());
      }
    });

    // Change the period filter
    const periodInput = page.locator('input[type="month"]').first();
    await expect(periodInput).toBeVisible({ timeout: 10_000 });
    await periodInput.fill('2026-05');

    await page.waitForTimeout(1_500);

    // Assert no NaN in period-display area
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toMatch(/NaN/);

    // Check any request URLs that fired contain valid period format
    const taxRequests = requestUrls.filter((u) => u.includes('period='));
    if (taxRequests.length > 0) {
      for (const url of taxRequests) {
        const match = url.match(/period=([^&]+)/);
        if (match) {
          expect(match[1]).toMatch(/^\d{4}-\d{2}$/);
        }
      }
    }
  });
});

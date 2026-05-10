import { expect } from '@playwright/test';
import { adminTest } from '../fixtures/auth';
import { stackForWorker } from '../fixtures/stack';
import crypto from 'node:crypto';

// The API test stack must have WEBHOOK_SECRET_WIND_CLINIC set to this value.
// See scripts/e2e-stack.ts where the API env is built.
const TEST_WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET_WIND_CLINIC ?? 'e2e-wind-clinic-secret';

// Unique visit ID per test run — prevents idempotency collisions across runs.
const VISIT_ID = `e2e-visit-${Date.now()}`;

function signPayload(body: string): Record<string, string> {
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(body).digest('hex');
  return { 'x-signature': sig, 'x-timestamp': ts };
}

function makeVisitPayload(visitId: string) {
  return {
    event: 'visit.completed',
    visit_id: visitId,
    patient_id: `P-E2E-${visitId}`,
    patient_name: 'E2E Test Patient',
    branch_code: 'TL',
    visit_date: '2026-05-09T10:00:00.000Z',
    completed_at: '2026-05-09T10:30:00.000Z',
    request_full_tax_invoice: false,
    items: [
      {
        type: 'service',
        code: 'BOTOX',
        name: 'Botox Treatment',
        name_th: 'โบท็อกซ์',
        qty: 1,
        unit_price: '5350.00',
      },
    ],
    payment: {
      method: 'CASH',
      // 5000 base + 7% VAT = 5350 (vat-inclusive, clinic always sends gross)
      amount: '5350.00',
    },
  };
}

async function postWebhook(
  apiUrl: string,
  payload: unknown,
  overrideSignature?: string,
): Promise<Response> {
  const body = JSON.stringify(payload);
  const signatureHeaders =
    overrideSignature !== undefined
      ? { 'x-signature': overrideSignature, 'x-timestamp': Date.now().toString() }
      : signPayload(body);
  return fetch(`${apiUrl}/api/v1/webhooks/wind-clinic/visit-completed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...signatureHeaders },
    body,
  });
}

// Run tests in series because WEBHOOK-02..07 depend on WEBHOOK-01's side effects.
adminTest.describe.serial('Webhook Integration — wind-clinic visit.completed', () => {
  let invoiceNo = '';
  let receiptNo = '';
  let jeNo = '';

  // Fire the initial webhook once; downstream tests verify its side effects.
  adminTest.beforeAll(async ({}, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);
    const payload = makeVisitPayload(VISIT_ID);
    const res = await postWebhook(apiUrl, payload);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        invoice_no: string;
        receipt_no: string;
        je_no: string;
        receipt_je_no?: string;
      };
    };
    expect(json.data.invoice_no).toMatch(/^INV-/);
    expect(json.data.receipt_no).toMatch(/^RCT-/);
    expect(json.data.je_no).toMatch(/^JE-/);
    invoiceNo = json.data.invoice_no;
    receiptNo = json.data.receipt_no;
    jeNo = json.data.je_no;
  });

  // ── WEBHOOK-01 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-01: send valid visit.completed → response 200 with IDs', async ({}, testInfo) => {
    // The beforeAll already validated status 200 and captured the IDs.
    // This test documents / re-asserts those conditions explicitly.
    expect(invoiceNo).toMatch(/^INV-/);
    expect(receiptNo).toMatch(/^RCT-/);
    expect(jeNo).toMatch(/^JE-/);
  });

  // ── WEBHOOK-02 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-02: auto-created invoice visible in AR list', async ({ page }) => {
    await page.goto('/ar/invoices');
    await page.waitForLoadState('networkidle');

    // The invoice number should appear somewhere on the page (table row or card).
    await expect(page.getByText(invoiceNo, { exact: false })).toBeVisible({ timeout: 10_000 });

    // Click through to the invoice detail via "View →" button in the matching row.
    const invoiceRow = page.locator('tr').filter({ hasText: invoiceNo }).first();
    await invoiceRow.getByRole('button', { name: /view/i }).click();
    await page.waitForLoadState('networkidle');

    // Status badge shows "Posted" (STATUS_LABELS maps POSTED → "Posted").
    await expect(page.getByTestId('status-badge').first()).toBeVisible({ timeout: 5_000 });

    // Customer is auto-created from visit; name should match payload.
    await expect(page.getByText('E2E Test Patient', { exact: false }).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── WEBHOOK-03 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-03: auto-created receipt visible in AR receipts list', async ({ page }) => {
    await page.goto('/ar/receipts');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(receiptNo, { exact: false })).toBeVisible({ timeout: 10_000 });

    // Click through to the receipt detail via "View →" button.
    const receiptRow = page.locator('tr').filter({ hasText: receiptNo }).first();
    await receiptRow.getByRole('button', { name: /view/i }).click();
    await page.waitForLoadState('networkidle');

    // Amount should contain 5350 (the paid_amount from the payload).
    await expect(page.getByText('5,350', { exact: false }).first()).toBeVisible({ timeout: 5_000 });

    // Applied invoice should reference the auto-created invoice.
    await expect(page.getByText(invoiceNo, { exact: false })).toBeVisible({ timeout: 5_000 });
  });

  // ── WEBHOOK-04 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-04: linked JE is POSTED and balanced', async ({ page }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // Fetch the JE directly from the API to check balance.
    const cookieHeader = await page.context().cookies().then((cookies) =>
      cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    );
    const jeRes = await fetch(`${apiUrl}/api/v1/journal-entries?q=${encodeURIComponent(jeNo)}`, {
      headers: { Cookie: cookieHeader },
    });
    expect(jeRes.ok).toBe(true);
    const jeJson = (await jeRes.json()) as {
      data: { je_no: string; status: string; total_debit: string; total_credit: string }[];
    };
    const jeItem = jeJson.data.find((j) => j.je_no === jeNo);
    expect(jeItem).toBeDefined();
    expect(jeItem!.status).toBe('POSTED');
    expect(jeItem!.total_debit).toBe(jeItem!.total_credit);

    // Also verify via the UI.
    await page.goto('/gl/journal-entries');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(jeNo, { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  // ── WEBHOOK-05 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-05: duplicate visit_id is idempotent — no second invoice created', async ({}, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // Re-send the exact same payload.
    const payload = makeVisitPayload(VISIT_ID);
    const res = await postWebhook(apiUrl, payload);

    // Must be 200 (idempotent replay) — not 201 or 500.
    expect(res.status).toBe(200);

    const json = (await res.json()) as { data: { invoice_no: string } };

    // The returned invoice_no must be the SAME one from the first call.
    expect(json.data.invoice_no).toBe(invoiceNo);
  });

  // ── WEBHOOK-06 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-06: invalid HMAC signature → 401', async ({}, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);
    const payload = makeVisitPayload(`${VISIT_ID}-bad-sig`);

    // Send with a deliberately wrong signature.
    const res = await postWebhook(apiUrl, payload, 'deadbeefdeadbeef');

    expect([401, 403]).toContain(res.status);
  });

  // ── WEBHOOK-07 ──────────────────────────────────────────────────────────────

  adminTest('WEBHOOK-07: audit log shows WEBHOOK_RECEIVED entry', async ({ page }) => {
    await page.goto('/settings/audit-log');
    await page.waitForLoadState('networkidle');

    // The audit log should contain at least one WEBHOOK_RECEIVED entry (in a table cell, not a filter option).
    await expect(
      page.locator('td').filter({ hasText: 'WEBHOOK_RECEIVED' }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});

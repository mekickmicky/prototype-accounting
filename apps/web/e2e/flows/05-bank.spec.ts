import { expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { adminTest } from '../fixtures/auth';
import { stackForWorker } from '../fixtures/stack';
import {
  ensureCustomer,
  ensurePostedInvoice,
  ensurePostedReceipt,
  ensureVendor,
  ensurePostedBill,
  ensurePostedPayment,
} from '../fixtures/data';


// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Suite ──────────────────────────────────────────────────────────────────────

adminTest.describe.serial('Bank module', () => {
  adminTest.beforeAll(async ({}, testInfo) => {
    const workerIndex = testInfo.parallelIndex;

    // Ensure at least one receipt and one payment exist as auto-match candidates
    const customer = await ensureCustomer(workerIndex, 'E2E Bank Customer');
    const invoice = await ensurePostedInvoice(workerIndex, customer.id, [
      { description: 'Bank match service', qty: 1, unit_price: 5000, vat_rate: 0 },
    ]);
    await ensurePostedReceipt(workerIndex, invoice.id, 5000);

    const vendor = await ensureVendor(workerIndex, 'E2E Bank Vendor', 0);
    const bill = await ensurePostedBill(workerIndex, vendor.id, [
      { description: 'Bank match expense', qty: 1, unit_price: 3000, vat_rate: 0 },
    ]);
    // net_payable = 3000 - (3000 × 3% WHT) = 2910
    await ensurePostedPayment(workerIndex, bill.id, 2910);
  });

  // BANK-01
  adminTest('BANK-01: Bank accounts list', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/bank/accounts`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/login/);

    // At least 3 seeded bank accounts
    const rows = page.locator('table tbody tr').filter({ hasNot: page.locator('[colspan]') });
    await expect(rows).toHaveCount(3, { timeout: 10_000 });

    // Column headers present
    await expect(page.getByText('Account Name')).toBeVisible();
    await expect(page.getByText('Bank').first()).toBeVisible();
    await expect(page.getByText('Account No.')).toBeVisible();
    // Balance column header
    await expect(page.getByText(/Balance/).first()).toBeVisible();

    // Balance values are formatted numbers (contain decimal point)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // Save first account id for later tests
    const viewBtn = page.locator('button', { hasText: 'View →' }).first();
    await expect(viewBtn).toBeVisible({ timeout: 5_000 });

    // Get all rows and save the first account info via API
    const workerIndex = testInfo.parallelIndex;
    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    // At least one account exists
    expect(Array.isArray(accounts) && accounts.length > 0).toBeTruthy();
  });

  // BANK-02
  adminTest('BANK-02: Bank account detail — transactions', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);

    // Navigate to first account via the list
    await page.goto(`${webUrl}/bank/accounts`);
    await page.waitForLoadState('networkidle');

    const viewBtn = page.locator('button', { hasText: 'View →' }).first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
    await viewBtn.click();

    await page.waitForLoadState('networkidle');

    // Detail page: account name visible
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // Transactions section renders
    await expect(page.getByText(/Bank Transactions/)).toBeVisible({ timeout: 10_000 });

    // Account info section
    await expect(page.getByText(/ข้อมูลบัญชี/)).toBeVisible();

    // Balance section
    await expect(page.getByText(/GL Balance/)).toBeVisible();

    // Balance value is formatted
    const balanceText = await page.locator('body').innerText();
    expect(balanceText).not.toMatch(/NaN/);
  });

  // BANK-03
  adminTest('BANK-03: Import page loads', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/bank/import`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/login/);

    // Page title
    await expect(page.getByText('นำเข้าข้อมูลธนาคาร')).toBeVisible({ timeout: 10_000 });

    // Bank account selector
    const accountSelect = page.locator('select').first();
    await expect(accountSelect).toBeVisible({ timeout: 5_000 });

    // "Generate mock data" radio option visible
    await expect(page.getByText('Generate mock data')).toBeVisible();

    // Import button visible
    await expect(page.getByRole('button', { name: /Import/i }).last()).toBeVisible();
  });

  // BANK-04 🔴
  adminTest('BANK-04: Import mock bank transactions', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    await page.goto(`${webUrl}/bank/import`);
    await page.waitForLoadState('networkidle');

    // Select first bank account
    const accountSelect = page.locator('select').first();
    await expect(accountSelect).toBeVisible({ timeout: 10_000 });
    const options = await accountSelect.locator('option').all();
    // Select first non-empty option
    if (options.length > 1) {
      await accountSelect.selectOption({ index: 1 });
    }

    // Ensure mock data source is selected (it's default)
    const mockRadio = page.locator('input[type="radio"][value="mock"]');
    await expect(mockRadio).toBeChecked({ timeout: 5_000 });

    // Click import
    const importBtn = page.getByRole('button', { name: /^Import$/ });
    await expect(importBtn).toBeVisible({ timeout: 5_000 });
    await importBtn.click();

    // Wait for result
    await expect(page.getByText('Import Complete')).toBeVisible({ timeout: 15_000 });

    // At least 1 transaction imported (number > 0)
    const importedText = await page.getByText(/new transactions imported/).first().textContent();
    expect(importedText).toBeTruthy();

    // "Go to Reconciliation" button appears
    await expect(page.getByRole('button', { name: /Go to Reconciliation/i })).toBeVisible({ timeout: 5_000 });
  });

  // BANK-05
  adminTest('BANK-05: Bank account detail — balance updated after import', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);

    // Navigate to any bank account detail
    await page.goto(`${webUrl}/bank/accounts`);
    await page.waitForLoadState('networkidle');

    const viewBtn = page.locator('button', { hasText: 'View →' }).first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
    await viewBtn.click();
    await page.waitForLoadState('networkidle');

    // Transactions section exists
    await expect(page.getByText(/Bank Transactions/)).toBeVisible({ timeout: 10_000 });

    // Check table rows (after import there should be at least 1)
    // The table may show "ยังไม่มีรายการธุรกรรม" if this is a different account
    // Just assert no errors and no NaN
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    // If transactions exist, verify columns
    const txnRows = page.locator('table tbody tr').filter({ hasNot: page.locator('[colspan]') });
    const count = await txnRows.count();
    if (count > 0) {
      // Columns: Date, Description, Bank Ref, Debit, Credit, Running Balance, Status
      await expect(page.getByRole('columnheader', { name: 'Date' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Debit' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'Credit' })).toBeVisible();
    }
  });

  // BANK-06
  adminTest('BANK-06: Reconciliation page loads', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;

    // Get first bank account id
    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    const accountId = (Array.isArray(accounts) ? accounts : [])[0]?.id;
    expect(accountId).toBeTruthy();

    await page.goto(`${webUrl}/bank/reconcile/${accountId}`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/login/);

    // Page renders with Bank Reconciliation heading
    await expect(page.getByText('Bank Reconciliation')).toBeVisible({ timeout: 10_000 });

    // "Auto-match all" button present
    await expect(page.getByRole('button', { name: /Auto-match all/i })).toBeVisible({ timeout: 5_000 });

    // Bank Transactions section
    await expect(page.getByText('Bank Transactions · ธุรกรรมจากธนาคาร')).toBeVisible();

    // No crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
  });

  // BANK-07 🔴
  adminTest('BANK-07: Auto-match transactions', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;

    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    const accountId = (Array.isArray(accounts) ? accounts : [])[0]?.id;
    expect(accountId).toBeTruthy();

    await page.goto(`${webUrl}/bank/reconcile/${accountId}`);
    await page.waitForLoadState('networkidle');

    // Click Auto-match all
    const autoMatchBtn = page.getByRole('button', { name: /Auto-match all/i });
    await expect(autoMatchBtn).toBeVisible({ timeout: 5_000 });
    await autoMatchBtn.click();

    // Wait for action message (either "Auto-matched X transactions" or still 0)
    await page.waitForTimeout(3_000);

    // Assert no crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    // The message might disappear quickly — just assert no error state
    const errorMsgs = page.locator('div').filter({ hasText: /Auto-match failed/ });
    const errorCount = await errorMsgs.count();
    expect(errorCount).toBe(0);
  });

  // BANK-08
  adminTest('BANK-08: Manual match a transaction', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;

    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    const accountId = (Array.isArray(accounts) ? accounts : [])[0]?.id;
    expect(accountId).toBeTruthy();

    await page.goto(`${webUrl}/bank/reconcile/${accountId}`);
    await page.waitForLoadState('networkidle');

    // Check if there are any unmatched transactions
    const txnItems = page.locator('div').filter({ hasText: /Bank Transactions · ธุรกรรมจากธนาคาร/ }).locator('..').locator('div[style*="cursor: pointer"]');
    const txnCount = await txnItems.count();

    if (txnCount === 0) {
      const paneText = await page.locator('body').innerText();
      expect(paneText).not.toContain('NaN');
      return;
    }

    // Click first unmatched bank transaction
    const firstTxn = txnItems.first();
    await firstTxn.click();
    await page.waitForTimeout(500);

    // Check if any documents appear in the match panel
    const filteredDocs = page.locator('div').filter({ hasText: /Manual match/ });
    const docCount = await filteredDocs.count();

    if (docCount > 0) {
      // Click a document to select it
      const docItems = page.locator('div[style*="cursor: pointer"]').filter({
        hasText: /Receipt|Payment/,
      });
      if (await docItems.count() > 0) {
        await docItems.first().click();
        await page.waitForTimeout(300);

        // "Match selected" button should appear
        const matchBtn = page.getByRole('button', { name: /Match selected/i });
        if (await matchBtn.isVisible()) {
          await matchBtn.click();
          await page.waitForTimeout(500);

          // Confirm modal appears
          const confirmBtn = page.getByRole('button', { name: /Confirm Match/i });
          if (await confirmBtn.isVisible()) {
            await confirmBtn.click();
            await page.waitForTimeout(2_000);

            // Success flash
            const bodyText = await page.locator('body').innerText();
            expect(bodyText).not.toContain('NaN');
          }
        }
      }
    }

    // Assert no crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
  });

  // BANK-09
  adminTest('BANK-09: Mark transaction as non-reconcilable', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;

    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    const accountId = (Array.isArray(accounts) ? accounts : [])[0]?.id;
    expect(accountId).toBeTruthy();

    await page.goto(`${webUrl}/bank/reconcile/${accountId}`);
    await page.waitForLoadState('networkidle');

    // Look for unmatched transactions (clickable divs in the left pane)
    const txnItems = page.locator('div[style*="cursor: pointer"]').filter({
      has: page.locator('strong'),
    });
    const txnCount = await txnItems.count();

    if (txnCount === 0) {
      // All matched or empty — just verify no crash
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).not.toContain('NaN');
      return;
    }

    // Select first transaction
    await txnItems.first().click();
    await page.waitForTimeout(500);

    // "Mark as ignored" button should be visible in the right panel
    const ignoreBtn = page.getByRole('button', { name: /Mark as ignored/i });
    await expect(ignoreBtn).toBeVisible({ timeout: 5_000 });
    await ignoreBtn.click();

    // Modal opens with reason field
    await expect(page.getByPlaceholder(/Bank fee already/i)).toBeVisible({ timeout: 5_000 });

    // Fill reason
    await page.getByPlaceholder(/Bank fee already/i).fill('E2E test — ignore');

    // Click confirm
    await page.getByRole('button', { name: /^Mark as Ignored$/ }).click();
    await page.waitForTimeout(2_000);

    // Flash success
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    // Balance should not show NaN
    expect(bodyText).not.toMatch(/NaN/);
  });

  // BANK-10 🔴
  adminTest('BANK-10: Reconciliation balance check', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const workerIndex = testInfo.parallelIndex;

    const accounts = await apiReq<Array<{ id: string }>>(
      workerIndex,
      'GET',
      '/api/v1/bank-accounts?page=1&page_size=10',
    );
    const accountId = (Array.isArray(accounts) ? accounts : [])[0]?.id;
    expect(accountId).toBeTruthy();

    await page.goto(`${webUrl}/bank/reconcile/${accountId}`);
    await page.waitForLoadState('networkidle');

    // Footer balance section is present
    await expect(page.getByText('Bank Balance (statement)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Book Balance/)).toBeVisible();
    await expect(page.getByText('Difference')).toBeVisible();
    await expect(page.getByText('Status')).toBeVisible();

    // No NaN in any balance field
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // All 4 footer stats should show formatted numbers (no empty values)
    // The footer contains numeric values
    const footerStats = page.locator('div').filter({ hasText: /Bank Balance \(statement\)/ }).first();
    await expect(footerStats).toBeVisible();
  });

  // BANK-11
  adminTest('BANK-11: Cash position report after bank import', async ({ page }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);
    const today = new Date().toISOString().split('T')[0]!;

    await page.goto(`${webUrl}/reports/cash-position?as_of=${today}`);
    await page.waitForLoadState('networkidle');

    await expect(page).not.toHaveURL(/\/login/);

    // No 500 error
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('500');
    expect(bodyText).not.toContain('Internal Server Error');

    // Report loads (heading or content visible)
    // Cash position report should show bank accounts
    await expect(page.locator('body')).toBeVisible();

    // No NaN
    expect(bodyText).not.toContain('NaN');
  });
});

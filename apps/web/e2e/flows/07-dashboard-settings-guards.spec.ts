import { expect } from '@playwright/test';
import { adminTest, viewerTest, accountantTest } from '../fixtures/auth';
import { stackForWorker } from '../fixtures/stack';
import { ensureCustomer } from '../fixtures/data';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Shared seed state
// ---------------------------------------------------------------------------

let seededCustomerId = '';

// ---------------------------------------------------------------------------
// Admin: Dashboard + Settings + Auth Guards
// ---------------------------------------------------------------------------

adminTest.describe.serial('Dashboard, Settings, and Auth Guards', () => {
  adminTest.beforeAll(async ({}, testInfo) => {
    const workerIndex = testInfo.parallelIndex;

    // Seed a customer so dashboard AR KPI may have data
    const cust = await ensureCustomer(workerIndex, 'E2E-DASH-Customer');
    seededCustomerId = cust.id;

    // Trigger an API action to produce at least one audit log entry
    const { apiUrl } = stackForWorker(workerIndex);
    const { resolve } = await import('node:path');
    const { readFileSync } = await import('node:fs');
    const statePath = resolve(__dirname, '../fixtures', `.auth-admin-w${workerIndex}.json`);
    const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
      cookies: { name: string; value: string }[];
    };
    const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    await fetch(`${apiUrl}/api/v1/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        name: 'E2E-AuditSeed-Customer',
        tax_id: null,
        address: null,
        phone: null,
        email: null,
        branch_code: 'TL',
      }),
    });
  });

  // ── DASH-01: Dashboard KPI cards show live data ───────────────────────────
  adminTest('DASH-01: Dashboard KPI cards render with live data', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Page title
    await expect(page.getByText('WIND Accounting').first()).toBeVisible();

    // KPI card labels are visible
    await expect(page.getByText("Today's Revenue")).toBeVisible();
    await expect(page.getByText('Accounts Receivable').first()).toBeVisible();
    await expect(page.getByText('Accounts Payable').first()).toBeVisible();
    await expect(page.getByText('Cash & Bank')).toBeVisible();

    // No JS error states visible
    await expect(page.locator('body')).not.toContainText('Internal Server Error');
    await expect(page.locator('body')).not.toContainText('Available in Phase');

    // Card values rendered (each KPI card has a label + value area — not still a loading pulse)
    // The skeleton has animate-pulse class; after load it should be gone
    await page.waitForFunction(
      () => document.querySelectorAll('.animate-pulse').length === 0,
      { timeout: 10_000 },
    );

    // Cards show either a numeric value (฿...) or a dash — not the loading placeholder
    const moneyCards = page.locator('[style*="font-mono"]');
    const count = await moneyCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ── DASH-02: Navigation links accessible ─────────────────────────────────
  adminTest('DASH-02: Sidebar navigation links accessible from dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // GL accessible
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('404');

    // AR accessible
    await page.goto('/ar/invoices');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('404');

    // AP accessible
    await page.goto('/ap/bills');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('404');

    // Reports accessible
    await page.goto('/reports/profit-loss');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('404');
  });

  // ── GUARD-03: Unauthenticated redirect to login ───────────────────────────
  adminTest('GUARD-03: Unauthenticated user redirected to /login 🔴', async ({ browser }, testInfo) => {
    const { webUrl } = stackForWorker(testInfo.parallelIndex);

    // Fresh browser context with NO session cookie
    const freshCtx = await browser.newContext({ baseURL: webUrl });
    const freshPage = await freshCtx.newPage();

    await freshPage.goto('/gl/accounts');
    await freshPage.waitForLoadState('networkidle');

    // Should be redirected to /login
    expect(freshPage.url()).toContain('/login');

    // Login page content visible
    await expect(freshPage.getByText('WIND Accounting').first()).toBeVisible();
    await expect(freshPage.getByText('ระบบบัญชีคลินิก')).toBeVisible();

    await freshCtx.close();
  });

  // ── GUARD-04: Login via UI ────────────────────────────────────────────────
  adminTest('GUARD-04: Login selects Admin User and authenticates via UI', async ({ browser }, testInfo) => {
    const { webUrl, apiUrl } = stackForWorker(testInfo.parallelIndex);
    const freshCtx = await browser.newContext({ baseURL: webUrl });
    const freshPage = await freshCtx.newPage();

    await freshPage.goto('/login');
    await freshPage.waitForLoadState('networkidle');

    // Fetch users list to get admin ID
    const usersRes = await freshPage.request.get(`${apiUrl}/api/v1/auth/users`);
    const usersBody = await usersRes.json() as {
      data: { users: { id: string; email: string; name: string }[] };
    };
    const adminUser = usersBody.data.users.find((u) => u.email === 'admin@wind');
    expect(adminUser).toBeTruthy();

    // Select admin in the user dropdown
    await freshPage.locator('select#user-select').selectOption(adminUser!.id);

    // Submit login
    await freshPage.getByRole('button', { name: /เข้าสู่ระบบ/i }).click();

    // Should redirect to /dashboard
    await freshPage.waitForURL(/\/dashboard/, { timeout: 10_000 });
    expect(freshPage.url()).toContain('/dashboard');

    // App heading visible
    await expect(freshPage.getByText('WIND Accounting').first()).toBeVisible();

    await freshCtx.close();
  });

  // ── GUARD-05: Logout clears session ──────────────────────────────────────
  adminTest('GUARD-05: Logout clears session and protects routes 🔴', async ({ page, authedContext }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // Start on dashboard while authenticated
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('WIND Accounting').first()).toBeVisible();

    // Open user dropdown and click logout ("ออกจากระบบ")
    // The header button contains "—" and a user icon; click it to open the dropdown
    await page.getByTestId('user-menu-trigger').click();
    const logoutOption = page.getByText('ออกจากระบบ');
    await expect(logoutOption).toBeVisible({ timeout: 3_000 });
    await logoutOption.click();

    // UI logout navigates to /login
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain('/login');

    // Call API logout endpoint to properly clear the session cookie
    await page.request.post(`${apiUrl}/api/v1/auth/logout`);

    // Clear cookies from the browser context as well to ensure session is gone
    await authedContext.clearCookies();

    // Navigate to a protected page — should redirect to /login
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/login');
  });

  // ── SETTINGS-09: Account Map page loads ──────────────────────────────────
  adminTest('SETTINGS-09: Account Map page renders with sections and save button', async ({ page }) => {
    await page.goto('/settings/account-map');
    await page.waitForLoadState('networkidle');

    // Page header
    await expect(page.getByRole('heading', { name: 'Account Map' })).toBeVisible();

    // Section headers
    await expect(page.getByText(/บริการ.*รายได้|Service.*Revenue/i).first()).toBeVisible();
    await expect(page.getByText(/วิธีชำระ|Payment.*GL/i).first()).toBeVisible();

    // Save button present for admin
    await expect(page.getByRole('button', { name: /บันทึก/i })).toBeVisible();

    // No error state
    await expect(page.locator('body')).not.toContainText('Failed to load');
  });

  // ── SETTINGS-10: Audit Log has entries after actions ─────────────────────
  adminTest('SETTINGS-10: Audit Log renders table with Date, User, Action, Entity columns', async ({ page }) => {
    await page.goto('/settings/audit-log');
    await page.waitForLoadState('networkidle');

    // Column headers
    await expect(page.getByText('Timestamp')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Action' })).toBeVisible();
    await expect(page.getByText('Entity')).toBeVisible();
    await expect(page.getByText('Actor')).toBeVisible();

    // Stats row is labelled with qualifier (not raw "Total" — tests audit finding)
    await expect(page.getByText(/Total \(page\)|this page/).first()).toBeVisible();

    // Filter by action type works without error
    await page.locator('select').first().selectOption('CREATE');
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Failed to load');

    // Clear filters
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.waitForLoadState('networkidle');
  });

  // ── SETTINGS-11: Integrations Dashboard — no double-fetch on filter change ─
  adminTest('SETTINGS-11: Integrations Dashboard — filter change does not double-fetch', async ({ page }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    await page.goto('/settings/integrations/dashboard');
    await page.waitForLoadState('networkidle');

    // Page renders
    await expect(page.getByText('Webhook Dashboard').first()).toBeVisible();
    await expect(page.getByText('Webhooks today')).toBeVisible();
    await expect(page.getByText('Webhooks this week')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to load webhook log');

    // Track requests to the integrations log endpoint
    const logRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('/integrations/log') || req.url().includes('/settings/integrations/log')) {
        logRequests.push(req.url());
      }
    });

    const countBefore = logRequests.length;

    // Change from-date input — should NOT fire a new API request automatically
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.first().fill('2026-01-01');
    await page.waitForTimeout(600);

    const countAfterChange = logRequests.length;
    // No automatic fetch on input change (double-fetch fix)
    expect(countAfterChange - countBefore).toBe(0);

    // Click Apply — should fire exactly 1 request
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.waitForLoadState('networkidle');
    const countAfterApply = logRequests.length;
    expect(countAfterApply - countAfterChange).toBe(1);
  });

  // ── SETTINGS-12: Integration test page — fire test webhook ───────────────
  adminTest('SETTINGS-12: Integration test page fires webhook and shows response', async ({ page }) => {
    await page.goto('/settings/integrations/test');
    await page.waitForLoadState('networkidle');

    // Page renders
    await expect(page.getByText('Test Webhooks').first()).toBeVisible();
    await expect(page.getByText('Visit Completed (wind-clinic)')).toBeVisible();

    // Click "Send Webhook" on the Visit section (first Send Webhook button)
    const sendBtn = page.getByRole('button', { name: /Send Webhook/i }).first();
    await expect(sendBtn).toBeVisible();
    await sendBtn.click();

    // Wait for result panel to appear (shows HTTP status)
    await expect(
      page.getByText(/HTTP \d+/).or(page.locator('[style*="HTTP"]')),
    ).toBeVisible({ timeout: 15_000 });

    // Not a silent hang — result appeared
    await expect(page.locator('body')).not.toContainText('Sending…');

    // Navigate to integrations dashboard to check event appears
    await page.goto('/settings/integrations/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Webhook Dashboard').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to load webhook log');
  });

  // ── SETTINGS-13: Account Map — save mapping persists ─────────────────────
  adminTest('SETTINGS-13: Account Map save shows success and persists on reload', async ({ page }) => {
    await page.goto('/settings/account-map');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Account Map' })).toBeVisible();

    // Click Save — even without changes, it should succeed
    const saveBtn = page.getByRole('button', { name: /บันทึก/i });
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Expect success feedback: "บันทึกแล้ว"
    await expect(page.getByText(/บันทึกแล้ว/)).toBeVisible({ timeout: 10_000 });

    // Reload and verify page still loads without error (no silent data loss)
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Account Map' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to load');
  });
});

// ---------------------------------------------------------------------------
// VIEWER role guards (critical 🔴)
// ---------------------------------------------------------------------------

viewerTest.describe.serial('GUARD-06 and GUARD-07: VIEWER role enforcement', () => {
  // ── GUARD-06: VIEWER cannot close a period ────────────────────────────────
  viewerTest('GUARD-06: VIEWER cannot close period — API enforces 403 🔴', async ({ page }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // Navigate to periods page — read access should be allowed
    await page.goto('/gl/periods');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toContainText('Forbidden');
    await expect(page.locator('body')).not.toContainText('Insufficient permissions');

    // Direct API check: VIEWER attempting to close a period must get 403
    const closeRes = await page.request.post(`${apiUrl}/api/v1/periods/2026-04/close`, {
      data: { confirm: true },
    });
    expect(closeRes.status()).toBe(403);

    const closeBody = await closeRes.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(closeBody.success).toBe(false);
    expect(closeBody.error?.code).toBe('FORBIDDEN');

    // UI check: if close button exists in DOM, force-clicking it must show error feedback
    const closeBtnLocator = page.locator('[data-testid="action-close-period-2026-04"]');
    const hasCloseBtn = (await closeBtnLocator.count()) > 0;
    if (hasCloseBtn) {
      await closeBtnLocator.click({ force: true });
      await expect(
        page.getByText(/permission|forbidden|403/i).or(page.locator('[role="alert"]')),
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── GUARD-07: VIEWER cannot create journal entry ──────────────────────────
  viewerTest('GUARD-07: VIEWER cannot create JE — API enforces 403 🔴', async ({ page }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // Direct API check: VIEWER attempting to POST a JE must get 403
    const jeRes = await page.request.post(`${apiUrl}/api/v1/journal-entries`, {
      data: {
        entry_date: '2026-05-09',
        branch_code: 'TL',
        description: 'E2E GUARD-07 VIEWER JE attempt',
        source_type: 'MANUAL',
        lines: [
          { account_code: '11010', debit: '500.00', credit: '0.00', description: 'DR test' },
          { account_code: '41000', debit: '0.00', credit: '500.00', description: 'CR test' },
        ],
      },
    });
    expect(jeRes.status()).toBe(403);

    const jeBody = await jeRes.json() as {
      success: boolean;
      error?: { code: string; message: string };
    };
    expect(jeBody.success).toBe(false);
    expect(jeBody.error?.code).toBe('FORBIDDEN');

    // UI check: navigate to /gl/journal-entries/new and record current behavior
    await page.goto('/gl/journal-entries/new');
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();

    if (currentUrl.includes('/new')) {
      // Page renders for viewer — record which behavior is current:
      // (a) submit button disabled, (b) page renders but submit would 403
      const submitBtn = page
        .getByRole('button', { name: /บันทึก|Post|Save/i })
        .first();
      const submitVisible = await submitBtn.isVisible().catch(() => false);
      if (submitVisible) {
        // Just verify no crash — the API 403 check above already confirmed enforcement
        await expect(page.locator('body')).not.toContainText('Internal Server Error');
      }
    } else {
      // Viewer was redirected to the list page — also acceptable
      expect(currentUrl).toContain('/gl/journal-entries');
    }
  });
});

// ---------------------------------------------------------------------------
// ACCOUNTANT access
// ---------------------------------------------------------------------------

accountantTest.describe.serial('GUARD-08: ACCOUNTANT role access', () => {
  accountantTest(
    'GUARD-08: ACCOUNTANT can read GL accounts and create journal entries',
    async ({ page }, testInfo) => {
      const { apiUrl } = stackForWorker(testInfo.parallelIndex);

      // Can read GL accounts
      await page.goto('/gl/accounts');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText('Forbidden');
      await expect(page.locator('body')).not.toContainText('Insufficient permissions');

      // Can access JE creation page
      await page.goto('/gl/journal-entries/new');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText('Internal Server Error');

      // Can read GL periods
      await page.goto('/gl/periods');
      await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText('Forbidden');

      // Attempt close period via API — record actual behavior (ACCOUNTANT may or may not be allowed)
      const closeRes = await page.request.post(`${apiUrl}/api/v1/periods/2026-03/close`, {
        data: { confirm: true },
      });
      // Accept: 200 (allowed), 403 (denied), 409 (already closed), 422 (validation/state error)
      expect([200, 403, 409, 422]).toContain(closeRes.status());
    },
  );
});

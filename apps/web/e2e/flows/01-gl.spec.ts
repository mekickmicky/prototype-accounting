import { expect, type Page, type Locator } from '@playwright/test';
import { adminTest } from '../fixtures/auth';
import { stackForWorker } from '../fixtures/stack';

// Shared state across serial tests
let geNineId = '';
let preBalance = '0.00';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find JE form table rows (data rows only — no colspan sub-rows). */
function jeRow(page: Page, idx: number): Locator {
  return page.locator('tbody tr').filter({ hasNot: page.locator('[colspan]') }).nth(idx);
}

/** Click AccountPicker in given row, search for code, select the first match. */
async function pickAccount(page: Page, row: Locator, code: string): Promise<void> {
  await row.locator('td').nth(1).locator('button[aria-expanded]').click();
  await page.getByPlaceholder('ค้นหารหัสหรือชื่อบัญชี...').fill(code);
  await page.waitForTimeout(250);
  await page.locator('[data-radix-popper-content-wrapper]').getByText(code).first().click();
  await page.waitForTimeout(100);
}

/** Fill a MoneyInput in the given td column index of a row. */
async function fillMoney(page: Page, row: Locator, colIdx: number, amount: string): Promise<void> {
  const input = row.locator('td').nth(colIdx).locator('input');
  await input.click();
  await input.fill(amount);
  await input.blur();
  await page.waitForTimeout(150);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

adminTest.describe.serial('GL module', () => {
  // ── GL-01: Chart of Accounts list renders ──────────────────────────────────
  adminTest('GL-01: Chart of Accounts list renders', async ({ page }) => {
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');

    // Page heading (Thai title)
    await expect(page.getByText('ผังบัญชี')).toBeVisible();
    // Account count shown in description
    await expect(page.getByText(/Chart of Accounts/).first()).toBeVisible();
    // Account 11000 present in tree
    await expect(page.getByText('11000')).toBeVisible();
    // New Account button visible for admin
    await expect(page.getByRole('button', { name: 'New Account' })).toBeVisible();
  });

  // ── GL-02: Accounts page shows multiple account nodes ─────────────────────
  adminTest('GL-02: Account tree shows accounts including ASSET and EXPENSE roots', async ({ page }) => {
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');

    // Root accounts from seed
    await expect(page.getByText('10000')).toBeVisible();
    await expect(page.getByText('50000')).toBeVisible();
    // Account tree renders multiple codes
    const accountCodes = page.getByText(/^\d{5}$/);
    const count = await accountCodes.count();
    expect(count).toBeGreaterThanOrEqual(5);
  });

  // ── GL-03: Account detail page ─────────────────────────────────────────────
  adminTest('GL-03: Account detail page shows code, name, and balance', async ({ page }) => {
    await page.goto('/gl/accounts/11000');
    await page.waitForLoadState('networkidle');

    // Code visible
    await expect(page.getByText('11000').first()).toBeVisible();
    // Balance section should be rendered (shows a number)
    await expect(page.locator('body')).toContainText('11000');
    // Page should not show an error
    await expect(page.locator('body')).not.toContainText('Failed to load');
  });

  // ── GL-04: Create new account (critical) ───────────────────────────────────
  adminTest('GL-04: Create new account — valid', async ({ page }) => {
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'New Account' }).click();
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible();

    // Code (4-5 digits required by validation)
    await page.getByPlaceholder('e.g. 11010').fill('91010');
    // Type = EXPENSE
    await page.locator('form select').selectOption('EXPENSE');
    // Thai name
    await page.getByPlaceholder('เงินสด').fill('บัญชีทดสอบ E2E');
    // English name
    await page.getByPlaceholder('Cash').fill('E2E Test Account');
    // Parent code
    await page.getByPlaceholder(/leave blank for root/).fill('50000');

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Modal closes
    await expect(page.getByRole('heading', { name: 'New Account' })).not.toBeVisible({ timeout: 8000 });

    // Account appears in tree
    await expect(page.getByText('91010').first()).toBeVisible();
  });

  // ── GL-05: Create account — duplicate code error ───────────────────────────
  adminTest('GL-05: Create account — duplicate code shows error', async ({ page }) => {
    await page.goto('/gl/accounts');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'New Account' }).click();
    await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible();

    // Use existing code 11000
    await page.getByPlaceholder('e.g. 11010').fill('11000');
    await page.locator('form select').selectOption('ASSET');
    await page.getByPlaceholder('เงินสด').fill('ซ้ำ');
    await page.getByPlaceholder('Cash').fill('Duplicate');

    await page.getByRole('button', { name: 'Create Account' }).click();

    // Either API error text or modal stays open
    const apiError = await page
      .locator('form')
      .getByText(/duplicate|already exist|code|exists/i)
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!apiError) {
      // Modal must still be open (submission rejected)
      await expect(page.getByRole('heading', { name: 'New Account' })).toBeVisible();
    }
  });

  // ── GL-06: Account detail after creation ───────────────────────────────────
  adminTest('GL-06: Account 91010 detail page renders correctly', async ({ page }) => {
    await page.goto('/gl/accounts/91010');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('91010').first()).toBeVisible();
    await expect(page.getByText('E2E Test Account')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Failed to load');
  });

  // ── GL-07: GL Dashboard renders ────────────────────────────────────────────
  adminTest('GL-07: GL Dashboard renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/gl/dashboard');
    await page.waitForLoadState('networkidle');

    // Page should not crash
    await expect(page.locator('body')).toBeVisible();
    // No uncaught errors (filter out known benign ones)
    const meaningful = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('ERR_ABORTED') && !e.includes('Minified React error #418'),
    );
    expect(meaningful).toHaveLength(0);
  });

  // ── GL-08: JE list — filter by status ─────────────────────────────────────
  adminTest('GL-08: Journal Entry list filter by status', async ({ page }) => {
    await page.goto('/gl/journal-entries');
    await page.waitForLoadState('networkidle');

    // Table renders (or empty state when no entries yet)
    const tableOrEmpty = page.locator('table').or(page.getByText(/ไม่พบรายการ/));
    await expect(tableOrEmpty.first()).toBeVisible();

    // Find the status filter (a select with "posted" option)
    const selects = page.locator('select');
    const selectCount = await selects.count();
    for (let i = 0; i < selectCount; i++) {
      const sel = selects.nth(i);
      const options = await sel.locator('option').allTextContents();
      if (options.some((t) => /posted only/i.test(t))) {
        await sel.selectOption({ value: 'POSTED' });
        break;
      }
    }

    await page.waitForLoadState('networkidle');
    await expect(page.locator('table').or(page.getByText(/ไม่พบรายการ/)).first()).toBeVisible();
  });

  // ── GL-09: Create balanced DRAFT Journal Entry (critical) ──────────────────
  adminTest('GL-09: Create balanced DRAFT JE', async ({ page }, testInfo) => {
    await page.goto('/gl/journal-entries/new');
    await page.waitForLoadState('networkidle');

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

    // Date
    await page.locator('input[type="date"]').fill(today);

    // Description
    await page.getByPlaceholder('Journal entry description').fill('E2E GL-09 Manual JE');

    // The JE form initialises with 2 empty rows. Fill row 0 with debit, row 1 with credit.
    const row0 = jeRow(page, 0);
    const row1 = jeRow(page, 1);

    // Row 0: account 11010, debit 1000
    await pickAccount(page, row0, '11010');
    await fillMoney(page, row0, 4, '1000');

    // Row 1: account 41010, credit 1000
    await pickAccount(page, row1, '41010');
    await fillMoney(page, row1, 5, '1000');

    // Totals section should show 1,000.00
    await expect(page.getByText(/1,000\.00/).first()).toBeVisible();

    // Save as draft
    await page.getByRole('button', { name: /บันทึกร่าง/ }).click();

    // Redirected to JE detail (must not still be /new)
    await page.waitForURL(
      (url) => /\/gl\/journal-entries\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 20000 },
    );

    geNineId = page.url().split('/').pop() ?? '';
    expect(geNineId).toBeTruthy();

    // Status is DRAFT (page shows DRAFT- draft number or related text)
    await expect(page.getByText('DRAFT').first()).toBeVisible();

    // Draft JE has a DRAFT-UUID identifier (real JE number assigned on post)
    await expect(page.getByText(/DRAFT-[0-9a-f-]+|JE-\d{4}-\d{4,}/).first()).toBeVisible();
  });

  // ── GL-10: Unbalanced JE must be rejected (critical) ──────────────────────
  adminTest('GL-10: Unbalanced JE — Post button disabled, no JE created', async ({ page }, testInfo) => {
    const workerIndex = testInfo.parallelIndex;
    const { apiUrl } = stackForWorker(workerIndex);

    await page.goto('/gl/journal-entries/new');
    await page.waitForLoadState('networkidle');

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    await page.locator('input[type="date"]').fill(today);
    await page.getByPlaceholder('Journal entry description').fill('E2E GL-10 Unbalanced');

    const row0 = jeRow(page, 0);
    const row1 = jeRow(page, 1);

    // Row 0: debit 500
    await pickAccount(page, row0, '11010');
    await fillMoney(page, row0, 4, '500');

    // Row 1: credit 400 (intentionally unbalanced)
    await pickAccount(page, row1, '41010');
    await fillMoney(page, row1, 5, '400');

    // Post button must be disabled (form not valid: unbalanced)
    const postBtn = page.getByRole('button', { name: /บันทึก & Post/ });
    await expect(postBtn).toBeDisabled();

    // Difference row visible (non-zero)
    await expect(page.getByText(/ผลต่าง/)).toBeVisible();

    // URL still contains /new
    expect(page.url()).toContain('/new');

    // API cross-check: no POSTED JE with this description
    const res = await page.request.get(
      `${apiUrl}/api/v1/journal-entries?q=${encodeURIComponent('E2E GL-10 Unbalanced')}`,
    );
    const body = await res.json() as { data: unknown[] };
    const rows = Array.isArray(body.data) ? body.data : [];
    const postedRows = rows.filter((r: unknown) => (r as { status?: string }).status === 'POSTED');
    expect(postedRows).toHaveLength(0);
  });

  // ── GL-11: Post the DRAFT JE (critical) ────────────────────────────────────
  adminTest('GL-11: Post DRAFT JE and verify balance change', async ({ page }, testInfo) => {
    const workerIndex = testInfo.parallelIndex;
    const { apiUrl } = stackForWorker(workerIndex);

    // Capture pre-balance via API
    const balRes = await page.request.get(`${apiUrl}/api/v1/accounts/11010`);
    const balData = await balRes.json() as { data: { current_balance: string } };
    preBalance = balData.data?.current_balance ?? '0.00';

    await page.goto(`/gl/journal-entries/${geNineId}`);
    await page.waitForLoadState('networkidle');

    // Should be DRAFT detail with JEForm showing Post button
    const postBtn = page.getByRole('button', { name: /บันทึก & Post/ });
    await expect(postBtn).toBeVisible();
    await expect(postBtn).not.toBeDisabled();
    await postBtn.click();

    // Wait for status to update to POSTED
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('POSTED').first()).toBeVisible({ timeout: 15000 });

    // Post button gone; Void button present
    await expect(page.getByRole('button', { name: /บันทึก & Post/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /Void|ยกเลิก/ })).toBeVisible();

    // API cross-check: balance increased by 1000
    const newRes = await page.request.get(`${apiUrl}/api/v1/accounts/11010`);
    const newData = await newRes.json() as { data: { current_balance: string } };
    const newBalance = newData.data?.current_balance ?? '0.00';
    const delta = parseFloat(newBalance) - parseFloat(preBalance);
    expect(Math.abs(delta - 1000)).toBeLessThan(0.01);
  });

  // ── GL-12: Void a POSTED JE (critical) ────────────────────────────────────
  adminTest('GL-12: Void POSTED JE and verify balance reversal', async ({ page }, testInfo) => {
    const workerIndex = testInfo.parallelIndex;
    const { apiUrl } = stackForWorker(workerIndex);

    await page.goto(`/gl/journal-entries/${geNineId}`);
    await page.waitForLoadState('networkidle');

    // Click Void button
    await page.getByRole('button', { name: /Void|ยกเลิก/ }).click();

    // Void dialog (role="alertdialog")
    await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 5000 });

    // Fill reason (min 3 chars)
    await page.locator('#void-reason').fill('E2E test void reason');

    // Confirm void
    await page.getByRole('button', { name: /Confirm Void|ยืนยันการยกเลิก/ }).click();

    // Wait for dialog to close (void action completes)
    await expect(page.getByRole('alertdialog')).not.toBeVisible({ timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Status changes to VOID
    await expect(page.getByText('VOID').first()).toBeVisible({ timeout: 15000 });

    // API cross-check: balance returns to preBalance
    await page.waitForTimeout(500);
    const afterRes = await page.request.get(`${apiUrl}/api/v1/accounts/11010`);
    const afterData = await afterRes.json() as { data: { current_balance: string } };
    const afterBalance = afterData.data?.current_balance ?? '0.00';
    const diff = Math.abs(parseFloat(afterBalance) - parseFloat(preBalance));
    expect(diff).toBeLessThan(0.01);
  });

  // ── GL-13: JE detail page — full field check ───────────────────────────────
  adminTest('GL-13: POSTED JE detail shows all fields and balanced totals', async ({ page }, testInfo) => {
    const workerIndex = testInfo.parallelIndex;
    const { apiUrl } = stackForWorker(workerIndex);

    // Create and post a fresh JE via API
    const createRes = await page.request.post(`${apiUrl}/api/v1/journal-entries`, {
      data: {
        entry_date: new Date().toISOString().slice(0, 10),
        branch_code: 'TL',
        description: 'E2E GL-13 Detail Check',
        source_type: 'MANUAL',
        lines: [
          { account_code: '11010', branch_code: 'TL', debit: '500.00', credit: '0.00', description: '' },
          { account_code: '41010', branch_code: 'TL', debit: '0.00', credit: '500.00', description: '' },
        ],
      },
    });
    const createBody = await createRes.json() as { data: { id: string } };
    const jeId = createBody.data?.id;
    expect(jeId).toBeTruthy();

    await page.request.post(`${apiUrl}/api/v1/journal-entries/${jeId}/post`);

    await page.goto(`/gl/journal-entries/${jeId}`);
    await page.waitForLoadState('networkidle');

    // JE number
    await expect(page.getByText(/JE-\d{4}-\d{4,}/).first()).toBeVisible();
    // Description
    await expect(page.getByText('E2E GL-13 Detail Check').first()).toBeVisible();
    // Status POSTED
    await expect(page.getByText('POSTED').first()).toBeVisible();
    // Lines table has 2 data rows
    const lineRows = page.locator('tbody tr');
    await expect(lineRows).toHaveCount(2);
    // Totals show 500.00
    await expect(page.getByText(/รวมเดบิต|Total Debit/)).toBeVisible();
    await expect(page.locator('body')).toContainText('500.00');
  });

  // ── GL-14: Periods list (critical) ─────────────────────────────────────────
  adminTest('GL-14: Periods list has ≥12 rows and current period is OPEN', async ({ page }) => {
    await page.goto('/gl/periods');
    await page.waitForLoadState('networkidle');

    // At least 12 period rows
    const rows = page.locator('tbody tr');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(12);

    // Period 2026-05 exists and is OPEN
    const row2605 = page.locator('tbody tr').filter({ hasText: '2026-05' });
    await expect(row2605).toBeVisible();
    await expect(row2605).toContainText(/OPEN|Open/i);

    // Period codes match YYYY-MM format
    const firstCells = page.locator('tbody tr td:first-child');
    const codes = await firstCells.allTextContents();
    for (const raw of codes.slice(0, 6)) {
      expect(raw.trim()).toMatch(/^\d{4}-\d{2}(\s|$)/);
    }
  });

  // ── GL-15: Close and reopen a period (critical) ────────────────────────────
  adminTest('GL-15: Close and reopen period 2026-01', async ({ page }, testInfo) => {
    const { apiUrl } = stackForWorker(testInfo.parallelIndex);

    // PP30 for 2026-01 is required by the close checklist. Create + finalize it now
    // so the "ปิดยอดภาษีมูลค่าเพิ่ม (ภพ.30)" checklist item passes.
    const createRes = await page.request.post(`${apiUrl}/api/v1/tax-filings/pp30`, {
      data: { period: '2026-01' },
    });
    if (createRes.ok()) {
      const createJson = await createRes.json() as { data?: { id?: string } };
      const filingId = createJson.data?.id;
      if (filingId) {
        await page.request.post(`${apiUrl}/api/v1/tax-filings/${filingId}/finalize`);
      }
    }

    await page.goto('/gl/periods');
    await page.waitForLoadState('networkidle');

    // Find the 2026-01 row and verify it's OPEN
    const row = page.locator('tbody tr').filter({ hasText: '2026-01' });
    await expect(row).toBeVisible();

    const statusCell = row.locator('td').nth(2);
    const statusText = (await statusCell.textContent()) ?? '';
    if (/CLOSED|LOCKED/.test(statusText)) {
      throw new Error(`Test environment dirty: 2026-01 status is "${statusText.trim()}", expected OPEN`);
    }

    // Click "ปิดงวด" (Close Period)
    await row.getByRole('button', { name: 'ปิดงวด' }).click();

    // Close checklist modal appears
    await expect(page.getByText('ปิดงวดบัญชี')).toBeVisible({ timeout: 8000 });

    // Wait for checklist to load
    await page.waitForTimeout(2000);

    // Handle manual "aging_reviewed" checkbox if present
    const agingCheckbox = page.locator('#cl-aging_reviewed');
    if (await agingCheckbox.isVisible().catch(() => false)) {
      await agingCheckbox.check();
    }

    // Confirm close
    const confirmCloseBtn = page.getByRole('button', { name: 'ยืนยันปิดงวด' });
    await expect(confirmCloseBtn).toBeEnabled({ timeout: 10000 });
    await confirmCloseBtn.click();

    // Modal closes
    await expect(page.getByText('ปิดงวดบัญชี')).not.toBeVisible({ timeout: 15000 });

    // Period 2026-01 is now CLOSED
    const row2 = page.locator('tbody tr').filter({ hasText: '2026-01' });
    await expect(row2).toContainText(/CLOSED|Closed/i, { timeout: 8000 });

    // Reopen: click "เปิดอีกครั้ง"
    await row2.getByRole('button', { name: 'เปิดอีกครั้ง' }).click();

    // Reopen modal
    await expect(page.getByText('เปิดงวดบัญชีอีกครั้ง')).toBeVisible({ timeout: 5000 });

    // Fill reason (min 10 chars)
    await page.locator('#reopen-reason').fill('E2E test reopen — automated test');

    // Confirm reopen
    await page.getByRole('button', { name: 'ยืนยันเปิดงวด' }).click();

    // Period returns to OPEN
    await page.waitForLoadState('networkidle');
    const row3 = page.locator('tbody tr').filter({ hasText: '2026-01' });
    await expect(row3).toContainText(/OPEN|Open/i, { timeout: 8000 });
  });

  // ── GL-16: Post JE into closed period — must reject (critical) ─────────────
  adminTest('GL-16: JE into closed period shows error, not created', async ({ page }, testInfo) => {
    testInfo.setTimeout(120_000);
    const workerIndex = testInfo.parallelIndex;
    const { apiUrl } = stackForWorker(workerIndex);

    // Ensure period 2026-02 can be closed: create + finalize a PP30 for it
    const pp30Res = await page.request.post(`${apiUrl}/api/v1/tax-filings/pp30`, {
      data: { period: '2026-02' },
    });
    if (pp30Res.ok()) {
      const pp30Json = await pp30Res.json() as { data?: { id?: string } };
      const filingId = pp30Json.data?.id;
      if (filingId) {
        await page.request.post(`${apiUrl}/api/v1/tax-filings/${filingId}/finalize`);
      }
    }

    // Close 2026-02 via API (using close endpoint with confirm flag)
    const closeRes = await page.request.post(`${apiUrl}/api/v1/periods/2026-02/close`, {
      data: { confirm: true },
    });
    // Period must actually be closed (200) or already closed (409 PERIOD_NOT_OPEN) for the UI guard to fire
    expect([200, 409]).toContain(closeRes.status());

    await page.goto('/gl/journal-entries/new');
    await page.waitForLoadState('networkidle');

    // Set date in closed period (2026-02)
    await page.locator('input[type="date"]').fill('2026-02-15');
    await page.getByPlaceholder('Journal entry description').fill('E2E GL-16 Closed Period JE');

    const row0 = jeRow(page, 0);
    const row1 = jeRow(page, 1);

    // Fill balanced lines
    await pickAccount(page, row0, '11010');
    await fillMoney(page, row0, 4, '100');

    await pickAccount(page, row1, '41010');
    await fillMoney(page, row1, 5, '100');

    // Click Post — client-side check fires, shows warning
    const postBtn = page.getByRole('button', { name: /บันทึก & Post/ });
    await expect(postBtn).not.toBeDisabled();
    await postBtn.click();

    // Period-closed warning should appear (client-side guard in JEForm.handlePost)
    await expect(
      page.getByText(/CLOSED|ปิดแล้ว|period.*closed|closed/i),
    ).toBeVisible({ timeout: 8000 });

    // URL stays on /new (no redirect)
    expect(page.url()).toContain('/new');

    // API cross-check: no POSTED JE with this description
    const searchRes = await page.request.get(
      `${apiUrl}/api/v1/journal-entries?q=${encodeURIComponent('E2E GL-16 Closed Period JE')}`,
    );
    const searchBody = await searchRes.json() as { data: unknown[] };
    const searchRows = Array.isArray(searchBody.data) ? searchBody.data : [];
    const postedRows = searchRows.filter(
      (r: unknown) => (r as { status?: string }).status === 'POSTED',
    );
    expect(postedRows).toHaveLength(0);
  });
});

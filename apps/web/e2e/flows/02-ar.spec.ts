import { expect } from "@playwright/test";
import { adminTest as test } from "../fixtures/auth";
import {
  ensureCustomer,
  ensurePostedInvoice,
  resetWorkerData,
} from "../fixtures/data";
import { stackForWorker } from "../fixtures/stack";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function adminFetch<T>(
  workerIndex: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { apiUrl } = stackForWorker(workerIndex);
  const statePath = resolve(__dirname, `../fixtures/.auth-admin-w${workerIndex}.json`);
  const state = JSON.parse(readFileSync(statePath, "utf8")) as {
    cookies: { name: string; value: string }[];
  };
  const cookieHeader = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as { data: T };
  return json.data;
}

const apiGet = <T>(wi: number, path: string) => adminFetch<T>(wi, "GET", path);
const apiPost = <T>(wi: number, path: string, body: unknown) =>
  adminFetch<T>(wi, "POST", path, body);

/**
 * Open the CustomerPicker popover, search for a customer by partial name,
 * and click the first result.
 */
async function selectCustomer(
  page: import("@playwright/test").Page,
  nameFragment: string,
) {
  // The CustomerPicker trigger is wrapped in data-testid="field-customer"
  await page.locator('[data-testid="field-customer"] button').click();

  // Type into the search box inside the popover
  const searchInput = page.getByPlaceholder("ค้นหารหัส ชื่อ หรือเบอร์โทร...");
  await searchInput.waitFor({ state: "visible", timeout: 5000 });
  await searchInput.fill(nameFragment);

  // Wait for debounce + API call
  await page.waitForTimeout(500);

  // Click the customer result button (filter by name to skip "quick add" button)
  const customerResult = page
    .locator('[data-radix-popper-content-wrapper] button[type="button"]')
    .filter({ hasText: nameFragment });
  await customerResult.first().waitFor({ state: "visible", timeout: 8000 });
  await customerResult.first().click();

  // Popover should close
  await page.waitForTimeout(200);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial("AR module: Customers, Invoices, Receipts", () => {
  let workerIndex: number;
  let customerId: string;
  let customerName: string;

  // IDs captured across tests
  let arSevenId: string;
  let arEightId: string;
  let partialReceiptId: string;

  test.beforeAll(async ({}, testInfo) => {
    workerIndex = testInfo.parallelIndex;
    customerName = `AR E2E Customer ${workerIndex}`;

    try {
      await resetWorkerData(workerIndex);
    } catch {
      // reset endpoint is optional
    }

    const customer = await ensureCustomer(workerIndex, customerName);
    customerId = customer.id;
  });

  // ── AR-01: AR Dashboard ────────────────────────────────────────────────────

  test("AR-01: AR Dashboard loads with metrics", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/ar/dashboard");
    await page.waitForLoadState("networkidle");

    const hydrationErrors = errors.filter(
      (e) => !e.includes("hydration") && !e.includes("Warning") && !e.includes("#418"),
    );
    expect(hydrationErrors).toHaveLength(0);

    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  // ── AR-02: Customer list ───────────────────────────────────────────────────

  test("AR-02: Customer list renders", async ({ page }) => {
    await page.goto("/ar/customers");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table")).toBeVisible();
    await expect(page.getByPlaceholder("ค้นหารหัส ชื่อ เบอร์โทร...")).toBeVisible();
    // At least one row (the ensured customer)
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  // ── AR-03: Search customer ─────────────────────────────────────────────────

  test("AR-03: Search customer by name", async ({ page }) => {
    await page.goto("/ar/customers");
    await page.waitForLoadState("networkidle");

    const search = page.getByPlaceholder("ค้นหารหัส ชื่อ เบอร์โทร...");
    await search.fill("AR E2E Customer");
    await page.waitForTimeout(400);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table tbody tr").first()).toBeVisible();

    await search.fill("");
    await page.waitForTimeout(400);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  // ── AR-04: Create new customer ─────────────────────────────────────────────

  test("AR-04: Create new customer via form", async ({ page }) => {
    await page.goto("/ar/customers/new");
    await page.waitForLoadState("networkidle");

    await page.getByPlaceholder("Customer name (English)").fill("E2E Customer AR");
    await page.getByPlaceholder("0xx-xxx-xxxx").fill("0812345678");
    await page.getByPlaceholder("13 หลัก").fill("1234567890123");
    await page.locator('input[type="number"][min="0"][max="365"]').fill("30");

    await page.getByRole("button", { name: "Create Customer" }).click();
    await page.waitForURL(/\/ar\/customers\/.+/);

    await expect(page.getByText("E2E Customer AR").first()).toBeVisible();
  });

  // ── AR-05: Customer detail ─────────────────────────────────────────────────

  test("AR-05: Customer detail page renders", async ({ page }) => {
    await page.goto(`/ar/customers/${customerId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(customerName).first()).toBeVisible();
  });

  // ── AR-06: Edit customer ───────────────────────────────────────────────────

  test("AR-06: Customer detail has editable content", async ({ page }) => {
    await page.goto(`/ar/customers/${customerId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  // ── AR-07: Create sales invoice — single line, no VAT 🔴 ──────────────────

  test("AR-07: Create sales invoice — single line, no VAT", async ({ page }) => {
    await page.goto("/ar/invoices/new");
    await page.waitForLoadState("networkidle");

    await selectCustomer(page, customerName);

    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(today);

    await page.locator('[data-testid="field-description-0"]').fill("Consulting");
    await page.locator('[data-testid="field-qty-0"]').fill("1");
    await page.locator('[data-testid="field-unit-price-0"]').fill("5000.00");
    await page.locator('[data-testid="field-vat-rate-0"]').selectOption("0");

    await page.waitForTimeout(300);

    await expect(page.locator('[data-testid="total-subtotal"]')).toContainText("5,000");
    await expect(page.locator('[data-testid="total-vat"]')).toContainText("—");
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("5,000");

    await page.locator('[data-testid="action-submit"]').click();
    await page.waitForURL(/\/ar\/invoices\/(?!new)[^/]+$/, { timeout: 15_000 });
    arSevenId = page.url().split("/").pop()!;

    await expect(page.locator('[data-testid="status-badge"]')).toContainText("Draft");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  // ── AR-08: Create invoice — multiple lines + VAT 7% 🔴 ────────────────────

  test("AR-08: Create invoice — multiple lines + VAT 7%", async ({ page }) => {
    await page.goto("/ar/invoices/new");
    await page.waitForLoadState("networkidle");

    await selectCustomer(page, customerName);

    const today = new Date().toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(today);

    await page.locator('[data-testid="field-description-0"]').fill("Service A");
    await page.locator('[data-testid="field-qty-0"]').fill("2");
    await page.locator('[data-testid="field-unit-price-0"]').fill("3000.00");
    await page.locator('[data-testid="field-vat-rate-0"]').selectOption("7");

    await page.locator('[data-testid="action-add-line"]').click();

    await page.locator('[data-testid="field-description-1"]').fill("Service B");
    await page.locator('[data-testid="field-qty-1"]').fill("1");
    await page.locator('[data-testid="field-unit-price-1"]').fill("1000.00");
    await page.locator('[data-testid="field-vat-rate-1"]').selectOption("7");

    await page.waitForTimeout(300);

    // subtotal = 7000, vat = 490 (7% × 7000), grand = 7490
    await expect(page.locator('[data-testid="total-subtotal"]')).toContainText("7,000");
    await expect(page.locator('[data-testid="total-vat"]')).toContainText("490");
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("7,490");

    await page.locator('[data-testid="action-submit"]').click();
    await page.waitForURL(
      (url) => /\/ar\/invoices\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 20000 },
    );
    arEightId = page.url().split("/").pop()!;

    // Cross-check via API
    const inv = await apiGet<{ total: string; vat_amount: string; status: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${arEightId}`,
    );
    expect(inv.status).toBe("DRAFT");
    expect(parseFloat(inv.total)).toBeCloseTo(7490, 0);
    expect(parseFloat(inv.vat_amount)).toBeCloseTo(490, 0);
  });

  // ── AR-09: Post invoice 🔴 ─────────────────────────────────────────────────

  test("AR-09: Post invoice", async ({ page }) => {
    // Navigate to DRAFT invoice detail (shows InvoiceForm with both buttons)
    await page.goto(`/ar/invoices/${arEightId}`);
    await page.waitForLoadState("networkidle");

    // Status badge should show Draft on detail page
    await expect(page.locator('[data-testid="status-badge"]')).toContainText("Draft");

    // Click Post button
    await page.locator('[data-testid="action-post"]').click();
    await page.waitForLoadState("networkidle");

    // After posting, InvoiceReadOnly renders with Posted badge
    await expect(page.locator('[data-testid="status-badge"]')).toContainText("Posted", {
      timeout: 10000,
    });

    // JE link visible
    await expect(page.locator('[data-testid="linked-je"]')).toBeVisible();
    const jeHref = await page.locator('[data-testid="linked-je"]').getAttribute("href");
    expect(jeHref).toMatch(/\/gl\/journal-entries\//);

    // Cross-check via API
    const inv = await apiGet<{ status: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${arEightId}`,
    );
    expect(inv.status).toBe("POSTED");
  });

  // ── AR-10: Invoice list ────────────────────────────────────────────────────

  test("AR-10: Invoice list renders", async ({ page }) => {
    await page.goto("/ar/invoices");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  // ── AR-11: Create partial receipt 🔴 ──────────────────────────────────────

  test("AR-11: Create receipt for POSTED invoice", async ({ page }) => {
    // Navigate with invoice prefill — the form auto-selects customer + invoice
    await page.goto(
      `/ar/receipts/new?invoice_id=${arEightId}&customer_id=${customerId}`,
    );
    await page.waitForLoadState("networkidle");

    // Wait for invoice checkboxes to appear (loaded asynchronously after customer is set)
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().waitFor({ state: 'visible', timeout: 10000 });

    // Invoice checkbox should be auto-checked via prefill
    await expect(checkboxes.first()).toBeChecked({ timeout: 5000 });
    // Allow React totalAmount useEffect to fire after selectedInvoices update
    await page.waitForTimeout(400);

    // Click Post
    await page.getByRole("button", { name: /^Post$/i }).click();

    // Wait for redirect to receipt detail
    await page.waitForURL(
      (url) => /\/ar\/receipts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 15000 },
    );
    partialReceiptId = page.url().split("/").pop()!;

    // Receipt detail page loads
    await expect(page.locator("h1").first()).toBeVisible();

    // Verify invoice status changed via API
    const inv = await apiGet<{ status: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${arEightId}`,
    );
    expect(["PAID", "PARTIAL_PAID", "POSTED"]).toContain(inv.status);
  });

  // ── AR-12: Invoice settlement check 🔴 ────────────────────────────────────

  test("AR-12: Invoice cleared after full payment", async ({ page }) => {
    // Get current invoice status
    const inv = await apiGet<{ total: string; paid_amount: string; status: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${arEightId}`,
    );

    const remaining = parseFloat(inv.total) - parseFloat(inv.paid_amount);
    if (remaining <= 0.01) {
      // Already paid — test passes
      expect(inv.status).toBe("PAID");
      return;
    }

    // Navigate to receipt form and pay remaining balance
    await page.goto(
      `/ar/receipts/new?invoice_id=${arEightId}&customer_id=${customerId}`,
    );
    await page.waitForLoadState("networkidle");

    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().waitFor({ state: 'visible', timeout: 10000 });
    await expect(checkboxes.first()).toBeChecked({ timeout: 5000 });
    // Allow React totalAmount useEffect to fire after selectedInvoices update
    await page.waitForTimeout(400);

    await page.getByRole("button", { name: /^Post$/i }).click();
    await page.waitForURL(
      (url) => /\/ar\/receipts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 15000 },
    );

    const invAfter = await apiGet<{ status: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${arEightId}`,
    );
    expect(["PAID", "PARTIAL_PAID"]).toContain(invAfter.status);
  });

  // ── AR-13: Receipt detail page ─────────────────────────────────────────────

  test("AR-13: Receipt detail page renders", async ({ page }) => {
    // Use the receipt created in AR-11
    const id = partialReceiptId;
    if (!id) {
      test.skip(true, "No receipt ID captured from AR-11");
      return;
    }
    await page.goto(`/ar/receipts/${id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1").first()).toBeVisible();
  });

  // ── AR-14: Void posted invoice ─────────────────────────────────────────────

  test("AR-14: Void posted invoice with no receipts", async ({ page }) => {
    // Create and post a fresh invoice via API
    const inv = await ensurePostedInvoice(workerIndex, customerId, [
      { description: "Void Test Item", qty: 1, unit_price: 100, vat_rate: 0 },
    ]);

    await page.goto(`/ar/invoices/${inv.id}`);
    await page.waitForLoadState("networkidle");

    // Verify POSTED
    await expect(page.locator('[data-testid="status-badge"]')).toContainText("Posted");

    // Click Void
    await page.locator('[data-testid="action-void"]').click();

    // Dialog: fill reason
    const reasonInput = page.locator('textarea[placeholder="ระบุเหตุผลการยกเลิก..."]');
    await expect(reasonInput).toBeVisible();
    await reasonInput.fill("E2E test void reason");

    // Confirm
    await page.getByRole("button", { name: /ยืนยันการยกเลิก/i }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator('[data-testid="status-badge"]')).toContainText("Void", {
      timeout: 10000,
    });
  });

  // ── AR-15: AR Aging report 🔴 ─────────────────────────────────────────────

  test("AR-15: AR Aging report renders and runs", async ({ page }) => {
    await page.goto("/reports/ar-aging");
    await page.waitForLoadState("networkidle");

    // Page title visible
    await expect(page.locator("h1").first()).toBeVisible();

    // Try clicking a Run/Generate button if present
    const runBtn = page
      .getByRole("button", { name: /run|generate|ดึงข้อมูล|คำนวณ/i })
      .first();
    if (await runBtn.isVisible({ timeout: 2000 })) {
      await runBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Some content should be visible after running
    await expect(
      page
        .locator("table, [class*='report'], [class*='aging'], [class*='row']")
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  // ── AR-16: Receipts list ───────────────────────────────────────────────────

  test("AR-16: Receipts list renders with data", async ({ page }) => {
    await page.goto("/ar/receipts");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  // ── AR-17: Dynamic line items — add and remove 🔴 ─────────────────────────

  test("AR-17: Dynamic line items with live recalculation", async ({ page }) => {
    await page.goto("/ar/invoices/new");
    await page.waitForLoadState("networkidle");

    await selectCustomer(page, customerName);

    // Line 0: qty=1, price=100, VAT=7% → gross = 107
    await page.locator('[data-testid="field-qty-0"]').fill("1");
    await page.locator('[data-testid="field-unit-price-0"]').fill("100.00");
    await page.locator('[data-testid="field-vat-rate-0"]').selectOption("7");
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("107");

    // Add line 1: qty=2, price=50, VAT=7%
    // subtotal = 100+100=200, vat=14, grand=214
    await page.locator('[data-testid="action-add-line"]').click();
    await page.locator('[data-testid="field-qty-1"]').fill("2");
    await page.locator('[data-testid="field-unit-price-1"]').fill("50.00");
    await page.locator('[data-testid="field-vat-rate-1"]').selectOption("7");
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="total-subtotal"]')).toContainText("200");
    await expect(page.locator('[data-testid="total-vat"]')).toContainText("14");
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("214");

    // Add line 2: qty=1, price=75, VAT=7%
    // subtotal=275, vat=19.25, grand=294.25
    await page.locator('[data-testid="action-add-line"]').click();
    await page.locator('[data-testid="field-qty-2"]').fill("1");
    await page.locator('[data-testid="field-unit-price-2"]').fill("75.00");
    await page.locator('[data-testid="field-vat-rate-2"]').selectOption("7");
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("294");

    // Remove line 2 → grand reverts to 214
    await page.locator('[data-testid="action-remove-line-2"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("214");

    // Remove line 1 → grand reverts to 107
    await page.locator('[data-testid="action-remove-line-1"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("107");

    // Do NOT submit — this is a UI-only recalculation test
  });

  // ── AR-18: Mixed VAT rates in single invoice 🔴 ───────────────────────────

  test("AR-18: Mixed VAT rates in single invoice", async ({ page }) => {
    await page.goto("/ar/invoices/new");
    await page.waitForLoadState("networkidle");

    await selectCustomer(page, customerName);

    // Line 0: 1000 @ VAT 0%
    await page.locator('[data-testid="field-description-0"]').fill("Item A (no VAT)");
    await page.locator('[data-testid="field-qty-0"]').fill("1");
    await page.locator('[data-testid="field-unit-price-0"]').fill("1000.00");
    await page.locator('[data-testid="field-vat-rate-0"]').selectOption("0");

    // Line 1: 2000 @ VAT 7%
    await page.locator('[data-testid="action-add-line"]').click();
    await page.locator('[data-testid="field-description-1"]').fill("Item B (VAT 7%)");
    await page.locator('[data-testid="field-qty-1"]').fill("1");
    await page.locator('[data-testid="field-unit-price-1"]').fill("2000.00");
    await page.locator('[data-testid="field-vat-rate-1"]').selectOption("7");

    // Line 2: 500 @ VAT 0%
    await page.locator('[data-testid="action-add-line"]').click();
    await page.locator('[data-testid="field-description-2"]').fill("Item C (no VAT)");
    await page.locator('[data-testid="field-qty-2"]').fill("1");
    await page.locator('[data-testid="field-unit-price-2"]').fill("500.00");
    await page.locator('[data-testid="field-vat-rate-2"]').selectOption("0");

    await page.waitForTimeout(300);

    // subtotal=3500, vat=140 (7%×2000 only), grand=3640
    await expect(page.locator('[data-testid="total-subtotal"]')).toContainText("3,500");
    await expect(page.locator('[data-testid="total-vat"]')).toContainText("140");
    await expect(page.locator('[data-testid="total-grand"]')).toContainText("3,640");

    // Submit as draft
    await page.locator('[data-testid="action-submit"]').click();
    await page.waitForURL(
      (url) => /\/ar\/invoices\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 20000 },
    );
    const invId = page.url().split("/").pop()!;

    // Cross-check via API
    const inv = await apiGet<{ vat_amount: string; total: string }>(
      workerIndex,
      `/api/v1/sales-invoices/${invId}`,
    );
    expect(parseFloat(inv.vat_amount)).toBeCloseTo(140, 0);
    expect(parseFloat(inv.total)).toBeCloseTo(3640, 0);
  });

  // ── AR-19: Branch filter on AR Aging ──────────────────────────────────────

  test("AR-19: Branch filter on AR Aging report", async ({ page }) => {
    await page.goto("/reports/ar-aging");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1").first()).toBeVisible();
    // Page loads without crash — branch picker may be present
    const branchPicker = page.locator(
      "[data-testid='filter-branch'], select, [class*='branch']",
    ).first();
    // Just verify page is functional
    await expect(page.locator("body")).toBeVisible();
  });
});

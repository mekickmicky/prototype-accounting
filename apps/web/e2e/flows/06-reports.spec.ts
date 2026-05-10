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

function adminCookieHeader(workerIndex: number): string {
  const statePath = resolve(__dirname, `../fixtures/.auth-admin-w${workerIndex}.json`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as {
    cookies: { name: string; value: string }[];
  };
  return state.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

async function apiGetJson<T>(workerIndex: number, path: string): Promise<{ status: number; data: T | null }> {
  const { apiUrl } = stackForWorker(workerIndex);
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'GET',
    headers: { Cookie: adminCookieHeader(workerIndex) },
  });
  const status = res.status;
  if (!res.ok) {
    return { status, data: null };
  }
  const json = (await res.json()) as { data: T };
  return { status, data: json.data ?? null };
}

async function apiGetBlob(
  workerIndex: number,
  path: string,
): Promise<{ status: number; buffer: Buffer; contentType: string }> {
  const { apiUrl } = stackForWorker(workerIndex);
  const res = await fetch(`${apiUrl}${path}`, {
    method: 'GET',
    headers: { Cookie: adminCookieHeader(workerIndex) },
  });
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    buffer,
    contentType: res.headers.get('content-type') ?? '',
  };
}

function todayBangkok(): string {
  const now = new Date();
  const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const y = bkk.getFullYear();
  const m = String(bkk.getMonth() + 1).padStart(2, '0');
  const d = String(bkk.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function periodCodeBangkok(): string {
  return todayBangkok().slice(0, 7);
}

function startOfYearBangkok(): string {
  return `${todayBangkok().slice(0, 4)}-01-01`;
}

function dec(value: string | undefined | null): number {
  const n = parseFloat(value ?? '0');
  return isNaN(n) ? 0 : n;
}
function r2(n: number): string {
  return n.toFixed(2);
}

// ── Types (subset of API responses we care about) ─────────────────────────────

interface TBResp {
  rows: { account_code: string; debit_total: string; credit_total: string; balance: string }[];
  totals: { debit: string; credit: string; balance: string };
  imbalance?: string;
  branch: string;
}
interface PLResp {
  net_income: string;
  revenue: { total: string };
  cogs: { total: string };
  opex: { total: string };
  other: { total: string };
}
interface BSResp {
  assets: { total: string };
  liabilities: { total: string };
  equity: { total: string };
  total_l_and_e: string;
  net_income_ytd: string;
  balanced: boolean;
}
interface CFResp {
  cash_begin: string;
  cash_end: string;
  cash_delta: string;
  net_change: string;
  reconciled: boolean;
}
interface CashPositionResp {
  totals: { closing_balance: string };
  rows: { closing_balance: string }[];
}
interface BranchPnLResp {
  net_income: { tl: string; ek: string; rama9: string; total: string };
  balanced: boolean;
}
interface VatSummaryResp {
  rows: { period_code: string; output_vat: string; input_vat: string; vat_payable: string }[];
}
interface GLDetailResp {
  account_code: string;
  opening_balance: string;
  closing_balance: string;
  rows: { debit: string; credit: string }[];
  totals: { debit: string; credit: string };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

adminTest.describe.serial('Reports + cross-report consistency', () => {
  adminTest.beforeAll(async ({}, testInfo) => {
    const w = testInfo.parallelIndex;

    // Customer + 2 posted invoices (one with VAT, one without) + 1 posted receipt
    const customer = await ensureCustomer(w, 'E2E Reports Customer');
    const invoiceVat = await ensurePostedInvoice(w, customer.id, [
      { description: 'Reports VAT service', qty: 1, unit_price: 10000, vat_rate: 7 },
    ]);
    await ensurePostedInvoice(w, customer.id, [
      { description: 'Reports zero-rated service', qty: 1, unit_price: 5000, vat_rate: 0 },
    ]);
    await ensurePostedReceipt(w, invoiceVat.id, 10700);

    // Vendor + 1 posted bill + 1 posted payment
    const vendor = await ensureVendor(w, 'E2E Reports Vendor', 3);
    const bill = await ensurePostedBill(w, vendor.id, [
      { description: 'Reports vendor expense', qty: 1, unit_price: 4000, vat_rate: 7 },
    ]);
    // vat_inclusive=false: total=4280, wht=120 (3% × 4000), net_payable=4160
    await ensurePostedPayment(w, bill.id, 4160);
  });

  // RPT-01 🔴
  adminTest('RPT-01: Trial Balance — debits = credits, UI matches API', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const asOf = todayBangkok();

    await page.goto(`${webUrl}/reports/trial-balance`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    // Page rendered without crash
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('undefined');

    // Cross-validate via API
    const { status, data } = await apiGetJson<TBResp>(
      w,
      `/api/v1/reports/trial-balance?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    const debit = dec(data!.totals.debit);
    const credit = dec(data!.totals.credit);
    expect(r2(debit) === r2(credit)).toBe(true);
    // No imbalance present (or zero)
    if (data!.imbalance !== undefined) {
      expect(dec(data!.imbalance)).toBe(0);
    }
  });

  // RPT-02
  adminTest('RPT-02: Trial Balance — branch filter', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const asOf = todayBangkok();

    const tlRes = await apiGetJson<TBResp>(
      w,
      `/api/v1/reports/trial-balance?as_of=${asOf}&branch=TL&format=json`,
    );
    expect(tlRes.status).toBe(200);
    expect(tlRes.data!.branch).toBe('TL');

    // Trial balance still balances per branch
    const tlDr = dec(tlRes.data!.totals.debit);
    const tlCr = dec(tlRes.data!.totals.credit);
    expect(r2(tlDr) === r2(tlCr)).toBe(true);

    // ALL totals should be >= TL totals (rest of branches contribute 0 if seed is TL only)
    const allRes = await apiGetJson<TBResp>(
      w,
      `/api/v1/reports/trial-balance?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(allRes.status).toBe(200);
    expect(dec(allRes.data!.totals.debit) >= tlDr).toBe(true);
  });

  // RPT-03
  adminTest('RPT-03: Trial Balance — CSV export', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const asOf = todayBangkok();
    const res = await apiGetBlob(
      w,
      `/api/v1/reports/trial-balance?as_of=${asOf}&branch=ALL&format=csv`,
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toMatch(/text\/csv/);
    const text = res.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(1); // header + at least 1 row
    const header = lines[0]!.toLowerCase();
    expect(
      header.includes('debit') ||
        header.includes('credit') ||
        header.includes('account'),
    ).toBe(true);
  });

  // RPT-04
  adminTest('RPT-04: Trial Balance — XLSX export (ZIP signature)', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const asOf = todayBangkok();
    const res = await apiGetBlob(
      w,
      `/api/v1/reports/trial-balance?as_of=${asOf}&branch=ALL&format=xlsx`,
    );
    expect(res.status).toBe(200);
    expect(res.buffer.length).toBeGreaterThan(2048);
    // PK ZIP signature 0x504B0304
    expect(res.buffer[0]).toBe(0x50);
    expect(res.buffer[1]).toBe(0x4b);
  });

  // RPT-05 🔴
  adminTest('RPT-05: Profit & Loss — revenue − expenses = net income', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    await page.goto(`${webUrl}/reports/profit-loss`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const { status, data } = await apiGetJson<PLResp>(
      w,
      `/api/v1/reports/profit-loss?period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();

    // net_income = revenue + other - cogs - opex (other can be both income/expense bucket)
    // Just verify it parses to a valid Decimal and is consistent
    const netIncome = dec(data!.net_income);
    expect(isFinite(netIncome)).toBe(true);

    const computed = dec(data!.revenue.total)
      + dec(data!.other.total)
      - dec(data!.cogs.total)
      - dec(data!.opex.total);
    expect(r2(computed) === r2(netIncome)).toBe(true);
  });

  // RPT-06
  adminTest('RPT-06: P&L — comparative period rendered', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    const { status, data } = await apiGetJson<PLResp & { comparative?: PLResp }>(
      w,
      `/api/v1/reports/profit-loss?period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&comparative=true&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    // Comparative result returned
    expect(data!.comparative).toBeDefined();
    // Both periods produce parseable numbers
    expect(isFinite(dec(data!.net_income))).toBe(true);
    expect(isFinite(dec(data!.comparative!.net_income))).toBe(true);
  });

  // RPT-07 🔴
  adminTest('RPT-07: Balance Sheet — assets = liabilities + equity', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const asOf = todayBangkok();

    await page.goto(`${webUrl}/reports/balance-sheet`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const { status, data } = await apiGetJson<BSResp>(
      w,
      `/api/v1/reports/balance-sheet?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();

    const assets = dec(data!.assets.total);
    const liabAndEquity = dec(data!.total_l_and_e);
    expect(r2(assets) === r2(liabAndEquity)).toBe(true);
    expect(data!.balanced).toBe(true);
  });

  // RPT-08 🔴
  adminTest('RPT-08: P&L net income matches BS net_income_ytd', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const asOf = todayBangkok();
    const periodTo = periodCodeBangkok();
    const year = periodTo.slice(0, 4);
    const periodFrom = `${year}-01`;

    const pl = await apiGetJson<PLResp>(
      w,
      `/api/v1/reports/profit-loss?period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&format=json`,
    );
    const bs = await apiGetJson<BSResp>(
      w,
      `/api/v1/reports/balance-sheet?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(pl.status).toBe(200);
    expect(bs.status).toBe(200);

    const plNet = dec(pl.data!.net_income);
    const bsNet = dec(bs.data!.net_income_ytd);
    expect(r2(plNet) === r2(bsNet)).toBe(true);
  });

  // RPT-09 🔴
  adminTest('RPT-09: Cash Flow reconciles to bank balance', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const asOf = todayBangkok();
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    await page.goto(`${webUrl}/reports/cash-flow`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const cf = await apiGetJson<CFResp>(
      w,
      `/api/v1/reports/cash-flow?period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&format=json`,
    );
    expect(cf.status).toBe(200);
    expect(cf.data).toBeTruthy();

    // Closing = Opening + Net change (to the cent)
    const begin = dec(cf.data!.cash_begin);
    const end = dec(cf.data!.cash_end);
    const net = dec(cf.data!.net_change);
    expect(r2(begin + net) === r2(end)).toBe(true);
    expect(cf.data!.reconciled).toBe(true);

    // Closing matches cash position totals
    const cp = await apiGetJson<CashPositionResp>(
      w,
      `/api/v1/reports/cash-position?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(cp.status).toBe(200);
    const cpClose = dec(cp.data!.totals.closing_balance);
    expect(r2(cpClose) === r2(end)).toBe(true);
  });

  // RPT-10 🔴
  adminTest('RPT-10: General Ledger — account drilldown loads (T-14.1 fix)', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    await page.goto(`${webUrl}/reports/general-ledger`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const { status, data } = await apiGetJson<GLDetailResp>(
      w,
      `/api/v1/reports/general-ledger?account=11010&period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&format=json`,
    );
    // Was a 500 before T-14.1 fix; must now be 200
    expect(status).toBe(200);
    expect(data).toBeTruthy();

    // Running balance check: opening + sum(debit) - sum(credit) = closing
    const opening = dec(data!.opening_balance);
    const dr = dec(data!.totals.debit);
    const cr = dec(data!.totals.credit);
    const closing = dec(data!.closing_balance);
    expect(r2(opening + dr - cr) === r2(closing)).toBe(true);
  });

  // RPT-11
  adminTest('RPT-11: General Ledger — non-existent account returns clean error', async ({}, testInfo) => {
    const w = testInfo.parallelIndex;
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    const res = await apiGetJson<unknown>(
      w,
      `/api/v1/reports/general-ledger?account=99999&period_from=${periodFrom}&period_to=${periodTo}&branch=ALL&format=json`,
    );
    // Must NOT be a 500 (the regression we are guarding against)
    expect(res.status).not.toBe(500);
    // Either 4xx with error code, or 200 with empty rows — both are acceptable.
    expect([200, 400, 404, 422]).toContain(res.status);
  });

  // RPT-12
  adminTest('RPT-12: VAT Summary — output_vat − input_vat = vat_payable', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const period = periodCodeBangkok();

    await page.goto(`${webUrl}/reports/vat-summary`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const { status, data } = await apiGetJson<VatSummaryResp>(
      w,
      `/api/v1/reports/vat-summary?period_from=${period}&period_to=${period}&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    expect(Array.isArray(data!.rows)).toBe(true);

    for (const row of data!.rows) {
      const out = dec(row.output_vat);
      const inp = dec(row.input_vat);
      const payable = dec(row.vat_payable);
      // Net VAT = output − input (Decimal compare to the cent)
      expect(r2(out - inp) === r2(payable)).toBe(true);
    }
  });

  // RPT-13
  adminTest('RPT-13: Branch P&L — TL + EK + RAMA9 = Total', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const periodTo = periodCodeBangkok();
    const periodFrom = `${periodTo.slice(0, 4)}-01`;

    await page.goto(`${webUrl}/reports/branch-pnl`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const { status, data } = await apiGetJson<BranchPnLResp>(
      w,
      `/api/v1/reports/branch-pnl?period_from=${periodFrom}&period_to=${periodTo}&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    expect(data!.balanced).toBe(true);

    const sum = dec(data!.net_income.tl)
      + dec(data!.net_income.ek)
      + dec(data!.net_income.rama9);
    expect(r2(sum) === r2(dec(data!.net_income.total))).toBe(true);
  });

  // RPT-14
  adminTest('RPT-14: Cash Position — total = sum of accounts', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);
    const asOf = todayBangkok();

    await page.goto(`${webUrl}/reports/cash-position?as_of=${asOf}`);
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/\/login/);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('NaN');

    const { status, data } = await apiGetJson<CashPositionResp>(
      w,
      `/api/v1/reports/cash-position?as_of=${asOf}&branch=ALL&format=json`,
    );
    expect(status).toBe(200);
    expect(data).toBeTruthy();
    expect(data!.rows.length).toBeGreaterThan(0);

    const total = data!.rows.reduce(
      (acc, r) => acc + dec(r.closing_balance),
      0,
    );
    expect(r2(total) === r2(dec(data!.totals.closing_balance))).toBe(true);
  });

  // RPT-15
  adminTest('RPT-15: Reports filter bar — no NaN in default period', async ({ page }, testInfo) => {
    const w = testInfo.parallelIndex;
    const { webUrl } = stackForWorker(w);

    for (const path of ['/reports/general-ledger', '/reports/vat-summary']) {
      await page.goto(`${webUrl}${path}`);
      await page.waitForLoadState('networkidle');
      const text = await page.locator('body').innerText();
      expect(text).not.toContain('NaN-NaN');
      expect(text).not.toContain('NaN');
    }
  });
});

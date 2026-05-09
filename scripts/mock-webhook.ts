#!/usr/bin/env bun
/**
 * Mock webhook CLI for wind-accounting.
 *
 * Usage:
 *   bun scripts/mock-webhook.ts visit-completed [options]
 *   bun scripts/mock-webhook.ts stock-export [options]
 *   bun scripts/mock-webhook.ts replay <visit_id> [options]
 *
 * Options for visit-completed:
 *   --branch=TL|EK|RAMA9      (default: TL)
 *   --items=N                 number of line items 1-6 (default: 2)
 *   --payment=METHOD          CASH|TRANSFER|CREDIT_CARD|DEBIT_CARD|QR (default: CASH)
 *   --visit-id=ID             idempotency key (auto-generated if omitted)
 *   --bank-account=CODE       bank account code for non-CASH (default: KBANK-001)
 *   --tax-invoice             request full tax invoice
 *   --doctor                  add 30% doctor commission to first item
 *
 * Options for stock-export:
 *   --period=YYYY-MM          (default: current month)
 *   --branch=TL|EK|RAMA9      (default: TL)
 *   --entries=N               number of stock entries (default: 3)
 *   --export-id=ID            idempotency key (auto-generated if omitted)
 *
 * Environment:
 *   WEBHOOK_SECRET_WIND_CLINIC  — required for visit-completed / replay
 *   WEBHOOK_SECRET_WIND_STOCK   — required for stock-export
 *   API_BASE_URL               — default: http://localhost:3001
 */

import crypto from 'node:crypto';

// ── ANSI helpers ──────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const hr = () => dim('─'.repeat(64));

// ── Sample service catalog ────────────────────────────────────────────────

const SERVICES = [
  { code: 'BOTOX_50U',    name: 'Botox 50 Units',       name_th: 'โบท็อกซ์ 50 ยูนิต',           price: '5000.00' },
  { code: 'BOTOX_100U',   name: 'Botox 100 Units',      name_th: 'โบท็อกซ์ 100 ยูนิต',          price: '9000.00' },
  { code: 'FILLER_HA',    name: 'HA Filler 1cc',        name_th: 'ฟิลเลอร์ HA 1 ซีซี',          price: '8000.00' },
  { code: 'LASER_IPL',    name: 'IPL Photofacial',      name_th: 'เลเซอร์ IPL โฟโตเฟเชียล',     price: '3500.00' },
  { code: 'FACIAL_HYDRA', name: 'Hydra Facial',         name_th: 'ไฮดราฟาเชียล',                price: '2500.00' },
  { code: 'PEEL_CHEM',    name: 'Chemical Peel',        name_th: 'เคมีพีล',                     price: '3000.00' },
  { code: 'VITAMIN_DRIP', name: 'Vitamin IV Drip',      name_th: 'วิตามินทางหลอดเลือดดำ',       price: '3500.00' },
  { code: 'THREAD_LIFT',  name: 'Thread Lift',          name_th: 'ร้อยไหมกระชับผิว',            price: '15000.00' },
];

const DOCTOR_IDS = ['DR001', 'DR002', 'DR003'];

// ── Utilities ─────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hmacSign(rawBody: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ── Arg parser ─────────────────────────────────────────────────────────────

type Flags = Record<string, string | boolean>;

function parseArgs(argv: string[]): { subcommand: string; positional: string[]; flags: Flags } {
  const [subcommand = '', ...rest] = argv;
  const positional: string[] = [];
  const flags: Flags = {};
  for (const arg of rest) {
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq === -1) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      }
    } else {
      positional.push(arg);
    }
  }
  return { subcommand, positional, flags };
}

// ── Payload generators ─────────────────────────────────────────────────────

function buildVisitPayload(flags: Flags, overrideVisitId?: string): Record<string, unknown> {
  const branch = (flags['branch'] as string | undefined) ?? 'TL';
  const itemCount = Math.min(Math.max(parseInt(flags['items'] as string) || 2, 1), 6);
  const paymentMethod = ((flags['payment'] as string | undefined) ?? 'CASH').toUpperCase();
  const bankAccount = (flags['bank-account'] as string | undefined) ?? 'KBANK-001';
  const requestTaxInvoice = Boolean(flags['tax-invoice']);
  const addDoctor = Boolean(flags['doctor']);
  const visitId = overrideVisitId ?? (flags['visit-id'] as string | undefined) ?? `VIS-${uid()}`;
  const patientId = `P${randInt(1000, 9999)}`;
  const now = new Date().toISOString();

  // Pick itemCount unique services at random
  const indices = new Set<number>();
  while (indices.size < itemCount) {
    indices.add(randInt(0, SERVICES.length - 1));
  }

  const items = [...indices].map((idx, i) => {
    const svc = SERVICES[idx];
    const qty = randInt(1, 2);
    const item: Record<string, unknown> = {
      type: 'service',
      code: svc.code,
      name: svc.name,
      name_th: svc.name_th,
      qty,
      unit_price: svc.price,
    };
    if (addDoctor && i === 0) {
      item.doctor_id = pick(DOCTOR_IDS);
      item.doctor_commission_pct = 30;
    }
    return item;
  });

  // Sum of (qty × unit_price) — no discounts for simplicity
  const itemSum = items.reduce(
    (sum, item) => sum + parseFloat(item.unit_price as string) * (item.qty as number),
    0,
  );

  // card_fee = 2% of item sum for card methods (payment.amount = itemSum + cardFee)
  let cardFee = 0;
  if (paymentMethod === 'CREDIT_CARD' || paymentMethod === 'DEBIT_CARD') {
    cardFee = Math.round(itemSum * 0.02 * 100) / 100;
  }
  const paymentAmount = (itemSum + cardFee).toFixed(2);

  const payment: Record<string, unknown> = {
    method: paymentMethod,
    amount: paymentAmount,
  };
  if (paymentMethod !== 'CASH') {
    payment.bank_account_code = bankAccount;
  }
  if (cardFee > 0) {
    payment.card_fee = cardFee.toFixed(2);
  }
  if (paymentMethod === 'TRANSFER' || paymentMethod === 'QR') {
    payment.slip_ref = `SLP-${uid()}`;
  }

  return {
    event: 'visit.completed',
    visit_id: visitId,
    patient_id: patientId,
    patient_name: `Test Patient ${patientId}`,
    patient_name_th: `ผู้ทดสอบ ${patientId}`,
    ...(requestTaxInvoice
      ? { patient_tax_id: '1234567890123', patient_address: '123 Sukhumvit Rd, Bangkok 10110' }
      : {}),
    patient_phone: `08${randInt(10000000, 99999999)}`,
    branch_code: branch,
    visit_date: now,
    completed_at: now,
    request_full_tax_invoice: requestTaxInvoice,
    items,
    payment,
  };
}

function buildStockPayload(flags: Flags): Record<string, unknown> {
  const branch = (flags['branch'] as string | undefined) ?? 'TL';
  const period = (flags['period'] as string | undefined) ?? getCurrentPeriod();
  const entryCount = Math.min(Math.max(parseInt(flags['entries'] as string) || 3, 1), 20);
  const exportId = (flags['export-id'] as string | undefined) ?? `EXP-${period}-${uid()}`;
  const now = new Date().toISOString();

  // Alternating RECEIPT (Dr Inventory / Cr AP) and ISSUE (Dr COGS / Cr Inventory) entries
  const TEMPLATES = [
    { type: 'RECEIPT', dr: '16010', cr: '21010', prefix: 'GR' },
    { type: 'ISSUE',   dr: '51010', cr: '16010', prefix: 'IS' },
  ];

  const entries = Array.from({ length: entryCount }, (_, i) => {
    const tpl = TEMPLATES[i % TEMPLATES.length];
    const amount = (randInt(500, 10000)).toFixed(2);
    const docNo = `${tpl.prefix}-${period}-${String(i + 1).padStart(4, '0')}`;
    return {
      type: tpl.type,
      date: now,
      description: `${tpl.type} movement ${docNo}`,
      source_doc_no: docNo,
      source_doc_id: uid(),
      lines: [
        { account_code: tpl.dr, debit: amount,   credit: '0.00', description: `Dr ${tpl.dr}` },
        { account_code: tpl.cr, debit: '0.00',   credit: amount, description: `Cr ${tpl.cr}` },
      ],
    };
  });

  const receipts  = entries.filter(e => e.type === 'RECEIPT').length;
  const issues    = entries.filter(e => e.type === 'ISSUE').length;

  return {
    event: 'stock.period_export',
    export_id: exportId,
    period_code: period,
    branch_code: branch,
    exported_at: now,
    source_summary: { receipts, issues, transfers: 0, adjustments: 0, counts: 0 },
    entries,
  };
}

// ── HTTP sender ────────────────────────────────────────────────────────────

async function sendWebhook(
  path: string,
  payload: Record<string, unknown>,
  secret: string,
  baseUrl: string,
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const signature = hmacSign(rawBody, secret);
  const timestamp = Date.now().toString();
  const url = `${baseUrl}/api/v1${path}`;

  console.log(hr());
  console.log(bold(cyan(`→ POST ${url}`)));
  console.log(dim(`  x-signature : ${signature.slice(0, 24)}...`));
  console.log(dim(`  x-timestamp : ${timestamp}`));
  console.log(`\n${bold('Request body:')}`);
  console.log(JSON.stringify(payload, null, 2));
  console.log(hr());

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-signature': signature,
        'x-timestamp': timestamp,
      },
      body: rawBody,
    });
  } catch (err) {
    console.error(red(`\nNetwork error: ${err instanceof Error ? err.message : String(err)}`));
    console.error(yellow(`Is the API server running at ${baseUrl}?`));
    process.exit(1);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  const statusColor = response.ok ? green : red;
  console.log(`\n${bold(statusColor(`Response ${response.status}:`))}`);
  console.log(JSON.stringify(body, null, 2));
  console.log(hr() + '\n');

  if (!response.ok) {
    process.exit(1);
  }
}

// ── Help ───────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${bold('mock-webhook')} — Test webhook endpoints for wind-accounting

${bold('Usage:')}
  bun scripts/mock-webhook.ts visit-completed [options]
  bun scripts/mock-webhook.ts stock-export    [options]
  bun scripts/mock-webhook.ts replay <visit_id>

${bold('visit-completed options:')}
  --branch=TL|EK|RAMA9      Branch code (default: TL)
  --items=N                 Number of service items, 1-6 (default: 2)
  --payment=METHOD          CASH|TRANSFER|CREDIT_CARD|DEBIT_CARD|QR (default: CASH)
  --visit-id=ID             Idempotency key (auto-generated if omitted)
  --bank-account=CODE       Bank account code for non-CASH (default: KBANK-001)
  --tax-invoice             Request full tax invoice
  --doctor                  Add 30% doctor commission to first item

${bold('stock-export options:')}
  --period=YYYY-MM          Accounting period (default: current month)
  --branch=TL|EK|RAMA9      Branch code (default: TL)
  --entries=N               Number of stock entries, 1-20 (default: 3)
  --export-id=ID            Idempotency key (auto-generated if omitted)

${bold('Environment variables:')}
  WEBHOOK_SECRET_WIND_CLINIC  Shared secret (required for visit-completed / replay)
  WEBHOOK_SECRET_WIND_STOCK   Shared secret (required for stock-export)
  API_BASE_URL                API base URL (default: http://localhost:3001)

${bold('Examples:')}
  bun scripts/mock-webhook.ts visit-completed --branch=TL --items=2
  bun scripts/mock-webhook.ts visit-completed --payment=CREDIT_CARD --doctor --tax-invoice
  bun scripts/mock-webhook.ts visit-completed --payment=TRANSFER --bank-account=KBANK-001
  bun scripts/mock-webhook.ts stock-export --period=2026-05 --entries=10
  bun scripts/mock-webhook.ts replay VIS-lf2abc123

${bold('Generate secrets:')}
  openssl rand -hex 32
`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { subcommand, positional, flags } = parseArgs(process.argv.slice(2));
  const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');

  if (!subcommand || subcommand === '--help' || subcommand === 'help') {
    printHelp();
    process.exit(0);
  }

  if (subcommand === 'visit-completed') {
    const secret = process.env.WEBHOOK_SECRET_WIND_CLINIC;
    if (!secret) {
      console.error(red('Error: WEBHOOK_SECRET_WIND_CLINIC is not set'));
      process.exit(1);
    }
    const payload = buildVisitPayload(flags);
    console.log(bold(`\nFiring visit-completed  visit_id=${cyan(payload.visit_id as string)}`));
    await sendWebhook('/webhooks/wind-clinic/visit-completed', payload, secret, baseUrl);

  } else if (subcommand === 'stock-export') {
    const secret = process.env.WEBHOOK_SECRET_WIND_STOCK;
    if (!secret) {
      console.error(red('Error: WEBHOOK_SECRET_WIND_STOCK is not set'));
      process.exit(1);
    }
    const payload = buildStockPayload(flags);
    console.log(bold(`\nFiring stock-export  export_id=${cyan(payload.export_id as string)}`));
    await sendWebhook('/webhooks/wind-stock/period-export', payload, secret, baseUrl);

  } else if (subcommand === 'replay') {
    const visitId = positional[0];
    if (!visitId) {
      console.error(red('Usage: mock-webhook.ts replay <visit_id>'));
      process.exit(1);
    }
    const secret = process.env.WEBHOOK_SECRET_WIND_CLINIC;
    if (!secret) {
      console.error(red('Error: WEBHOOK_SECRET_WIND_CLINIC is not set'));
      process.exit(1);
    }
    console.log(bold(`\nReplaying visit_id=${cyan(visitId)} (expects cached result)`));
    const payload = buildVisitPayload(flags, visitId);
    await sendWebhook('/webhooks/wind-clinic/visit-completed', payload, secret, baseUrl);

  } else {
    console.error(red(`Unknown subcommand: ${subcommand}`));
    printHelp();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(red('Fatal error:'), err);
  process.exit(1);
});

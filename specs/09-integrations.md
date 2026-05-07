# 09 — Integrations

This spec defines how `wind-accounting` receives data from sister systems: `wind-clinic` (clinic management) and `wind-stock` (inventory). Both push data via webhook.

## Architecture Principle

`wind-accounting` is the **system of record for accounting**. It doesn't pull from other systems — they push to it. This keeps responsibility clear: each system owns its domain.

```
┌──────────────┐       webhook       ┌──────────────────┐
│ wind-clinic  │ ──────────────────► │ wind-accounting  │
│ (visit done) │                     │ /webhooks/wind-  │
└──────────────┘                     │  clinic/visit-   │
                                     │  completed       │
                                     └──────────────────┘
                                              ▲
                                              │
┌──────────────┐                              │
│ wind-stock   │ ─────── period export ───────┘
│ (month end)  │
└──────────────┘
```

## Common Webhook Pattern

### HMAC signature

Every webhook request is signed with HMAC-SHA256 using a shared secret per source.

```ts
// Sender side
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(rawBody)
  .digest('hex');

fetch('https://accounting.wind.com/api/v1/webhooks/wind-clinic/visit-completed', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-signature': signature,
    'x-timestamp': Date.now().toString(),
  },
  body: rawBody,
});
```

### Receiver validation

```ts
function validateWebhook(req: Request, secret: string): boolean {
  const sig = req.headers.get('x-signature');
  const ts = req.headers.get('x-timestamp');
  
  // Reject if timestamp older than 5 minutes (prevent replay)
  if (Date.now() - parseInt(ts) > 5 * 60 * 1000) {
    throw new Error('TIMESTAMP_TOO_OLD');
  }
  
  const expected = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('hex');
  
  if (sig !== expected) {
    throw new Error('SIGNATURE_INVALID');
  }
  
  return true;
}
```

Secrets stored in environment variables:
- `WEBHOOK_SECRET_WIND_CLINIC`
- `WEBHOOK_SECRET_WIND_STOCK`

### Idempotency

Each webhook payload has an idempotency key. The receiver tracks processed keys for 30 days and returns the original result for retries.

```ts
// Idempotency table (Prisma)
model WebhookProcessed {
  id            String   @id @default(cuid())
  source        String   // "wind-clinic" | "wind-stock"
  idempotency_key String
  result_json   Json
  created_at    DateTime @default(now())
  
  @@unique([source, idempotency_key])
  @@index([created_at])  // for cleanup
}
```

On every webhook:
1. Validate signature
2. Look up `(source, idempotency_key)` — if exists, return original `result_json` with HTTP 200
3. Otherwise, process and store result

---

## 1. Wind-Clinic: Visit Completed

When a patient finishes their visit and pays at the clinic, `wind-clinic` sends this event. Accounting auto-creates the invoice + receipt + JE.

### Endpoint

`POST /api/v1/webhooks/wind-clinic/visit-completed`

### Headers

```
Content-Type: application/json
x-signature: <hmac>
x-timestamp: <unix-ms>
```

### Request body

```ts
{
  event: 'visit.completed',
  visit_id: string,           // ← idempotency key
  patient_id: string,
  patient_name: string,
  patient_name_th?: string,
  patient_tax_id?: string,    // 13-digit, if requesting full tax invoice
  patient_address?: string,
  patient_phone?: string,
  branch_code: string,        // 'TL' | 'EK' | 'RAMA9'
  visit_date: string,         // ISO 8601
  completed_at: string,       // ISO 8601
  request_full_tax_invoice: boolean,
  items: [
    {
      type: 'service' | 'product',
      code: string,           // service or product code from clinic catalog
      name: string,
      name_th?: string,
      qty: number,
      unit_price: string,     // Decimal string
      discount?: string,
      doctor_id?: string,
      doctor_commission_pct?: number,  // 0-100
    }
  ],
  payment: {
    method: 'CASH' | 'TRANSFER' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'QR' | 'CHEQUE' | 'OTHER',
    amount: string,           // Decimal string, total paid
    bank_account_code?: string,  // required if not CASH
    card_fee?: string,        // for CREDIT_CARD/DEBIT_CARD
    slip_ref?: string,        // for TRANSFER/QR
  },
  notes?: string,
}
```

### Processing logic

```ts
async function handleVisitCompleted(payload: VisitCompletedPayload) {
  return await prisma.$transaction(async (tx) => {
    // 1. Idempotency check
    const existing = await tx.webhookProcessed.findUnique({
      where: { source_idempotency_key: { source: 'wind-clinic', idempotency_key: payload.visit_id } }
    });
    if (existing) return existing.result_json;
    
    // 2. Get/create customer
    let customer = await tx.customer.findFirst({
      where: { code: `WIND-${payload.patient_id}` }
    });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          code: `WIND-${payload.patient_id}`,
          name: payload.patient_name,
          name_th: payload.patient_name_th,
          tax_id: payload.patient_tax_id,
          address: payload.patient_address,
          phone: payload.patient_phone,
          branch_office: '00000',
        }
      });
    }
    
    // 3. Map items to invoice lines using account_map
    const accountMap = await getAccountMap(tx);
    const lines = payload.items.map((item, idx) => ({
      line_no: idx + 1,
      description: item.name_th ?? item.name,
      service_code: item.type === 'service' ? item.code : undefined,
      product_code: item.type === 'product' ? item.code : undefined,
      qty: new Decimal(item.qty),
      unit_price: new Decimal(item.unit_price),
      discount: new Decimal(item.discount ?? '0'),
      vat_rate: new Decimal(7),
      revenue_account_code: mapServiceToAccount(item.code, accountMap),
      line_total: ...,  // computed
    }));
    
    // 4. Create + post SalesInvoice
    const invoice = await createAndPostInvoice(tx, {
      customer_id: customer.id,
      branch_code: payload.branch_code,
      issue_date: new Date(payload.visit_date),
      due_date: new Date(payload.visit_date),  // immediate
      is_tax_invoice: payload.request_full_tax_invoice,
      vat_inclusive: true,
      source_type: 'WIND_VISIT',
      source_ref: payload.visit_id,
      lines,
    });
    
    // 5. Create + post Receipt
    const bankAccountId = payload.payment.method === 'CASH' 
      ? null 
      : (await tx.bankAccount.findFirst({ where: { code: payload.payment.bank_account_code } }))?.id;
    
    const receipt = await createAndPostReceipt(tx, {
      customer_id: customer.id,
      branch_code: payload.branch_code,
      receipt_date: new Date(payload.visit_date),
      total_amount: new Decimal(payload.payment.amount),
      payment_method: payload.payment.method,
      bank_account_id: bankAccountId,
      card_fee: new Decimal(payload.payment.card_fee ?? '0'),
      slip_ref: payload.payment.slip_ref,
      applications: [{ invoice_id: invoice.id, applied_amount: invoice.total }],
    });
    
    // 6. Doctor commission accrual (if any)
    for (const item of payload.items) {
      if (item.doctor_id && item.doctor_commission_pct) {
        const commissionBase = new Decimal(item.unit_price).times(item.qty).minus(item.discount ?? '0');
        const commission = commissionBase.times(item.doctor_commission_pct).div(100);
        // Post separate JE: Dr. Doctor Commission Expense, Cr. Commission Payable
        await postCommissionAccrual(tx, {
          doctor_id: item.doctor_id,
          amount: commission,
          branch_code: payload.branch_code,
          date: new Date(payload.visit_date),
          source_ref: payload.visit_id,
        });
      }
    }
    
    // 7. Save idempotency record
    const result = {
      invoice_no: invoice.invoice_no,
      tax_invoice_no: invoice.tax_invoice_no,
      receipt_no: receipt.receipt_no,
      je_no: invoice.je.je_no,
      receipt_je_no: receipt.je.je_no,
    };
    
    await tx.webhookProcessed.create({
      data: {
        source: 'wind-clinic',
        idempotency_key: payload.visit_id,
        result_json: result,
      }
    });
    
    return result;
  });
}
```

### Response

```ts
// 200 OK
{
  success: true,
  data: {
    invoice_no: 'INV-2026-0042',
    tax_invoice_no: 'TAX-2026-0008',  // if requested
    receipt_no: 'RCT-2026-0089',
    je_no: 'JE-2026-0145',           // invoice JE
    receipt_je_no: 'JE-2026-0146',   // receipt JE
  }
}

// 400 Bad Request — validation error (won't retry)
// 401 Unauthorized — bad signature
// 409 Conflict — period closed
// 500 Internal — will be retried by sender
```

### Edge cases

- **Period closed:** Return 409 with explicit error. Wind-clinic should queue for manual review.
- **Customer match:** Match by `WIND-{patient_id}`. Never auto-merge with existing customers by name (avoid mistakes).
- **Service code unknown:** Fall back to `41090 — Other Services` and log a warning. Add a TODO list for the accountant.
- **Card fee on cash:** Reject (validation error).
- **Total mismatch:** Sum of `(qty × unit_price - discount)` should equal `payment.amount` minus `card_fee`. If not, return 422 with explanation.

### Account mapping

```ts
// Settings: wind_clinic_service_to_revenue
{
  "BOTOX": "41010",
  "BOTOX_50U": "41010",
  "BOTOX_100U": "41010",
  "FILLER": "41020",
  "FILLER_HA": "41020",
  "LASER_IPL": "41030",
  "LASER_FRACT": "41030",
  "FACIAL": "41040",
  "PEEL": "41040",
  "DEFAULT": "41090"  // fallback
}

// Settings: wind_clinic_product_to_revenue
{
  "SKINCARE_*": "42010",  // wildcard match
  "DEFAULT": "42010"
}
```

UI to edit these mappings: `/settings/account-map`.

---

## 2. Wind-Stock: Period Export

At month-end, `wind-stock` exports stock movements as JE candidates. Accounting bulk-imports them.

### Endpoint

`POST /api/v1/webhooks/wind-stock/period-export`

### Trigger

User in `wind-stock` clicks "Export to Accounting" for a period. Wind-stock posts to this endpoint.

### Request body

```ts
{
  event: 'stock.period_export',
  export_id: string,           // ← idempotency key, generated by wind-stock
  period_code: string,         // "2026-05"
  branch_code: string,
  exported_at: string,
  source_summary: {
    receipts: number,           // count of GR docs
    issues: number,             // count of issue docs
    transfers: number,
    adjustments: number,
    counts: number,
  },
  entries: [
    {
      type: 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'COUNT' | 'DAMAGE' | 'EXPIRED' | 'THEFT' | 'OTHER',
      date: string,
      description: string,
      source_doc_no: string,    // GR-2026-0042, etc.
      source_doc_id: string,
      lines: [
        { 
          account_code: string,
          debit: string,         // Decimal as string
          credit: string,
          description?: string,
        }
      ]
    }
  ]
}
```

### Processing

```ts
async function handlePeriodExport(payload: PeriodExportPayload) {
  return await prisma.$transaction(async (tx) => {
    // Idempotency check
    const existing = await tx.webhookProcessed.findUnique({
      where: { source_idempotency_key: { source: 'wind-stock', idempotency_key: payload.export_id } }
    });
    if (existing) return existing.result_json;
    
    // Period must be open
    const period = await tx.fiscalPeriod.findUnique({ where: { code: payload.period_code } });
    if (period?.status !== 'OPEN') {
      throw new BusinessRuleError('PERIOD_NOT_OPEN', `Period ${payload.period_code} is ${period?.status ?? 'missing'}`);
    }
    
    // Validate all account codes
    const allAccountCodes = new Set(payload.entries.flatMap(e => e.lines.map(l => l.account_code)));
    const accounts = await tx.account.findMany({ where: { code: { in: [...allAccountCodes] } } });
    if (accounts.length !== allAccountCodes.size) {
      const missing = [...allAccountCodes].filter(c => !accounts.find(a => a.code === c));
      throw new BusinessRuleError('ACCOUNT_NOT_FOUND', `Missing accounts: ${missing.join(', ')}`);
    }
    
    // Bulk-create JEs
    const createdJEs = [];
    for (const entry of payload.entries) {
      // Validate balanced
      const totalDr = entry.lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
      const totalCr = entry.lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
      if (!totalDr.eq(totalCr)) {
        throw new BusinessRuleError('JE_NOT_BALANCED', 
          `Stock entry ${entry.source_doc_no}: Dr ${totalDr} ≠ Cr ${totalCr}`);
      }
      
      const je = await createAndPostJE(tx, {
        entry_date: new Date(entry.date),
        branch_code: payload.branch_code,
        description: `[STOCK] ${entry.description}`,
        source_type: 'STOCK_EXPORT',
        source_id: entry.source_doc_id,
        lines: entry.lines.map((l, idx) => ({
          line_no: idx + 1,
          account_code: l.account_code,
          branch_code: payload.branch_code,
          debit: new Decimal(l.debit),
          credit: new Decimal(l.credit),
          description: l.description ?? entry.description,
        })),
      });
      
      createdJEs.push(je);
    }
    
    const result = {
      period: payload.period_code,
      created_count: createdJEs.length,
      first_je: createdJEs[0]?.je_no,
      last_je: createdJEs[createdJEs.length - 1]?.je_no,
    };
    
    await tx.webhookProcessed.create({
      data: {
        source: 'wind-stock',
        idempotency_key: payload.export_id,
        result_json: result,
      }
    });
    
    return result;
  });
}
```

### Atomicity

The entire export is one transaction. If any entry fails (e.g., unbalanced, missing account), the whole import rolls back. Wind-stock fixes the export and retries with the same `export_id`.

### Response

```ts
{
  success: true,
  data: {
    period: '2026-05',
    created_count: 67,
    first_je: 'JE-2026-0301',
    last_je: 'JE-2026-0367',
  }
}
```

---

## 3. Outbound Webhooks (Future, Out of Scope)

Eventually, `wind-accounting` may push events to other systems:

- `invoice.posted` → notify wind-clinic (so it can show payment status to staff)
- `payment.recorded` → notify vendor management system
- `period.closed` → notify auditor system

Not implemented in prototype.

---

## 4. Testing Webhooks Locally

### Mock client

Build a small CLI tool `scripts/mock-webhook.ts`:

```ts
// Usage:
//   bun run scripts/mock-webhook.ts visit-completed --visit-id v123 --amount 5350
//   bun run scripts/mock-webhook.ts stock-export --period 2026-05

import crypto from 'crypto';

const command = process.argv[2];
const args = parseArgs(process.argv.slice(3));

if (command === 'visit-completed') {
  const payload = generateVisitPayload(args);
  await sendWebhook('/webhooks/wind-clinic/visit-completed', payload, process.env.WEBHOOK_SECRET_WIND_CLINIC!);
} else if (command === 'stock-export') {
  // ...
}
```

### UI for testing

In Settings (admin only): `/settings/integrations/test`. A page with forms to fire test webhooks. Useful for QA.

---

## 5. Monitoring & Observability

For each webhook source, log:
- Total invocations per day
- Success vs failure count
- Average processing time
- Idempotent replays (count)

Show in `/settings/integrations/dashboard`.

For prototype: simple log file + UI table that reads `WebhookProcessed` table.

---

## 6. Configuration

```env
# .env
WEBHOOK_SECRET_WIND_CLINIC=<random-256-bit-hex>
WEBHOOK_SECRET_WIND_STOCK=<random-256-bit-hex>

# Optional: clock skew tolerance for x-timestamp validation (default 5 min)
WEBHOOK_TIMESTAMP_TOLERANCE_MS=300000
```

Generate secrets with `openssl rand -hex 32`.

---

## 7. Phase 8 Implementation Checklist

1. ✅ `WebhookProcessed` Prisma model
2. ✅ HMAC validation middleware
3. ✅ `/webhooks/wind-clinic/visit-completed` endpoint
4. ✅ Customer auto-create/match logic
5. ✅ Auto invoice + receipt + JE creation
6. ✅ Account mapping (settings + lookup)
7. ✅ `/webhooks/wind-stock/period-export` endpoint
8. ✅ Bulk JE create
9. ✅ Idempotency
10. ✅ Mock webhook CLI tool
11. ✅ Test page UI in settings
12. ✅ Webhook log dashboard

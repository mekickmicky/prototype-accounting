# 07 — Bank Integration

This spec defines how the prototype mocks bank integration in a way that can be swapped for real KBank/SCB APIs later without rewriting the consuming code.

## Architecture Principle

Hide all bank-specific logic behind a single `BankProvider` interface. The application layer never knows which provider it's using.

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Service layer │ ──► │  BankProvider    │ ──► │ MockBankProvider│
│  (consumes)    │     │  (interface)     │     │ KBankProvider   │
└────────────────┘     └──────────────────┘     │ SCBProvider     │
                                                └─────────────────┘
```

## The Interface

```ts
// lib/bank/provider.ts

export interface BankProvider {
  /** Verify a payment slip QR/ref against the bank */
  verifySlip(input: VerifySlipInput): Promise<SlipVerifyResult>;
  
  /** Import bank statement for a date range */
  importStatement(input: ImportStatementInput): Promise<BankTransactionRaw[]>;
  
  /** Get account balance */
  getBalance(bankAccountCode: string): Promise<Decimal>;
  
  /** Register webhook URL with the bank (for real-time txn notifications) */
  registerWebhook?(url: string): Promise<void>;
}

export interface VerifySlipInput {
  slipRef: string;
  expectedAmount?: Decimal;
  expectedDate?: Date;
}

export interface SlipVerifyResult {
  verified: boolean;
  reason?: string;
  details?: {
    transRef: string;
    transDate: string;
    sender: { name: string; bankShortName: string; accountTail: string };
    receiver: { name: string; bankShortName: string; accountTail: string };
    amount: Decimal;
  };
}

export interface ImportStatementInput {
  bankAccountCode: string;
  dateFrom: Date;
  dateTo: Date;
}

export interface BankTransactionRaw {
  txnDate: Date;
  description: string;
  debit: Decimal;
  credit: Decimal;
  balance?: Decimal;
  bankRef: string;
}
```

## Mock Provider (Phase 1-7)

```ts
// lib/bank/mock-provider.ts

import type { BankProvider } from './provider';
import { Decimal } from 'decimal.js';

export class MockBankProvider implements BankProvider {
  async verifySlip(input: VerifySlipInput): Promise<SlipVerifyResult> {
    // Mock logic:
    // - If slipRef starts with "MOCK-INVALID" → return verified: false
    // - If slipRef starts with "MOCK-MISMATCH" → return verified with different amount
    // - Otherwise → return verified: true with realistic-looking data
    
    if (input.slipRef.startsWith('MOCK-INVALID')) {
      return { verified: false, reason: 'Slip reference not found' };
    }
    
    if (input.slipRef.startsWith('MOCK-MISMATCH')) {
      return {
        verified: true,
        details: {
          transRef: input.slipRef,
          transDate: new Date().toISOString(),
          sender: { name: 'นาย สมชาย ใจดี', bankShortName: 'KBANK', accountTail: '1234' },
          receiver: { name: 'WIND CLINIC CO., LTD.', bankShortName: 'KBANK', accountTail: '6789' },
          amount: new Decimal(input.expectedAmount ?? 0).minus(100),  // off by 100
        }
      };
    }
    
    return {
      verified: true,
      details: {
        transRef: input.slipRef,
        transDate: new Date().toISOString(),
        sender: { name: 'นาย ทดสอบ ระบบ', bankShortName: 'KBANK', accountTail: this.randomTail() },
        receiver: { name: 'WIND CLINIC CO., LTD.', bankShortName: 'KBANK', accountTail: '6789' },
        amount: input.expectedAmount ?? new Decimal(this.randomAmount()),
      }
    };
  }
  
  async importStatement(input: ImportStatementInput): Promise<BankTransactionRaw[]> {
    // Generate a deterministic set of fake transactions for the date range
    // Mix of: customer payments, vendor payments, bank fees, transfers
    
    const txns: BankTransactionRaw[] = [];
    const days = differenceInDays(input.dateTo, input.dateFrom);
    
    for (let i = 0; i <= days; i++) {
      const date = addDays(input.dateFrom, i);
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      
      // 2-5 txns per day
      const count = 2 + Math.floor(Math.random() * 4);
      for (let j = 0; j < count; j++) {
        txns.push(this.generateMockTxn(date, input.bankAccountCode));
      }
    }
    
    return txns;
  }
  
  async getBalance(bankAccountCode: string): Promise<Decimal> {
    // Sum of all bank txns + opening balance
    const seed = this.bankAccountSeed(bankAccountCode);
    return new Decimal(500000).plus(seed);  // mock starting balance
  }
  
  // private helpers
  private randomTail() { return String(Math.floor(Math.random() * 10000)).padStart(4, '0'); }
  private randomAmount() { return (Math.floor(Math.random() * 50000) + 100); }
  private generateMockTxn(date: Date, account: string): BankTransactionRaw {
    // see MOCK_TXN_TEMPLATES below
  }
  private bankAccountSeed(code: string): number {
    return code.split('').reduce((sum, c) => sum + c.charCodeAt(0), 0);
  }
}
```

### Mock txn templates

The mock generator should produce realistic-looking variety:

```ts
const MOCK_TXN_TEMPLATES = [
  // Customer payments (credit, money in)
  { type: 'CR', desc: 'TRF FROM XXX-X-X1234-5 / SOMCHAI J.', range: [3000, 25000] },
  { type: 'CR', desc: 'QR PAYMENT FROM PROMPTPAY', range: [1500, 15000] },
  { type: 'CR', desc: 'CREDIT CARD SETTLEMENT', range: [10000, 80000] },
  
  // Vendor payments (debit, money out)
  { type: 'DR', desc: 'TRF TO XXX-X-X9999-1 / SUPPLIER A LTD.', range: [5000, 50000] },
  { type: 'DR', desc: 'BILL PAYMENT - PEA ELECTRICITY', range: [3000, 12000] },
  
  // Bank fees (debit, small)
  { type: 'DR', desc: 'TRF FEE', range: [10, 30] },
  { type: 'DR', desc: 'CHEQUE FEE', range: [50, 100] },
  
  // Inter-branch
  { type: 'DR', desc: 'TRF TO OWN ACCT XXX-X-X8888', range: [50000, 200000] },
];
```

Generate ~30-50 transactions per month for `KBANK-001` to populate a realistic reconciliation workspace.

## Real Providers (Future, Out of Scope for Prototype)

### KBankProvider sketch

```ts
// lib/bank/kbank-provider.ts (FUTURE — do not implement in prototype)

export class KBankProvider implements BankProvider {
  constructor(private config: { apiKey: string; clientId: string; clientSecret: string; }) {}
  
  async verifySlip(input: VerifySlipInput): Promise<SlipVerifyResult> {
    // Call KBank Slip Verification API
    // POST https://openapi-sandbox.kasikornbank.com/v1/qrpayment/verify
    // Decode QR if needed (EMVCo format)
    // Map response to SlipVerifyResult
  }
  
  async importStatement(input: ImportStatementInput): Promise<BankTransactionRaw[]> {
    // Currently no public API for full statement download (corporate-only)
    // For now: throw NotImplementedError
    // Long-term: integrate via Corporate Banking API once approved
    throw new Error('KBANK_STATEMENT_NOT_AVAILABLE');
  }
  
  // ...
}
```

### SCBProvider sketch

```ts
// SCB has Easy Net for corporate. Sandbox: developer.scb
// Endpoints: /v1/oauth/token, /v1/payment/qrcode, /v1/partners/sandbox/v1/payment/qrcode/creditcard
```

## Provider Selection

```ts
// lib/bank/index.ts

import { MockBankProvider } from './mock-provider';
// import { KBankProvider } from './kbank-provider';  // future

export function getBankProvider(): BankProvider {
  const provider = process.env.BANK_PROVIDER ?? 'mock';
  
  switch (provider) {
    case 'mock':
      return new MockBankProvider();
    case 'kbank':
      throw new Error('KBank provider not yet implemented');
      // return new KBankProvider({ ... });
    default:
      throw new Error(`Unknown bank provider: ${provider}`);
  }
}
```

Service layer always calls `getBankProvider()`. Never instantiate a specific provider directly.

## Webhook Architecture (Future)

Real KBank webhook flow (when implemented):

1. KBank sends POST to our endpoint with HMAC-signed payload
2. We validate signature
3. Look up the bank account by KBank account number
4. Insert BankTransaction
5. Run auto-match logic
6. If matched with high confidence → notify user; else → flag for manual reconcile

For prototype, simulate this with a "Generate today's mock transactions" button on the bank import page.

## Slip Verification UX

In the Receipt form, when payment_method is `TRANSFER` or `QR`:

1. User enters/scans slip ref
2. Click "Verify slip" button
3. System calls `provider.verifySlip({ slipRef, expectedAmount, expectedDate })`
4. Display result inline:
   - ✓ Green box if verified and amount/date match
   - ⚠ Yellow box if verified but amount mismatch (user can override)
   - ✗ Red box if not verified

In the prototype with mock provider:
- Any slip ref containing "INVALID" → fails
- Any slip ref containing "MISMATCH" → succeeds with wrong amount
- Other slip refs → succeed cleanly

## Bank Import UX

Page `/bank/import`:

```
┌────────────────────────────────────────────────────────┐
│ Import Bank Statement                                   │
├────────────────────────────────────────────────────────┤
│ Bank Account:   [KBank Current 0123456789 ▾]           │
│ Period:         [01/05/26] to [31/05/26]               │
│                                                         │
│ Source:                                                │
│  ◉ Generate mock data (prototype only)                 │
│  ○ Paste CSV                                           │
│  ○ Upload XLSX file                                    │
│                                                         │
│ [Preview]  [Import]                                    │
└────────────────────────────────────────────────────────┘
```

After import → auto-redirect to reconciliation page with all imported txns.

## CSV Format (For Real Bank Imports)

When the user exports from KBank/SCB internet banking and pastes:

```csv
Date,Time,Description,Debit,Credit,Balance
07/05/2026,09:15,TRF FROM 0123-45-6789 / SOMCHAI,,5350.00,125640.00
07/05/2026,11:30,QR PMT,,1500.00,127140.00
07/05/2026,14:22,TRF TO 9876-54-3210 / SUPPLIER A,3200.00,,123940.00
```

Parser must handle:
- Date in `dd/MM/yyyy` (Thai banks)
- Comma-separated thousands in amounts
- Empty fields for non-applicable side
- Optional opening row

Map to `BankTransactionRaw[]`.

## Idempotency

Bank txns must not duplicate on re-import. Dedup key: `(bank_account_id, bank_ref)` or `(bank_account_id, txn_date, description, debit, credit)` if no `bank_ref`.

```sql
CREATE UNIQUE INDEX bank_txn_dedup
  ON bank_transactions (bank_account_id, COALESCE(bank_ref, MD5(description || debit || credit || txn_date)));
```

Or enforce in application: on import, check for existing matching rows and skip.

## Reconciliation Heuristic

```ts
function suggestMatches(bankTxn: BankTransaction): MatchSuggestion[] {
  const candidates = await findCandidatePayments({
    amount: bankTxn.debit.gt(0) ? bankTxn.debit : bankTxn.credit,
    direction: bankTxn.credit.gt(0) ? 'IN' : 'OUT',
    dateRange: [addDays(bankTxn.txnDate, -3), addDays(bankTxn.txnDate, 3)],
    bankAccountId: bankTxn.bank_account_id,
  });
  
  return candidates
    .map(c => ({
      type: c.type,  // 'RECEIPT' | 'PAYMENT'
      id: c.id,
      no: c.no,
      counterparty: c.counterparty_name,
      amount: c.amount,
      date: c.date,
      confidence: scoreMatch(bankTxn, c),
    }))
    .sort((a, b) => b.confidence - a.confidence);
}

function scoreMatch(bankTxn, candidate): number {
  let score = 0;
  if (bankTxn.amount.eq(candidate.amount)) score += 0.5;
  const daysDiff = Math.abs(differenceInDays(bankTxn.txnDate, candidate.date));
  score += Math.max(0, 0.3 - daysDiff * 0.1);
  if (bankTxn.description.includes(candidate.counterparty.split(' ')[0])) score += 0.2;
  // ... more heuristics
  return Math.min(score, 1.0);
}
```

Auto-confirm threshold: `confidence >= 0.95`.
Suggest with confirmation: `0.7 <= confidence < 0.95`.
Show as candidate: `0.4 <= confidence < 0.7`.
Don't show: `< 0.4`.

## Summary for Phase 6 Implementation

1. ✅ Define `BankProvider` interface
2. ✅ Implement `MockBankProvider` with deterministic mock data
3. ✅ Bank account CRUD UI
4. ✅ Bank import UI (mock generation + CSV paste)
5. ✅ Bank transaction list per account
6. ✅ Reconciliation page (two-pane workspace)
7. ✅ Auto-match heuristic
8. ✅ Manual match flow
9. ✅ "Create JE from txn" flow
10. ✅ Slip verify in Receipt form (mock)
11. ✅ "Mark as ignored" with audit

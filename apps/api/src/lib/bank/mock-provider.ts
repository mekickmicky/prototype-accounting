import type {
  BankProvider,
  BankTransactionRaw,
  ImportStatementInput,
  SlipVerifyResult,
  VerifySlipInput,
} from './provider';
import { Decimal } from '@wind-acc/shared';

interface MockTxnTemplate {
  type: 'CR' | 'DR';
  desc: string;
  range: [number, number];
  weight: number;
}

// Weights chosen so total CR weight = 60 and total DR weight = 40,
// giving a roughly 60/40 incoming-vs-outgoing mix for the clinic.
const MOCK_TXN_TEMPLATES: MockTxnTemplate[] = [
  { type: 'CR', desc: 'TRF FROM XXX-X-X1234-5 / SOMCHAI J.', range: [3000, 25000], weight: 25 },
  { type: 'CR', desc: 'QR PAYMENT FROM PROMPTPAY', range: [1500, 15000], weight: 25 },
  { type: 'CR', desc: 'CREDIT CARD SETTLEMENT', range: [10000, 80000], weight: 10 },
  { type: 'DR', desc: 'TRF TO XXX-X-X9999-1 / SUPPLIER A LTD.', range: [5000, 50000], weight: 12 },
  { type: 'DR', desc: 'BILL PAYMENT - PEA ELECTRICITY', range: [3000, 12000], weight: 8 },
  { type: 'DR', desc: 'TRF FEE', range: [10, 30], weight: 8 },
  { type: 'DR', desc: 'CHEQUE FEE', range: [50, 100], weight: 4 },
  { type: 'DR', desc: 'TRF TO OWN ACCT XXX-X-X8888', range: [50000, 200000], weight: 8 },
];

const TOTAL_TEMPLATE_WEIGHT = MOCK_TXN_TEMPLATES.reduce((s, t) => s + t.weight, 0);

function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToInt(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ input.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function utcDaysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function formatYyyyMmDd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function pickTemplate(rng: () => number): MockTxnTemplate {
  let r = rng() * TOTAL_TEMPLATE_WEIGHT;
  for (const tpl of MOCK_TXN_TEMPLATES) {
    if (r < tpl.weight) return tpl;
    r -= tpl.weight;
  }
  return MOCK_TXN_TEMPLATES[MOCK_TXN_TEMPLATES.length - 1];
}

export class MockBankProvider implements BankProvider {
  async verifySlip(input: VerifySlipInput): Promise<SlipVerifyResult> {
    if (input.slipRef.startsWith('MOCK-INVALID')) {
      return { verified: false, reason: 'Slip reference not found' };
    }

    if (input.slipRef.startsWith('MOCK-MISMATCH')) {
      const expected = input.expectedAmount ?? new Decimal(0);
      return {
        verified: true,
        details: {
          transRef: input.slipRef,
          transDate: (input.expectedDate ?? new Date()).toISOString(),
          sender: { name: 'Somchai J.', bankShortName: 'KBANK', accountTail: '1234' },
          receiver: { name: 'WIND CLINIC CO., LTD.', bankShortName: 'KBANK', accountTail: '6789' },
          amount: new Decimal(expected).minus(100),
        },
      };
    }

    const rng = makeMulberry32(hashStringToInt(input.slipRef));
    const tail = String(Math.floor(rng() * 10000)).padStart(4, '0');
    const amount = input.expectedAmount
      ? new Decimal(input.expectedAmount)
      : new Decimal(Math.floor(rng() * 50000) + 100);
    return {
      verified: true,
      details: {
        transRef: input.slipRef,
        transDate: (input.expectedDate ?? new Date()).toISOString(),
        sender: { name: 'Somchai J.', bankShortName: 'KBANK', accountTail: tail },
        receiver: { name: 'WIND CLINIC CO., LTD.', bankShortName: 'KBANK', accountTail: '6789' },
        amount,
      },
    };
  }

  async importStatement(input: ImportStatementInput): Promise<BankTransactionRaw[]> {
    const seedKey = `${input.bankAccountCode}|${input.dateFrom.toISOString().slice(0, 10)}`;
    const rng = makeMulberry32(hashStringToInt(seedKey));

    const txns: BankTransactionRaw[] = [];
    const totalDays = utcDaysBetween(input.dateFrom, input.dateTo);
    let runningBalance = new Decimal(500_000);
    let txnSeq = 0;

    for (let i = 0; i <= totalDays; i++) {
      const date = addUtcDays(input.dateFrom, i);
      const dow = date.getUTCDay();
      if (dow === 0 || dow === 6) continue;

      // 1–3 txns per weekday: May 2026 has 21 weekdays, so ~21–63 txns total
      // with the seeded RNG landing in the spec's 30–50 target range.
      const count = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < count; j++) {
        const tpl = pickTemplate(rng);
        const [lo, hi] = tpl.range;
        const amount = new Decimal(lo + Math.floor(rng() * (hi - lo + 1)));
        const debit = tpl.type === 'DR' ? amount : new Decimal(0);
        const credit = tpl.type === 'CR' ? amount : new Decimal(0);
        runningBalance = runningBalance.plus(credit).minus(debit);
        txnSeq++;
        const refSuffix = String(Math.floor(rng() * 1_000_000)).padStart(6, '0');
        txns.push({
          txnDate: new Date(date),
          description: tpl.desc,
          debit,
          credit,
          balance: runningBalance,
          bankRef: `MOCK${formatYyyyMmDd(date)}${String(txnSeq).padStart(4, '0')}${refSuffix}`,
        });
      }
    }

    return txns;
  }

  async getBalance(bankAccountCode: string): Promise<Decimal> {
    const rng = makeMulberry32(hashStringToInt(bankAccountCode));
    const adjustment = Math.floor(rng() * 200_000);
    return new Decimal(500_000).plus(adjustment);
  }
}

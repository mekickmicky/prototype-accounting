import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { aggregatePP30 } from '../lib/tax/pp30-aggregate';
import {
  createDraftPP30,
  flagNonClaimable,
  finalizePP30,
  submitPP30,
  createDraftPND,
  finalizePND,
  submitPND,
} from './tax-filing';

const TEST_PERIOD = '2098-05';
const TEST_TAG = 'PP30_LIFECYCLE_TEST_';
const TEST_USER_EMAIL = 'pp30-lifecycle-test@wind';
let TEST_USER_ID = '';

interface InsertOpts {
  vat_type: 'OUTPUT' | 'INPUT';
  net: string;
  vat: string;
  claimable?: boolean;
  source_id?: string;
}

async function insertVat(opts: InsertOpts) {
  const net = D(opts.net);
  const vat = D(opts.vat);
  const gross = net.plus(vat);
  return prisma.vatRegister.create({
    data: {
      vat_type: opts.vat_type,
      txn_date: new Date(`${TEST_PERIOD}-15`),
      period_code: TEST_PERIOD,
      tax_invoice_no: null,
      counterparty_name: `${TEST_TAG}counterparty`,
      counterparty_tax_id: null,
      net_amount: net.toFixed(2),
      vat_amount: vat.toFixed(2),
      gross_amount: gross.toFixed(2),
      vat_rate: '7.00',
      source_type: `${TEST_TAG}SOURCE`,
      source_id: opts.source_id ?? `${TEST_TAG}${Math.random().toString(36).slice(2)}`,
      claimable: opts.claimable ?? true,
    },
  });
}

async function clearTestRows() {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entity_type: 'TaxFiling' }, { entity_type: 'JournalEntry' }] },
  });
  await prisma.vatRegister.deleteMany({
    where: {
      OR: [
        { counterparty_name: { startsWith: TEST_TAG } },
        { source_type: { startsWith: TEST_TAG } },
        { period_code: TEST_PERIOD },
      ],
    },
  });
  await prisma.withholdingRecord.deleteMany({
    where: { period_code: TEST_PERIOD },
  });
  await prisma.taxFiling.deleteMany({
    where: {
      OR: [
        { period_code: TEST_PERIOD },
        { filing_no: { startsWith: 'PP30-2098-' } },
        { filing_no: { startsWith: 'PND3-2098-' } },
        { filing_no: { startsWith: 'PND53-2098-' } },
      ],
    },
  });
  await prisma.payment.deleteMany({ where: { payment_no: { startsWith: `PAY-${TEST_TAG}` } } });
  await prisma.vendor.deleteMany({ where: { code: { startsWith: TEST_TAG } } });
  // Closing JEs created by submitPP30/submitPND are tagged source_type=ADJUSTMENT
  // and source_id=filing.id; clear by period_code to remove both originals and any
  // future reversals so test runs are idempotent.
  await prisma.journalLine.deleteMany({
    where: { je: { period_code: TEST_PERIOD } },
  });
  await prisma.journalEntry.deleteMany({ where: { period_code: TEST_PERIOD } });
}

async function makeVendor(opts: { vendor_type: 'INDIVIDUAL' | 'JURISTIC'; suffix: string }) {
  return prisma.vendor.create({
    data: {
      code: `${TEST_TAG}V${opts.suffix}`,
      name: `${TEST_TAG}vendor-${opts.suffix}`,
      vendor_type: opts.vendor_type,
      tax_id: `1234567890${opts.suffix.padStart(3, '0')}`,
    },
  });
}

let paymentSeq = 0;
async function makePayment(vendor_id: string) {
  paymentSeq += 1;
  return prisma.payment.create({
    data: {
      payment_no: `PAY-${TEST_TAG}${paymentSeq.toString().padStart(4, '0')}`,
      vendor_id,
      branch_code: 'TL',
      payment_date: new Date(`${TEST_PERIOD}-15`),
      total_amount: '1000.00',
      withholding_total: '0.00',
      net_paid: '1000.00',
      payment_method: 'TRANSFER',
      status: 'DRAFT',
    },
  });
}

let certSeq = 0;
async function insertWHT(opts: {
  vendor_id: string;
  vendor_tax_id?: string | null;
  payment_id: string;
  bill_id?: string | null;
  gross: string;
  rate: string;
  wht_type?: string;
}) {
  certSeq += 1;
  const gross = D(opts.gross);
  const rate = D(opts.rate);
  const wht = gross.times(rate).dividedBy(100);
  return prisma.withholdingRecord.create({
    data: {
      payment_id: opts.payment_id,
      bill_id: opts.bill_id ?? null,
      vendor_id: opts.vendor_id,
      vendor_tax_id: opts.vendor_tax_id ?? null,
      wht_type: opts.wht_type ?? 'PND_3_SERVICE',
      wht_rate: rate.toFixed(2),
      gross_amount: gross.toFixed(2),
      wht_amount: wht.toFixed(2),
      payment_date: new Date(`${TEST_PERIOD}-15`),
      period_code: TEST_PERIOD,
      cert_no: `WHT-${TEST_TAG}${certSeq.toString().padStart(4, '0')}`,
    },
  });
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'PP30 Lifecycle Tester', role: 'ACCOUNTANT' },
  });
  TEST_USER_ID = user.id;
});

beforeEach(async () => {
  await clearTestRows();
});

afterAll(async () => {
  await clearTestRows();
});

describe('createDraftPP30', () => {
  test('snapshots aggregate totals and assigns sequential filing_no', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'INPUT', net: '500', vat: '35' });

    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    expect(filing.status).toBe('DRAFT');
    expect(filing.filing_type).toBe('PP30');
    expect(filing.period_code).toBe(TEST_PERIOD);
    expect(filing.filing_no).toMatch(/^PP30-2098-\d{4}$/);
    expect(D(filing.output_vat.toString()).toFixed(2)).toBe('70.00');
    expect(D(filing.input_vat.toString()).toFixed(2)).toBe('35.00');
    expect(D(filing.vat_payable.toString()).toFixed(2)).toBe('35.00');
  });

  test('DRAFT does not lock register rows; aggregator still includes them', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await createDraftPP30(TEST_PERIOD, TEST_USER_ID);

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('70.00');
    expect(agg.output_rows).toHaveLength(1);
  });
});

describe('flagNonClaimable', () => {
  test('flips claimable=false on input rows and refreshes snapshot', async () => {
    const inA = await insertVat({ vat_type: 'INPUT', net: '500', vat: '35' });
    await insertVat({ vat_type: 'INPUT', net: '300', vat: '21' });
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });

    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    expect(D(filing.input_vat.toString()).toFixed(2)).toBe('56.00');

    const updated = await flagNonClaimable(filing.id, [inA.id], TEST_USER_ID);
    expect(D(updated.input_vat.toString()).toFixed(2)).toBe('21.00');

    const reloaded = await prisma.vatRegister.findUnique({ where: { id: inA.id } });
    expect(reloaded?.claimable).toBe(false);
  });

  test('rejects rows that are not INPUT or wrong period', async () => {
    const out = await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);

    expect(flagNonClaimable(filing.id, [out.id], TEST_USER_ID)).rejects.toThrow();
  });

  test('rejects when filing is not DRAFT (PP30_NOT_DRAFT)', async () => {
    const inA = await insertVat({ vat_type: 'INPUT', net: '500', vat: '35' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    expect(flagNonClaimable(filing.id, [inA.id], TEST_USER_ID)).rejects.toThrow(
      'PP30_NOT_DRAFT',
    );
  });
});

describe('finalizePP30', () => {
  test('locks register rows so subsequent aggregate excludes them', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'INPUT', net: '500', vat: '35' });

    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('0.00');
    expect(agg.input_vat).toBe('0.00');
    expect(agg.output_rows).toHaveLength(0);
    expect(agg.input_rows).toHaveLength(0);
  });

  test('rejects double-finalize (PP30_NOT_DRAFT)', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    expect(finalizePP30(filing.id, TEST_USER_ID)).rejects.toThrow('PP30_NOT_DRAFT');
  });
});

describe('submitPP30', () => {
  test('FINALIZED → SUBMITTED stamps filed_at and filed_by_id', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const submitted = await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-001' },
      TEST_USER_ID,
    );
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.filed_by_id).toBe(TEST_USER_ID);
    expect(submitted.filed_at).not.toBeNull();
  });

  test('rejects submit when status is DRAFT (PP30_NOT_FINALIZED)', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);

    expect(
      submitPP30(
        filing.id,
        { submission_date: '2098-06-10', submission_ref: 'RD-REF-001' },
        TEST_USER_ID,
      ),
    ).rejects.toThrow('PP30_NOT_FINALIZED');
  });

  test('rejects double-submit (PP30_NOT_FINALIZED)', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);
    await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-001' },
      TEST_USER_ID,
    );

    expect(
      submitPP30(
        filing.id,
        { submission_date: '2098-06-11', submission_ref: 'RD-REF-002' },
        TEST_USER_ID,
      ),
    ).rejects.toThrow('PP30_NOT_FINALIZED');
  });

  test('payable case: posts closing JE that zeroes 21110 + 14010 in the period', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'INPUT', net: '300', vat: '21' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const submitted = await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-100' },
      TEST_USER_ID,
    );
    expect(submitted.je_id).not.toBeNull();

    const je = await prisma.journalEntry.findUnique({
      where: { id: submitted.je_id! },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    expect(je).not.toBeNull();
    expect(je!.status).toBe('POSTED');
    expect(je!.source_type).toBe('ADJUSTMENT');
    expect(je!.source_id).toBe(filing.id);
    expect(je!.period_code).toBe(TEST_PERIOD);

    const byAccount = (code: string) => je!.lines.find(l => l.account_code === code);
    expect(D(byAccount('21110')!.debit.toString()).toFixed(2)).toBe('70.00');
    expect(D(byAccount('14010')!.credit.toString()).toFixed(2)).toBe('21.00');
    expect(D(byAccount('11020')!.credit.toString()).toFixed(2)).toBe('49.00');
    expect(byAccount('14020')).toBeUndefined();

    // TB across the period: 21110 + 14010 net to zero (closing JE cancels the
    // running balances accumulated from sales-invoice / bill posts).
    const sumNet = async (code: string) => {
      const rows = await prisma.journalLine.findMany({
        where: { account_code: code, je: { period_code: TEST_PERIOD, status: 'POSTED' } },
        select: { debit: true, credit: true },
      });
      return rows.reduce(
        (acc, r) => acc.plus(D(r.debit.toString())).minus(D(r.credit.toString())),
        D(0),
      );
    };
    expect((await sumNet('21110')).toFixed(2)).toBe('70.00');
    expect((await sumNet('14010')).toFixed(2)).toBe('-21.00');
  });

  test('refund case (input > output): posts Dr VAT Refundable (14020)', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '500', vat: '35' });
    await insertVat({ vat_type: 'INPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const submitted = await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-200' },
      TEST_USER_ID,
    );

    const je = await prisma.journalEntry.findUnique({
      where: { id: submitted.je_id! },
      include: { lines: true },
    });
    const byAccount = (code: string) => je!.lines.find(l => l.account_code === code);
    expect(D(byAccount('21110')!.debit.toString()).toFixed(2)).toBe('35.00');
    expect(D(byAccount('14010')!.credit.toString()).toFixed(2)).toBe('70.00');
    expect(D(byAccount('14020')!.debit.toString()).toFixed(2)).toBe('35.00');
    expect(byAccount('11020')).toBeUndefined();
  });

  test('balanced case (output == input): no cash leg, only the two VAT clears', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'INPUT', net: '1000', vat: '70' });
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const submitted = await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-300' },
      TEST_USER_ID,
    );

    const je = await prisma.journalEntry.findUnique({
      where: { id: submitted.je_id! },
      include: { lines: true },
    });
    expect(je!.lines).toHaveLength(2);
    expect(D(je!.total_debit.toString()).toFixed(2)).toBe('70.00');
    expect(D(je!.total_credit.toString()).toFixed(2)).toBe('70.00');
  });

  test('empty case (no VAT activity): submit succeeds with je_id=null', async () => {
    // Create filing with no VAT register rows — output_vat=0, input_vat=0.
    const filing = await createDraftPP30(TEST_PERIOD, TEST_USER_ID);
    await finalizePP30(filing.id, TEST_USER_ID);

    const submitted = await submitPP30(
      filing.id,
      { submission_date: '2098-06-10', submission_ref: 'RD-REF-400' },
      TEST_USER_ID,
    );
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.je_id).toBeNull();
  });
});

describe('createDraftPND', () => {
  test('PND3 snapshots only INDIVIDUAL vendor totals; PND53 only JURISTIC', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '1' });
    const jur = await makeVendor({ vendor_type: 'JURISTIC', suffix: '2' });
    const pInd = await makePayment(ind.id);
    const pJur = await makePayment(jur.id);
    await insertWHT({ vendor_id: ind.id, payment_id: pInd.id, gross: '10000', rate: '3' });
    await insertWHT({ vendor_id: jur.id, payment_id: pJur.id, gross: '20000', rate: '3' });

    const pnd3 = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    expect(pnd3.status).toBe('DRAFT');
    expect(pnd3.filing_type).toBe('PND3');
    expect(pnd3.filing_no).toMatch(/^PND3-2098-\d{4}$/);
    expect(D(pnd3.withholding_total.toString()).toFixed(2)).toBe('300.00');
    expect(pnd3.recipient_count).toBe(1);

    const pnd53 = await createDraftPND(TEST_PERIOD, 'PND53', TEST_USER_ID);
    expect(pnd53.filing_type).toBe('PND53');
    expect(pnd53.filing_no).toMatch(/^PND53-2098-\d{4}$/);
    expect(D(pnd53.withholding_total.toString()).toFixed(2)).toBe('600.00');
    expect(pnd53.recipient_count).toBe(1);
  });
});

describe('finalizePND', () => {
  test('locks WithholdingRecord rows so a re-draft sees zero', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '3' });
    const p = await makePayment(ind.id);
    await insertWHT({ vendor_id: ind.id, payment_id: p.id, gross: '10000', rate: '3' });

    const draft = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    const finalized = await finalizePND(draft.id, TEST_USER_ID);
    expect(finalized.status).toBe('FINALIZED');

    // Re-drafting after finalize should pick up nothing since records are
    // now linked to the prior filing.
    const next = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    expect(D(next.withholding_total.toString()).toFixed(2)).toBe('0.00');
    expect(next.recipient_count).toBe(0);
  });

  test('rejects double-finalize (PND_NOT_DRAFT)', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '4' });
    const p = await makePayment(ind.id);
    await insertWHT({ vendor_id: ind.id, payment_id: p.id, gross: '10000', rate: '3' });

    const draft = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    await finalizePND(draft.id, TEST_USER_ID);
    expect(finalizePND(draft.id, TEST_USER_ID)).rejects.toThrow('PND_NOT_DRAFT');
  });
});

describe('submitPND', () => {
  test('posts closing JE: Dr 21120 / Cr 11020 for the WHT total', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '5' });
    const p = await makePayment(ind.id);
    await insertWHT({ vendor_id: ind.id, payment_id: p.id, gross: '10000', rate: '3' });

    const draft = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    await finalizePND(draft.id, TEST_USER_ID);
    const submitted = await submitPND(
      draft.id,
      { submission_date: '2098-06-05', submission_ref: 'RD-PND3-001' },
      TEST_USER_ID,
    );
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.je_id).not.toBeNull();

    const je = await prisma.journalEntry.findUnique({
      where: { id: submitted.je_id! },
      include: { lines: true },
    });
    expect(je!.status).toBe('POSTED');
    expect(je!.source_type).toBe('ADJUSTMENT');
    expect(je!.source_id).toBe(draft.id);
    const byAccount = (code: string) => je!.lines.find(l => l.account_code === code);
    expect(D(byAccount('21120')!.debit.toString()).toFixed(2)).toBe('300.00');
    expect(D(byAccount('11020')!.credit.toString()).toFixed(2)).toBe('300.00');
  });

  test('PND3 + PND53 coexist for same period; each clears its own WHT slice', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '6' });
    const jur = await makeVendor({ vendor_type: 'JURISTIC', suffix: '7' });
    const pInd = await makePayment(ind.id);
    const pJur = await makePayment(jur.id);
    await insertWHT({ vendor_id: ind.id, payment_id: pInd.id, gross: '10000', rate: '3' });
    await insertWHT({ vendor_id: jur.id, payment_id: pJur.id, gross: '20000', rate: '3' });

    const pnd3 = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    const pnd53 = await createDraftPND(TEST_PERIOD, 'PND53', TEST_USER_ID);
    await finalizePND(pnd3.id, TEST_USER_ID);
    await finalizePND(pnd53.id, TEST_USER_ID);
    const sub3 = await submitPND(
      pnd3.id,
      { submission_date: '2098-06-05', submission_ref: 'RD-PND3-100' },
      TEST_USER_ID,
    );
    const sub53 = await submitPND(
      pnd53.id,
      { submission_date: '2098-06-05', submission_ref: 'RD-PND53-100' },
      TEST_USER_ID,
    );

    const je3 = await prisma.journalEntry.findUnique({
      where: { id: sub3.je_id! },
      include: { lines: true },
    });
    const je53 = await prisma.journalEntry.findUnique({
      where: { id: sub53.je_id! },
      include: { lines: true },
    });
    expect(D(je3!.total_debit.toString()).toFixed(2)).toBe('300.00');
    expect(D(je53!.total_debit.toString()).toFixed(2)).toBe('600.00');
    expect(je3!.id).not.toBe(je53!.id);
  });

  test('rejects submit when status is DRAFT (PND_NOT_FINALIZED)', async () => {
    const ind = await makeVendor({ vendor_type: 'INDIVIDUAL', suffix: '8' });
    const p = await makePayment(ind.id);
    await insertWHT({ vendor_id: ind.id, payment_id: p.id, gross: '10000', rate: '3' });

    const draft = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    expect(
      submitPND(
        draft.id,
        { submission_date: '2098-06-05', submission_ref: 'RD-PND3-X' },
        TEST_USER_ID,
      ),
    ).rejects.toThrow('PND_NOT_FINALIZED');
  });

  test('empty case: submit succeeds with je_id=null when total is zero', async () => {
    const draft = await createDraftPND(TEST_PERIOD, 'PND3', TEST_USER_ID);
    await finalizePND(draft.id, TEST_USER_ID);
    const submitted = await submitPND(
      draft.id,
      { submission_date: '2098-06-05', submission_ref: 'RD-PND3-EMPTY' },
      TEST_USER_ID,
    );
    expect(submitted.status).toBe('SUBMITTED');
    expect(submitted.je_id).toBeNull();
  });
});

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../prisma';
import { aggregatePP30 } from './pp30-aggregate';

const TEST_PERIOD = '2099-05';
const OTHER_PERIOD = '2099-06';
const TEST_TAG = 'PP30_TEST_';

interface InsertOpts {
  vat_type: 'OUTPUT' | 'INPUT';
  net: string;
  vat: string;
  period?: string;
  claimable?: boolean;
  source_type?: string;
  source_id?: string;
  reversal_of_id?: string | null;
  filing_id?: string | null;
  tax_invoice_no?: string;
}

async function insertVat(opts: InsertOpts) {
  const net = D(opts.net);
  const vat = D(opts.vat);
  const gross = net.plus(vat);
  return prisma.vatRegister.create({
    data: {
      vat_type: opts.vat_type,
      txn_date: new Date(`${opts.period ?? TEST_PERIOD}-15`),
      period_code: opts.period ?? TEST_PERIOD,
      tax_invoice_no: opts.tax_invoice_no ?? null,
      counterparty_name: `${TEST_TAG}counterparty`,
      counterparty_tax_id: null,
      net_amount: net.toFixed(2),
      vat_amount: vat.toFixed(2),
      gross_amount: gross.toFixed(2),
      vat_rate: '7.00',
      source_type: opts.source_type ?? `${TEST_TAG}SOURCE`,
      source_id: opts.source_id ?? `${TEST_TAG}${Math.random().toString(36).slice(2)}`,
      claimable: opts.claimable ?? true,
      reversal_of_id: opts.reversal_of_id ?? null,
      filing_id: opts.filing_id ?? null,
    },
  });
}

async function clearTestRows() {
  await prisma.vatRegister.deleteMany({
    where: {
      OR: [
        { counterparty_name: { startsWith: TEST_TAG } },
        { source_type: { startsWith: TEST_TAG } },
      ],
    },
  });
  await prisma.taxFiling.deleteMany({
    where: { filing_no: { startsWith: TEST_TAG } },
  });
}

beforeEach(async () => {
  await clearTestRows();
});

afterAll(async () => {
  await clearTestRows();
});

describe('aggregatePP30', () => {
  test('matches manual SUM on register rows for the period', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'OUTPUT', net: '500', vat: '35' });
    await insertVat({ vat_type: 'OUTPUT', net: '250', vat: '17.50' });
    await insertVat({ vat_type: 'INPUT', net: '400', vat: '28' });
    await insertVat({ vat_type: 'INPUT', net: '100', vat: '7' });

    const agg = await aggregatePP30(TEST_PERIOD);

    expect(agg.output_vat).toBe('122.50');
    expect(agg.input_vat).toBe('35.00');
    expect(agg.vat_payable).toBe('87.50');
    expect(agg.output_rows).toHaveLength(3);
    expect(agg.input_rows).toHaveLength(2);
    expect(agg.non_claimable_rows).toHaveLength(0);
  });

  test('excludes rows from other periods', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'OUTPUT', net: '999', vat: '69.93', period: OTHER_PERIOD });

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('70.00');
    expect(agg.output_rows).toHaveLength(1);
  });

  test('voided invoice reversal pair nets to zero', async () => {
    const original = await insertVat({
      vat_type: 'OUTPUT',
      net: '1000',
      vat: '70',
      source_type: `${TEST_TAG}INV`,
      source_id: 'inv-1',
    });
    await insertVat({
      vat_type: 'OUTPUT',
      net: '-1000',
      vat: '-70',
      source_type: `${TEST_TAG}INV`,
      source_id: 'inv-1',
      reversal_of_id: original.id,
    });
    await insertVat({ vat_type: 'OUTPUT', net: '500', vat: '35' });

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('35.00');
    expect(agg.vat_payable).toBe('35.00');
    expect(agg.output_rows).toHaveLength(3);
  });

  test('separates claimable and non-claimable INPUT rows', async () => {
    await insertVat({ vat_type: 'INPUT', net: '1000', vat: '70', claimable: true });
    await insertVat({ vat_type: 'INPUT', net: '500', vat: '35', claimable: false });

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.input_vat).toBe('70.00');
    expect(agg.input_rows).toHaveLength(1);
    expect(agg.non_claimable_rows).toHaveLength(1);
    expect(agg.non_claimable_rows[0]!.vat_amount).toBe('35.00');
  });

  test('refund case: input VAT exceeds output VAT (negative payable)', async () => {
    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70' });
    await insertVat({ vat_type: 'INPUT', net: '2000', vat: '140' });

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('70.00');
    expect(agg.input_vat).toBe('140.00');
    expect(agg.vat_payable).toBe('-70.00');
  });

  test('excludes rows linked to a non-DRAFT filing; includes rows linked to DRAFT', async () => {
    const draft = await prisma.taxFiling.create({
      data: {
        filing_no: `${TEST_TAG}DRAFT-1`,
        filing_type: 'PP30',
        period_code: TEST_PERIOD,
        status: 'DRAFT',
      },
    });
    const finalized = await prisma.taxFiling.create({
      data: {
        filing_no: `${TEST_TAG}FIN-1`,
        filing_type: 'PP30',
        period_code: TEST_PERIOD,
        status: 'FINALIZED',
      },
    });

    await insertVat({ vat_type: 'OUTPUT', net: '1000', vat: '70', filing_id: draft.id });
    await insertVat({ vat_type: 'OUTPUT', net: '500', vat: '35', filing_id: finalized.id });
    await insertVat({ vat_type: 'OUTPUT', net: '200', vat: '14' });

    const agg = await aggregatePP30(TEST_PERIOD);
    expect(agg.output_vat).toBe('84.00');
    expect(agg.output_rows).toHaveLength(2);
  });
});

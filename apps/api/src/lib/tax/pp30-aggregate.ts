import type { Prisma, VatType } from '@prisma/client';
import { D, sumD, type Decimal } from '@wind-acc/shared';
import { prisma } from '../prisma';

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export interface VatRegisterRow {
  id: string;
  vat_type: VatType;
  txn_date: string;
  period_code: string;
  tax_invoice_no: string | null;
  counterparty_name: string;
  counterparty_tax_id: string | null;
  net_amount: string;
  vat_amount: string;
  gross_amount: string;
  vat_rate: string;
  source_type: string;
  source_id: string;
  claimable: boolean;
  filing_id: string | null;
  reversal_of_id: string | null;
}

export interface PP30Aggregate {
  period_code: string;
  output_vat: string;
  input_vat: string;
  vat_payable: string;
  output_rows: VatRegisterRow[];
  input_rows: VatRegisterRow[];
  non_claimable_rows: VatRegisterRow[];
}

/**
 * Aggregate VatRegister rows for a single ภพ.30 (PP30) period (spec 03 §4.2).
 *
 * Includes rows whose period_code matches and that are NOT yet locked to a
 * non-DRAFT TaxFiling (filing_id is null, or the linked filing is still
 * DRAFT). Once a PP30 is FINALIZED, its rows have filing_id set and are
 * excluded from subsequent aggregations — that's the lock mechanism.
 *
 * Voided source documents (invoices/bills) keep their original VatRegister row
 * AND insert a negative reversal row pointing back via `reversal_of_id`.
 * Both rows are included here so the SUM nets to zero — voided documents
 * contribute nothing to the filing without any special-case filtering.
 *
 * Output VAT = SUM(vat_amount) of OUTPUT rows (claimable flag is N/A here).
 * Input VAT  = SUM(vat_amount) of INPUT rows where claimable=true.
 * Non-claimable INPUT rows are returned separately for visibility — the user
 * can re-flag them on the draft filing before finalize.
 * VAT Payable = Output VAT − Input VAT (negative ⇒ refundable / carry forward).
 *
 * All arithmetic is Decimal; serialized as fixed(2) strings at the boundary.
 */
export async function aggregatePP30(
  period_code: string,
  client: Db = prisma,
): Promise<PP30Aggregate> {
  const where: Prisma.VatRegisterWhereInput = {
    period_code,
    OR: [{ filing_id: null }, { filing: { status: 'DRAFT' } }],
  };

  const records = await client.vatRegister.findMany({
    where,
    orderBy: [{ txn_date: 'asc' }, { created_at: 'asc' }],
  });

  const rows: VatRegisterRow[] = records.map(r => ({
    id: r.id,
    vat_type: r.vat_type,
    txn_date: r.txn_date.toISOString(),
    period_code: r.period_code,
    tax_invoice_no: r.tax_invoice_no,
    counterparty_name: r.counterparty_name,
    counterparty_tax_id: r.counterparty_tax_id,
    net_amount: D(r.net_amount.toString()).toFixed(2),
    vat_amount: D(r.vat_amount.toString()).toFixed(2),
    gross_amount: D(r.gross_amount.toString()).toFixed(2),
    vat_rate: D(r.vat_rate.toString()).toFixed(2),
    source_type: r.source_type,
    source_id: r.source_id,
    claimable: r.claimable,
    filing_id: r.filing_id,
    reversal_of_id: r.reversal_of_id,
  }));

  const output_rows = rows.filter(r => r.vat_type === 'OUTPUT');
  const input_rows = rows.filter(r => r.vat_type === 'INPUT' && r.claimable);
  const non_claimable_rows = rows.filter(
    r => r.vat_type === 'INPUT' && !r.claimable,
  );

  const outputVat: Decimal = sumD(output_rows.map(r => D(r.vat_amount)));
  const inputVat: Decimal = sumD(input_rows.map(r => D(r.vat_amount)));
  const vatPayable = outputVat.minus(inputVat);

  return {
    period_code,
    output_vat: outputVat.toFixed(2),
    input_vat: inputVat.toFixed(2),
    vat_payable: vatPayable.toFixed(2),
    output_rows,
    input_rows,
    non_claimable_rows,
  };
}

import type { Prisma } from '@prisma/client';
import type { Decimal as DecimalType } from '@wind-acc/shared';
import { createDraft, postInTx } from '../journal-entry';

type Tx = Prisma.TransactionClient;

const SYSTEM_ACTOR_ID = 'SYSTEM';

export interface CommissionAccrualInput {
  doctor_id: string;
  amount: DecimalType;
  branch_code: string;
  date: Date;
  source_ref: string; // visit_id
}

/**
 * Post a commission accrual JE for a single (doctor, visit) pair.
 *
 * Dr 51020 Doctor Commission Expense  amount
 * Cr 21130 Commission Payable         amount
 *
 * The caller is responsible for summing amounts across items when the same
 * doctor appears on multiple items in the same visit before calling this.
 */
export async function postCommissionAccrual(
  tx: Tx,
  input: CommissionAccrualInput,
): Promise<void> {
  const { doctor_id, amount, branch_code, date, source_ref } = input;

  const je = await createDraft(
    tx,
    {
      entry_date: date,
      branch_code,
      description: `Doctor commission accrual: doctor=${doctor_id} visit=${source_ref}`,
      source_type: 'DOCTOR_COMMISSION',
      source_id: `${source_ref}-${doctor_id}`,
      lines: [
        {
          account_code: '51020',
          debit: amount.toFixed(2),
          description: `Commission expense: doctor=${doctor_id}`,
          dim_doctor_id: doctor_id,
        },
        {
          account_code: '21130',
          credit: amount.toFixed(2),
          description: `Commission payable: doctor=${doctor_id}`,
          dim_doctor_id: doctor_id,
        },
      ],
    },
    SYSTEM_ACTOR_ID,
  );

  await postInTx(tx, je.id, SYSTEM_ACTOR_ID);
}

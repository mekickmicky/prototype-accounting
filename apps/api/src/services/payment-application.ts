import type { Prisma } from '@prisma/client';
import { D } from '@wind-acc/shared';

type Tx = Prisma.TransactionClient;

export interface BillApplicationInput {
  bill_id: string;
  applied_amount: string | number;
}

/**
 * Apply payment amounts to bills (T-4.10, mirrors T-3.11 for AR).
 *
 * For each application:
 *  - Row-lock the bill (SELECT ... FOR UPDATE) to prevent concurrent
 *    payments from racing the paid_amount update.
 *  - Increment bill.paid_amount by applied_amount.
 *  - Recompute status based on net_payable (total - withholding_amount):
 *      paid_amount >= net_payable  → PAID
 *      0 < paid_amount < net_payable → PARTIAL_PAID
 *
 * Must be called inside the payment post transaction (T-4.11).
 */
export async function applyToBills(
  tx: Tx,
  payment_id: string,
  applications: BillApplicationInput[],
): Promise<void> {
  for (const app of applications) {
    await tx.$executeRawUnsafe(
      'SELECT 1 FROM bills WHERE id = $1 FOR UPDATE',
      app.bill_id,
    );

    const bill = await tx.bill.findUniqueOrThrow({
      where: { id: app.bill_id },
      select: { paid_amount: true, total: true, withholding_amount: true },
    });

    const newPaid = D(bill.paid_amount.toString()).plus(D(app.applied_amount));
    const netPayable = D(bill.total.toString()).minus(D(bill.withholding_amount.toString()));

    const status = newPaid.gte(netPayable) ? 'PAID' : 'PARTIAL_PAID';

    await tx.bill.update({
      where: { id: app.bill_id },
      data: {
        paid_amount: newPaid.toFixed(2),
        status,
      },
    });
  }
}

/**
 * Reverse all applications belonging to a payment (T-4.10, mirrors T-3.11 for AR).
 *
 * Looks up the payment's applications, then for each:
 *  - Row-lock the bill.
 *  - Decrement bill.paid_amount by applied_amount.
 *  - Recompute status based on net_payable (total - withholding_amount):
 *      paid_amount == 0               → POSTED
 *      0 < paid_amount < net_payable  → PARTIAL_PAID
 *      paid_amount >= net_payable     → PAID  (defensive)
 *
 * Must be called inside the payment void transaction (T-4.12).
 */
export async function unapplyFromBills(
  tx: Tx,
  payment_id: string,
): Promise<void> {
  const apps = await tx.paymentApplication.findMany({
    where: { payment_id },
    select: { bill_id: true, applied_amount: true },
  });

  for (const app of apps) {
    await tx.$executeRawUnsafe(
      'SELECT 1 FROM bills WHERE id = $1 FOR UPDATE',
      app.bill_id,
    );

    const bill = await tx.bill.findUniqueOrThrow({
      where: { id: app.bill_id },
      select: { paid_amount: true, total: true, withholding_amount: true },
    });

    const newPaid = D(bill.paid_amount.toString()).minus(D(app.applied_amount.toString()));
    const netPayable = D(bill.total.toString()).minus(D(bill.withholding_amount.toString()));
    const clamped = newPaid.lt(0) ? D(0) : newPaid;

    let status: 'POSTED' | 'PARTIAL_PAID' | 'PAID';
    if (clamped.eq(0)) {
      status = 'POSTED';
    } else if (clamped.gte(netPayable)) {
      status = 'PAID';
    } else {
      status = 'PARTIAL_PAID';
    }

    await tx.bill.update({
      where: { id: app.bill_id },
      data: {
        paid_amount: clamped.toFixed(2),
        status,
      },
    });
  }
}

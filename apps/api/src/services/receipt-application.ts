import type { Prisma } from '@prisma/client';
import { D } from '@wind-acc/shared';

type Tx = Prisma.TransactionClient;

export interface ApplicationInput {
  invoice_id: string;
  applied_amount: string | number;
}

/**
 * Apply receipt amounts to invoices (T-3.11).
 *
 * For each application:
 *  - Row-lock the invoice (SELECT ... FOR UPDATE) to prevent concurrent
 *    receipts from racing the paid_amount update.
 *  - Increment invoice.paid_amount by applied_amount.
 *  - Recompute status:
 *      paid_amount >= total           → PAID
 *      0 < paid_amount < total        → PARTIAL_PAID
 *
 * Must be called inside the receipt post transaction.
 */
export async function applyToInvoices(
  tx: Tx,
  receipt_id: string,
  applications: ApplicationInput[],
): Promise<void> {
  for (const app of applications) {
    await tx.$executeRawUnsafe(
      'SELECT 1 FROM sales_invoices WHERE id = $1 FOR UPDATE',
      app.invoice_id,
    );

    const invoice = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: app.invoice_id },
      select: { paid_amount: true, total: true },
    });

    const newPaid = D(invoice.paid_amount.toString())
      .plus(D(app.applied_amount));
    const total = D(invoice.total.toString());

    const status = newPaid.gte(total) ? 'PAID' : 'PARTIAL_PAID';

    await tx.salesInvoice.update({
      where: { id: app.invoice_id },
      data: {
        paid_amount: newPaid.toFixed(2),
        status,
      },
    });
  }
}

/**
 * Reverse all applications belonging to a receipt (T-3.11).
 *
 * Looks up the receipt's applications, then for each:
 *  - Row-lock the invoice.
 *  - Decrement invoice.paid_amount by applied_amount.
 *  - Recompute status:
 *      paid_amount == 0               → POSTED
 *      0 < paid_amount < total        → PARTIAL_PAID
 *      paid_amount >= total           → PAID  (unlikely after decrement
 *                                              but defensive)
 *
 * Must be called inside the receipt void transaction.
 */
export async function unapplyFromInvoices(
  tx: Tx,
  receipt_id: string,
): Promise<void> {
  const apps = await tx.receiptApplication.findMany({
    where: { receipt_id },
    select: { invoice_id: true, applied_amount: true },
  });

  for (const app of apps) {
    await tx.$executeRawUnsafe(
      'SELECT 1 FROM sales_invoices WHERE id = $1 FOR UPDATE',
      app.invoice_id,
    );

    const invoice = await tx.salesInvoice.findUniqueOrThrow({
      where: { id: app.invoice_id },
      select: { paid_amount: true, total: true },
    });

    const newPaid = D(invoice.paid_amount.toString())
      .minus(D(app.applied_amount.toString()));
    const total = D(invoice.total.toString());

    const clamped = newPaid.lt(0) ? D(0) : newPaid;

    let status: 'POSTED' | 'PARTIAL_PAID' | 'PAID';
    if (clamped.eq(0)) {
      status = 'POSTED';
    } else if (clamped.gte(total)) {
      status = 'PAID';
    } else {
      status = 'PARTIAL_PAID';
    }

    await tx.salesInvoice.update({
      where: { id: app.invoice_id },
      data: {
        paid_amount: clamped.toFixed(2),
        status,
      },
    });
  }
}

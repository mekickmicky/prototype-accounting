import { type PrismaClient, Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

/**
 * Wraps a webhook handler with idempotency: if (source, key) has been processed
 * before, returns the original result immediately. Otherwise runs fn(), persists
 * the result, and returns it. The unique constraint on WebhookProcessed handles
 * concurrent races — on conflict, re-fetches and returns the original.
 */
export async function withIdempotency<T>(
  tx: TransactionClient,
  source: string,
  key: string,
  fn: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const existing = await tx.webhookProcessed.findUnique({
    where: { source_idempotency_key: { source, idempotency_key: key } },
  });

  if (existing) {
    return { result: existing.result_json as T, replayed: true };
  }

  const result = await fn();

  try {
    await tx.webhookProcessed.create({
      data: {
        source,
        idempotency_key: key,
        result_json: result as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // Race condition: another concurrent request processed the same key
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await tx.webhookProcessed.findUnique({
        where: { source_idempotency_key: { source, idempotency_key: key } },
      });
      return { result: (raced?.result_json ?? result) as T, replayed: true };
    }
    throw err;
  }

  return { result, replayed: false };
}

/**
 * Deletes WebhookProcessed records older than `days` days.
 * Intended to be called from a cron job, not within a transaction.
 */
export async function purgeOldWebhookRecords(
  prismaClient: PrismaClient,
  days = 30,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prismaClient.webhookProcessed.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  return count;
}

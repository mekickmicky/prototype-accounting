import type { Prisma } from '@prisma/client';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'POST'
  | 'VOID'
  | 'DELETE'
  | 'PERIOD_CLOSE'
  | 'PERIOD_REOPEN'
  | 'LOGIN'
  | 'EXPORT'
  | 'IMPORT';

export interface LogAuditEventInput {
  actor_id?: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  before?: object;
  after?: object;
  reason?: string;
}

const MAX_SNAPSHOT_BYTES = 50 * 1024;

function truncateSnapshot(data: object): object {
  const json = JSON.stringify(data);
  if (json.length <= MAX_SNAPSHOT_BYTES) return data;
  return {
    _truncated: true,
    _size: json.length,
    _preview: json.slice(0, MAX_SNAPSHOT_BYTES),
  };
}

export async function logAuditEvent(
  tx: Prisma.TransactionClient,
  input: LogAuditEventInput,
): Promise<void> {
  const { actor_id, action, entity_type, entity_id, before, after, reason } = input;

  let actor_name: string | null = null;
  if (actor_id) {
    const user = await tx.user.findUnique({
      where: { id: actor_id },
      select: { name: true },
    });
    actor_name = user?.name ?? null;
  }

  await tx.auditLog.create({
    data: {
      actor_id: actor_id ?? null,
      actor_name,
      action,
      entity_type,
      entity_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      before_json: before !== undefined ? (truncateSnapshot(before) as any) : null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      after_json: after !== undefined ? (truncateSnapshot(after) as any) : null,
      reason: reason ?? null,
    },
  });
}

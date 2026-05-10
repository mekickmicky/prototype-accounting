/**
 * Converts an actor identifier to a User FK value.
 *
 * System actors like 'SYSTEM' are not real User rows, so passing them
 * directly to a FK column violates the foreign key constraint. This helper
 * returns null for any actor that is not a real DB user ID, so the FK is
 * stored as null while the identity is preserved in audit_name columns.
 */
export function toUserFk(actorId: string | null | undefined): string | null {
  if (!actorId || actorId === 'SYSTEM') return null;
  return actorId;
}

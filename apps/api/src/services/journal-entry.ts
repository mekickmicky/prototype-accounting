import { Prisma } from '@prisma/client';
import type { JESourceType, JournalEntry, JournalLine } from '@prisma/client';
import { D, sumD, type Decimal } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { BusinessRuleError } from '../lib/errors';
import { logAuditEvent } from './audit-log';
import { assertPostable } from './account';
import { assertOpen, derivePeriodCode, ensurePeriodExists } from './period';
import { nextDocNo } from './numbering';

type Tx = Prisma.TransactionClient;

export interface CreateJELineInput {
  account_code: string;
  branch_code?: string;
  debit?: string;
  credit?: string;
  description?: string;
  dim_dept?: string;
  dim_project?: string;
  dim_doctor_id?: string;
}

export interface CreateJEInput {
  entry_date: string | Date;
  branch_code: string;
  description: string;
  source_type: JESourceType;
  source_id?: string;
  lines: CreateJELineInput[];
}

export type JournalEntryWithLines = JournalEntry & { lines: JournalLine[] };

interface ParsedLine {
  account_code: string;
  branch_code: string;
  debit: Decimal;
  credit: Decimal;
  description?: string;
  dim_dept?: string;
  dim_project?: string;
  dim_doctor_id?: string;
}

// je_no is NOT NULL UNIQUE in the DB. Drafts use a placeholder until POST
// (T-2.12) replaces it with the sequential JE-{year}-{NNNN} via numbering.
function makeDraftJeNo(): string {
  return `DRAFT-${crypto.randomUUID()}`;
}

function parseLines(
  lines: CreateJELineInput[],
  headerBranch: string,
): ParsedLine[] {
  return lines.map((l, idx) => {
    const debit = D(l.debit ?? '0');
    const credit = D(l.credit ?? '0');

    if (debit.isNegative() || credit.isNegative()) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        line_index: idx,
        reason: 'amounts_non_negative',
      });
    }

    // §1.2: each line has exactly one of debit OR credit > 0.
    const debitPos = debit.gt(0);
    const creditPos = credit.gt(0);
    if (debitPos === creditPos) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        line_index: idx,
        reason: 'debit_xor_credit',
      });
    }

    return {
      account_code: l.account_code,
      branch_code: l.branch_code ?? headerBranch,
      debit,
      credit,
      description: l.description,
      dim_dept: l.dim_dept,
      dim_project: l.dim_project,
      dim_doctor_id: l.dim_doctor_id,
    };
  });
}

/**
 * Create a DRAFT JournalEntry with validated lines (spec 02 §1, §13).
 *
 * Validates: ≥2 lines, per-line xor(debit, credit) > 0, balanced totals,
 * and that every account_code is postable. Each line's branch_code defaults
 * to the header's. Period is derived from entry_date and auto-created if
 * missing (§2.5); it is NOT checked for OPEN — that happens at POST.
 *
 * Caller must wrap this in `prisma.$transaction` so the JE + lines insert
 * together with whatever else the caller is doing.
 */
export async function createDraft(
  tx: Tx,
  input: CreateJEInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _actor_id: string,
): Promise<JournalEntryWithLines> {
  // §1.3: minimum 2 lines.
  if (input.lines.length < 2) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'min_two_lines',
      line_count: input.lines.length,
    });
  }

  const parsed = parseLines(input.lines, input.branch_code);

  // §1.1: SUM(debit) must equal SUM(credit).
  const totalDebit = sumD(parsed.map(l => l.debit));
  const totalCredit = sumD(parsed.map(l => l.credit));
  if (!totalDebit.eq(totalCredit)) {
    throw new BusinessRuleError('JE_NOT_BALANCED', {
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      difference: totalDebit.minus(totalCredit).toFixed(2),
    });
  }

  // §1.4: every account must exist, be postable, and active.
  for (const l of parsed) {
    await assertPostable(tx, l.account_code);
  }

  const entryDate =
    input.entry_date instanceof Date ? input.entry_date : new Date(input.entry_date);
  const period_code = derivePeriodCode(entryDate);
  await ensurePeriodExists(tx, period_code);

  return tx.journalEntry.create({
    data: {
      je_no: makeDraftJeNo(),
      entry_date: entryDate,
      period_code,
      branch_code: input.branch_code,
      description: input.description,
      source_type: input.source_type,
      source_id: input.source_id ?? null,
      status: 'DRAFT',
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      lines: {
        create: parsed.map((l, i) => ({
          line_no: i + 1,
          account_code: l.account_code,
          branch_code: l.branch_code,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          description: l.description ?? null,
          dim_dept: l.dim_dept ?? null,
          dim_project: l.dim_project ?? null,
          dim_doctor_id: l.dim_doctor_id ?? null,
        })),
      },
    },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });
}

/**
 * Update a DRAFT JournalEntry, replacing its lines wholesale (spec 02 §5.1, §12.1).
 *
 * Enforces:
 * - JE must be DRAFT — throws JE_NOT_DRAFT otherwise
 * - Optimistic lock — throws STALE_RECORD if ifMatchUpdatedAt differs
 * - All createDraft validations rerun on the new lines
 *
 * Caller must wrap this in `prisma.$transaction`.
 */
export async function update(
  tx: Tx,
  id: string,
  input: CreateJEInput,
  actor_id: string,
  ifMatchUpdatedAt: Date | string,
): Promise<JournalEntryWithLines> {
  const je = await tx.journalEntry.findUnique({
    where: { id },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });

  if (!je) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'JournalEntry', id });
  }

  if (je.status !== 'DRAFT') {
    throw new BusinessRuleError('JE_NOT_DRAFT', { id, status: je.status });
  }

  // §12.1: optimistic lock — reject if caller's snapshot is stale
  const matchTs =
    ifMatchUpdatedAt instanceof Date ? ifMatchUpdatedAt : new Date(ifMatchUpdatedAt);
  if (je.updated_at.getTime() !== matchTs.getTime()) {
    throw new BusinessRuleError('STALE_RECORD', {
      id,
      expected: matchTs.toISOString(),
      actual: je.updated_at.toISOString(),
    });
  }

  // Capture before snapshot for AuditLog
  const before = { ...je, lines: je.lines };

  // Re-run createDraft validations on the incoming lines
  if (input.lines.length < 2) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'min_two_lines',
      line_count: input.lines.length,
    });
  }

  const parsed = parseLines(input.lines, input.branch_code);

  const totalDebit = sumD(parsed.map(l => l.debit));
  const totalCredit = sumD(parsed.map(l => l.credit));
  if (!totalDebit.eq(totalCredit)) {
    throw new BusinessRuleError('JE_NOT_BALANCED', {
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      difference: totalDebit.minus(totalCredit).toFixed(2),
    });
  }

  for (const l of parsed) {
    await assertPostable(tx, l.account_code);
  }

  const entryDate =
    input.entry_date instanceof Date ? input.entry_date : new Date(input.entry_date);
  const period_code = derivePeriodCode(entryDate);
  await ensurePeriodExists(tx, period_code);

  // Replace lines wholesale: delete then re-create via update
  await tx.journalLine.deleteMany({ where: { je_id: id } });

  const updated = await tx.journalEntry.update({
    where: { id },
    data: {
      entry_date: entryDate,
      period_code,
      branch_code: input.branch_code,
      description: input.description,
      source_type: input.source_type,
      source_id: input.source_id ?? null,
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      lines: {
        create: parsed.map((l, i) => ({
          line_no: i + 1,
          account_code: l.account_code,
          branch_code: l.branch_code,
          debit: l.debit.toFixed(2),
          credit: l.credit.toFixed(2),
          description: l.description ?? null,
          dim_dept: l.dim_dept ?? null,
          dim_project: l.dim_project ?? null,
          dim_doctor_id: l.dim_doctor_id ?? null,
        })),
      },
    },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });

  await logAuditEvent(tx, {
    actor_id,
    action: 'UPDATE',
    entity_type: 'JournalEntry',
    entity_id: id,
    before,
    after: updated,
  });

  return updated;
}

/**
 * Hard-delete a DRAFT JournalEntry and its lines (spec 02 §5.1).
 *
 * Only DRAFT JEs may be deleted. Cascade-deletes lines first, then the JE
 * itself. Emits AuditLog action=DELETE with the before snapshot.
 *
 * Caller must wrap this in `prisma.$transaction`.
 */
export async function deleteDraft(
  tx: Tx,
  id: string,
  actor_id: string,
): Promise<void> {
  const je = await tx.journalEntry.findUnique({
    where: { id },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });

  if (!je) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'JournalEntry', id });
  }

  if (je.status !== 'DRAFT') {
    throw new BusinessRuleError('JE_NOT_DRAFT', { id, status: je.status });
  }

  const before = { ...je, lines: je.lines };

  await logAuditEvent(tx, {
    actor_id,
    action: 'DELETE',
    entity_type: 'JournalEntry',
    entity_id: id,
    before,
  });

  await tx.journalLine.deleteMany({ where: { je_id: id } });
  await tx.journalEntry.delete({ where: { id } });
}

/**
 * Post a DRAFT JournalEntry within an existing transaction (spec 02 §1, §2.1, §3).
 *
 * Re-validates balance, line xor, and account postability as defense in depth
 * (the DRAFT could have been mutated out-of-band). Derives `period_code` from
 * `entry_date` in Asia/Bangkok TZ and asserts the period is OPEN. Allocates
 * the canonical `je_no` via `nextDocNo` so concurrent posts get sequential
 * numbers without duplicates. Stamps `posted_at` / `posted_by_id` and emits
 * AuditLog action=POST.
 */
export async function postInTx(
  tx: Tx,
  je_id: string,
  actor_id: string,
): Promise<JournalEntryWithLines> {
  const je = await tx.journalEntry.findUnique({
    where: { id: je_id },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });

  if (!je) {
    throw new BusinessRuleError('NOT_FOUND', { entity: 'JournalEntry', id: je_id });
  }

  if (je.status !== 'DRAFT') {
    throw new BusinessRuleError('JE_NOT_DRAFT', { id: je_id, status: je.status });
  }

  // §1.3 defense in depth: minimum 2 lines.
  if (je.lines.length < 2) {
    throw new BusinessRuleError('VALIDATION_ERROR', {
      reason: 'min_two_lines',
      line_count: je.lines.length,
    });
  }

  // §1.2 defense in depth: each line has exactly one of debit XOR credit > 0.
  const debits: Decimal[] = [];
  const credits: Decimal[] = [];
  for (let i = 0; i < je.lines.length; i++) {
    const l = je.lines[i]!;
    const debit = D(l.debit.toString());
    const credit = D(l.credit.toString());

    if (debit.isNegative() || credit.isNegative()) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        line_index: i,
        reason: 'amounts_non_negative',
      });
    }

    const debitPos = debit.gt(0);
    const creditPos = credit.gt(0);
    if (debitPos === creditPos) {
      throw new BusinessRuleError('VALIDATION_ERROR', {
        line_index: i,
        reason: 'debit_xor_credit',
      });
    }

    debits.push(debit);
    credits.push(credit);
  }

  // §1.1 defense in depth: SUM(debit) === SUM(credit).
  const totalDebit = sumD(debits);
  const totalCredit = sumD(credits);
  if (!totalDebit.eq(totalCredit)) {
    throw new BusinessRuleError('JE_NOT_BALANCED', {
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
      difference: totalDebit.minus(totalCredit).toFixed(2),
    });
  }

  // §1.4 defense in depth: every account must still be postable + active.
  for (const l of je.lines) {
    await assertPostable(tx, l.account_code);
  }

  // §2.1: derive period from entry_date and require OPEN status.
  const period_code = derivePeriodCode(je.entry_date);
  await assertOpen(tx, period_code);

  // §3: allocate the next sequential JE number for the entry's calendar year.
  const year = parseInt(period_code.slice(0, 4), 10);
  const je_no = await nextDocNo(tx, 'JE', year, 'journal_entries', 'je_no');

  const posted = await tx.journalEntry.update({
    where: { id: je_id },
    data: {
      je_no,
      period_code,
      status: 'POSTED',
      posted_at: new Date(),
      posted_by_id: actor_id,
      total_debit: totalDebit.toFixed(2),
      total_credit: totalCredit.toFixed(2),
    },
    include: { lines: { orderBy: { line_no: 'asc' } } },
  });

  await logAuditEvent(tx, {
    actor_id,
    action: 'POST',
    entity_type: 'JournalEntry',
    entity_id: je_id,
    after: posted,
  });

  return posted;
}

/**
 * Post a DRAFT JournalEntry, opening its own `prisma.$transaction`.
 * Thin wrapper around `postInTx` for callers that don't already own a tx.
 */
export async function post(
  je_id: string,
  actor_id: string,
): Promise<JournalEntryWithLines> {
  return prisma.$transaction(tx => postInTx(tx, je_id, actor_id));
}

/**
 * Void a POSTED JournalEntry by creating a reversing JE (spec 02 §5.2, §5.4).
 *
 * Owns its own `prisma.$transaction`. Steps:
 * 1. Load the original; reject if not POSTED (`JE_NOT_POSTED`) or already VOID
 *    (`ALREADY_VOIDED`).
 * 2. Assert the original's period is OPEN (§5.4 — cannot void into a closed
 *    period); throws `PERIOD_NOT_OPEN` otherwise.
 * 3. Insert the reversing JE as DRAFT: same entry_date, branch, lines (with
 *    debit↔credit swapped), `source_type='REVERSAL'`, `reversal_of_id` pointing
 *    at the original, description prefixed `VOID of {je_no}: {reason}`.
 * 4. Post the reversing JE via `postInTx` so it gets a fresh `je_no` and
 *    becomes POSTED — both originals and reversals stay POSTED forever; only
 *    the original's status flips to VOID.
 * 5. Update original: status=VOID, voided_at, voided_by_id, void_reason.
 * 6. Emit AuditLog action=VOID with `after_json` carrying the link to the
 *    reversal JE.
 *
 * Bidirectional linkage uses the schema's `JEReversal` relation: setting
 * `reversal_of_id` on the new JE makes the original navigable as `reversed_by`.
 *
 * Named `voidEntry` because `void` is a TypeScript reserved word.
 */
export async function voidEntry(
  je_id: string,
  actor_id: string,
  reason: string,
): Promise<{ original: JournalEntryWithLines; reversal: JournalEntryWithLines }> {
  return prisma.$transaction(async tx => {
    const original = await tx.journalEntry.findUnique({
      where: { id: je_id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    if (!original) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'JournalEntry', id: je_id });
    }

    // Check VOID before POSTED so a second void on a voided JE returns the
    // semantically correct ALREADY_VOIDED rather than JE_NOT_POSTED.
    if (original.status === 'VOID') {
      throw new BusinessRuleError('ALREADY_VOIDED', { id: je_id });
    }

    if (original.status !== 'POSTED') {
      throw new BusinessRuleError('JE_NOT_POSTED', { id: je_id, status: original.status });
    }

    // §5.4: cannot void into a closed period.
    await assertOpen(tx, original.period_code);

    const reversalDraft = await tx.journalEntry.create({
      data: {
        je_no: makeDraftJeNo(),
        entry_date: original.entry_date,
        period_code: original.period_code,
        branch_code: original.branch_code,
        description: `VOID of ${original.je_no}: ${reason}`,
        source_type: 'REVERSAL',
        status: 'DRAFT',
        reversal_of_id: original.id,
        total_debit: original.total_credit,
        total_credit: original.total_debit,
        lines: {
          create: original.lines.map(l => ({
            line_no: l.line_no,
            account_code: l.account_code,
            branch_code: l.branch_code,
            // Swap debit ↔ credit so SUM(orig + reversal) == 0 per account.
            debit: l.credit,
            credit: l.debit,
            description: l.description,
            dim_dept: l.dim_dept,
            dim_project: l.dim_project,
            dim_doctor_id: l.dim_doctor_id,
          })),
        },
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    const reversal = await postInTx(tx, reversalDraft.id, actor_id);

    const voided = await tx.journalEntry.update({
      where: { id: je_id },
      data: {
        status: 'VOID',
        voided_at: new Date(),
        voided_by_id: actor_id,
        void_reason: reason,
      },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });

    await logAuditEvent(tx, {
      actor_id,
      action: 'VOID',
      entity_type: 'JournalEntry',
      entity_id: je_id,
      before: original,
      after: {
        ...voided,
        reversed_by_id: reversal.id,
        reversed_by_je_no: reversal.je_no,
      },
      reason,
    });

    return { original: voided, reversal };
  });
}

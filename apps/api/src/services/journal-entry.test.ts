import { describe, test, expect, beforeAll, afterEach } from 'bun:test';
import { D } from '@wind-acc/shared';
import { prisma } from '../lib/prisma';
import { createDraft, post, voidEntry } from './journal-entry';

const TEST_PERIOD = '2099-04';
const TEST_BRANCH = 'TL';
const ACTOR = 'test-actor';

const TEST_USER_EMAIL = 'je-post-test@wind';
let TEST_USER_ID = '';

async function pickPostable(): Promise<string> {
  const a = await prisma.account.findFirst({
    where: { is_postable: true, is_active: true },
    select: { code: true },
  });
  if (!a) throw new Error('no postable account — run db:seed first');
  return a.code;
}

async function pickHeader(): Promise<string> {
  const a = await prisma.account.findFirst({
    where: { is_postable: false },
    select: { code: true },
  });
  if (!a) throw new Error('no header account — run db:seed first');
  return a.code;
}

async function clearTestRows(): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: { entity_type: 'JournalEntry', actor_id: TEST_USER_ID || undefined },
  });
  await prisma.journalLine.deleteMany({
    where: { je: { period_code: TEST_PERIOD } },
  });
  await prisma.journalEntry.deleteMany({
    where: { period_code: TEST_PERIOD },
  });
  await prisma.journalLine.deleteMany({
    where: { je: { je_no: { startsWith: 'JE-2099-' } } },
  });
  await prisma.journalEntry.deleteMany({
    where: { je_no: { startsWith: 'JE-2099-' } },
  });
}

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: 'JE Post Tester', role: 'ACCOUNTANT' },
  });
  TEST_USER_ID = user.id;
  await clearTestRows();
});

afterEach(async () => {
  await clearTestRows();
});

describe('createDraft', () => {
  test('persists a balanced 2-line draft with placeholder je_no', async () => {
    const acc = await pickPostable();
    const je = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-15`,
          branch_code: TEST_BRANCH,
          description: 'balanced draft',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '100.00' },
            { account_code: acc, credit: '100.00' },
          ],
        },
        ACTOR,
      ),
    );

    expect(je.status).toBe('DRAFT');
    expect(je.je_no).toMatch(/^DRAFT-/);
    expect(je.period_code).toBe(TEST_PERIOD);
    expect(je.branch_code).toBe(TEST_BRANCH);
    expect(D(je.total_debit.toString()).eq(D('100.00'))).toBe(true);
    expect(D(je.total_credit.toString()).eq(D('100.00'))).toBe(true);
    expect(je.lines).toHaveLength(2);
    expect(je.lines[0]!.line_no).toBe(1);
    expect(je.lines[1]!.line_no).toBe(2);
  });

  test('throws JE_NOT_BALANCED when totals do not match', async () => {
    const acc = await pickPostable();
    await expect(
      prisma.$transaction(tx =>
        createDraft(
          tx,
          {
            entry_date: `${TEST_PERIOD}-15`,
            branch_code: TEST_BRANCH,
            description: 'unbalanced',
            source_type: 'MANUAL',
            lines: [
              { account_code: acc, debit: '100.00' },
              { account_code: acc, credit: '90.00' },
            ],
          },
          ACTOR,
        ),
      ),
    ).rejects.toMatchObject({ code: 'JE_NOT_BALANCED' });
  });

  test('throws ACCOUNT_NOT_POSTABLE when a line targets a header account', async () => {
    const postable = await pickPostable();
    const header = await pickHeader();
    await expect(
      prisma.$transaction(tx =>
        createDraft(
          tx,
          {
            entry_date: `${TEST_PERIOD}-15`,
            branch_code: TEST_BRANCH,
            description: 'header line',
            source_type: 'MANUAL',
            lines: [
              { account_code: header, debit: '50.00' },
              { account_code: postable, credit: '50.00' },
            ],
          },
          ACTOR,
        ),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_NOT_POSTABLE' });
  });

  test('rejects a line where debit and credit are both > 0', async () => {
    const acc = await pickPostable();
    await expect(
      prisma.$transaction(tx =>
        createDraft(
          tx,
          {
            entry_date: `${TEST_PERIOD}-15`,
            branch_code: TEST_BRANCH,
            description: 'xor violation',
            source_type: 'MANUAL',
            lines: [
              { account_code: acc, debit: '50.00', credit: '50.00' },
              { account_code: acc, credit: '50.00' },
            ],
          },
          ACTOR,
        ),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('rejects a line where both debit and credit are zero', async () => {
    const acc = await pickPostable();
    await expect(
      prisma.$transaction(tx =>
        createDraft(
          tx,
          {
            entry_date: `${TEST_PERIOD}-15`,
            branch_code: TEST_BRANCH,
            description: 'empty line',
            source_type: 'MANUAL',
            lines: [
              { account_code: acc, debit: '0', credit: '0' },
              { account_code: acc, credit: '10.00' },
            ],
          },
          ACTOR,
        ),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('rejects fewer than 2 lines (§1.3)', async () => {
    const acc = await pickPostable();
    await expect(
      prisma.$transaction(tx =>
        createDraft(
          tx,
          {
            entry_date: `${TEST_PERIOD}-15`,
            branch_code: TEST_BRANCH,
            description: 'single line',
            source_type: 'MANUAL',
            lines: [{ account_code: acc, debit: '10.00' }],
          },
          ACTOR,
        ),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  test('defaults each line.branch_code to the header branch_code (§7)', async () => {
    const acc = await pickPostable();
    const je = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-15`,
          branch_code: TEST_BRANCH,
          description: 'branch default',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '10.00' },
            { account_code: acc, credit: '10.00' },
          ],
        },
        ACTOR,
      ),
    );
    for (const l of je.lines) {
      expect(l.branch_code).toBe(TEST_BRANCH);
    }
  });

  test('honors per-line branch_code override', async () => {
    const acc = await pickPostable();
    const je = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-15`,
          branch_code: TEST_BRANCH,
          description: 'branch override',
          source_type: 'BANK_TRANSFER',
          lines: [
            { account_code: acc, debit: '10.00', branch_code: 'EK' },
            { account_code: acc, credit: '10.00', branch_code: TEST_BRANCH },
          ],
        },
        ACTOR,
      ),
    );
    expect(je.lines[0]!.branch_code).toBe('EK');
    expect(je.lines[1]!.branch_code).toBe(TEST_BRANCH);
  });

  test('derives period_code from entry_date in Asia/Bangkok TZ', async () => {
    const acc = await pickPostable();
    // 2099-03-31 17:30 UTC = 2099-04-01 00:30 in Bangkok (UTC+7)
    const je = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: new Date('2099-03-31T17:30:00Z'),
          branch_code: TEST_BRANCH,
          description: 'tz boundary',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '1.00' },
            { account_code: acc, credit: '1.00' },
          ],
        },
        ACTOR,
      ),
    );
    expect(je.period_code).toBe(TEST_PERIOD);
  });
});

describe('post', () => {
  async function makeDraft(opts: {
    entry_date?: string;
    period_code?: string;
  } = {}): Promise<string> {
    const acc = await pickPostable();
    const period = opts.period_code ?? TEST_PERIOD;
    const je = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: opts.entry_date ?? `${period}-15`,
          branch_code: TEST_BRANCH,
          description: 'post test',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '50.00' },
            { account_code: acc, credit: '50.00' },
          ],
        },
        TEST_USER_ID,
      ),
    );
    return je.id;
  }

  test('transitions DRAFT → POSTED with je_no, posted_at, posted_by_id, and audit row', async () => {
    const id = await makeDraft();
    const before = Date.now();

    const posted = await post(id, TEST_USER_ID);

    expect(posted.status).toBe('POSTED');
    expect(posted.je_no).toMatch(/^JE-2099-\d{4}$/);
    expect(posted.posted_at).toBeInstanceOf(Date);
    expect(posted.posted_at!.getTime()).toBeGreaterThanOrEqual(before);
    expect(posted.posted_by_id).toBe(TEST_USER_ID);
    expect(D(posted.total_debit.toString()).eq(D('50.00'))).toBe(true);
    expect(D(posted.total_credit.toString()).eq(D('50.00'))).toBe(true);

    const audit = await prisma.auditLog.findMany({
      where: { entity_type: 'JournalEntry', entity_id: id, action: 'POST' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_id).toBe(TEST_USER_ID);
    expect(audit[0]!.before_json).toBeNull();
    expect(audit[0]!.after_json).not.toBeNull();
  });

  test('rejects non-DRAFT JE with JE_NOT_DRAFT', async () => {
    const id = await makeDraft();
    await post(id, TEST_USER_ID);

    await expect(post(id, TEST_USER_ID)).rejects.toMatchObject({ code: 'JE_NOT_DRAFT' });
  });

  test('rejects unknown id with NOT_FOUND', async () => {
    await expect(post('does-not-exist', TEST_USER_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('rejects post into a CLOSED period with PERIOD_NOT_OPEN', async () => {
    const id = await makeDraft();
    await prisma.fiscalPeriod.update({
      where: { code: TEST_PERIOD },
      data: { status: 'CLOSED' },
    });
    try {
      await expect(post(id, TEST_USER_ID)).rejects.toMatchObject({
        code: 'PERIOD_NOT_OPEN',
      });
    } finally {
      await prisma.fiscalPeriod.update({
        where: { code: TEST_PERIOD },
        data: { status: 'OPEN' },
      });
    }
  });

  test('concurrent post of 5 JEs in same year produces sequential numbers', async () => {
    const ids = await Promise.all([
      makeDraft(),
      makeDraft(),
      makeDraft(),
      makeDraft(),
      makeDraft(),
    ]);

    const posted = await Promise.all(ids.map(id => post(id, TEST_USER_ID)));

    const numbers = posted.map(je => je.je_no).sort();
    const uniq = new Set(numbers);
    expect(uniq.size).toBe(5);

    const seqs = numbers.map(n => parseInt(n.split('-')[2]!, 10));
    seqs.sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]! - seqs[i - 1]!).toBe(1);
    }
  });

  test('rejects mutated DRAFT with unbalanced totals (defense in depth)', async () => {
    const id = await makeDraft();
    // Tamper with one line to break balance, simulating out-of-band mutation.
    const firstLine = await prisma.journalLine.findFirst({
      where: { je_id: id, debit: { gt: 0 } },
    });
    await prisma.journalLine.update({
      where: { id: firstLine!.id },
      data: { debit: '99.00' },
    });

    await expect(post(id, TEST_USER_ID)).rejects.toMatchObject({ code: 'JE_NOT_BALANCED' });
  });
});

describe('voidEntry', () => {
  async function makeAndPost(): Promise<{ id: string; je_no: string }> {
    const acc = await pickPostable();
    const draft = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-15`,
          branch_code: TEST_BRANCH,
          description: 'void test',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '75.00' },
            { account_code: acc, credit: '75.00' },
          ],
        },
        TEST_USER_ID,
      ),
    );
    const posted = await post(draft.id, TEST_USER_ID);
    return { id: posted.id, je_no: posted.je_no };
  }

  test('produces a POSTED reversal that exactly cancels the original', async () => {
    const { id } = await makeAndPost();

    const { original, reversal } = await voidEntry(id, TEST_USER_ID, 'wrong amount');

    expect(original.status).toBe('VOID');
    expect(original.voided_at).toBeInstanceOf(Date);
    expect(original.voided_by_id).toBe(TEST_USER_ID);
    expect(original.void_reason).toBe('wrong amount');

    expect(reversal.status).toBe('POSTED');
    expect(reversal.je_no).toMatch(/^JE-2099-\d{4}$/);
    expect(reversal.je_no).not.toBe(original.je_no);
    expect(reversal.source_type).toBe('REVERSAL');
    expect(reversal.description).toBe(`VOID of ${original.je_no}: wrong amount`);
    expect(reversal.reversal_of_id).toBe(original.id);

    // Lines: debit ↔ credit swapped per line, so net effect is zero.
    expect(reversal.lines).toHaveLength(original.lines.length);
    for (let i = 0; i < original.lines.length; i++) {
      const o = original.lines[i]!;
      const r = reversal.lines[i]!;
      expect(r.account_code).toBe(o.account_code);
      expect(r.line_no).toBe(o.line_no);
      expect(D(r.debit.toString()).eq(D(o.credit.toString()))).toBe(true);
      expect(D(r.credit.toString()).eq(D(o.debit.toString()))).toBe(true);
    }

    // Net account movement (orig + reversal) is zero per side ⇒ TB unaffected.
    const netDebit = D(original.total_debit.toString()).plus(
      D(reversal.total_debit.toString()),
    );
    const netCredit = D(original.total_credit.toString()).plus(
      D(reversal.total_credit.toString()),
    );
    expect(netDebit.eq(netCredit)).toBe(true);
  });

  test('links original ↔ reversal bidirectionally via JEReversal relation', async () => {
    const { id } = await makeAndPost();
    const { reversal } = await voidEntry(id, TEST_USER_ID, 'link check');

    const reloadedOriginal = await prisma.journalEntry.findUnique({
      where: { id },
      include: { reversed_by: true },
    });
    expect(reloadedOriginal!.reversed_by?.id).toBe(reversal.id);

    const reloadedReversal = await prisma.journalEntry.findUnique({
      where: { id: reversal.id },
      include: { reversal_of: true },
    });
    expect(reloadedReversal!.reversal_of?.id).toBe(id);
  });

  test('writes one AuditLog row with action=VOID, before/after, and reason', async () => {
    const { id } = await makeAndPost();
    await voidEntry(id, TEST_USER_ID, 'audit check');

    const audit = await prisma.auditLog.findMany({
      where: { entity_type: 'JournalEntry', entity_id: id, action: 'VOID' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actor_id).toBe(TEST_USER_ID);
    expect(audit[0]!.reason).toBe('audit check');
    expect(audit[0]!.before_json).not.toBeNull();
    expect(audit[0]!.after_json).not.toBeNull();
    const after = audit[0]!.after_json as Record<string, unknown>;
    expect(after.reversed_by_id).toBeTruthy();
    expect(after.reversed_by_je_no).toMatch(/^JE-2099-\d{4}$/);
  });

  test('voiding twice returns ALREADY_VOIDED', async () => {
    const { id } = await makeAndPost();
    await voidEntry(id, TEST_USER_ID, 'first void');

    await expect(voidEntry(id, TEST_USER_ID, 'second void')).rejects.toMatchObject({
      code: 'ALREADY_VOIDED',
    });
  });

  test('rejects voiding a DRAFT JE with JE_NOT_POSTED', async () => {
    const acc = await pickPostable();
    const draft = await prisma.$transaction(tx =>
      createDraft(
        tx,
        {
          entry_date: `${TEST_PERIOD}-15`,
          branch_code: TEST_BRANCH,
          description: 'still draft',
          source_type: 'MANUAL',
          lines: [
            { account_code: acc, debit: '10.00' },
            { account_code: acc, credit: '10.00' },
          ],
        },
        TEST_USER_ID,
      ),
    );

    await expect(voidEntry(draft.id, TEST_USER_ID, 'nope')).rejects.toMatchObject({
      code: 'JE_NOT_POSTED',
    });
  });

  test('rejects voiding into a CLOSED period with PERIOD_NOT_OPEN (§5.4)', async () => {
    const { id } = await makeAndPost();
    await prisma.fiscalPeriod.update({
      where: { code: TEST_PERIOD },
      data: { status: 'CLOSED' },
    });
    try {
      await expect(voidEntry(id, TEST_USER_ID, 'closed')).rejects.toMatchObject({
        code: 'PERIOD_NOT_OPEN',
      });
    } finally {
      await prisma.fiscalPeriod.update({
        where: { code: TEST_PERIOD },
        data: { status: 'OPEN' },
      });
    }
  });

  test('rejects unknown id with NOT_FOUND', async () => {
    await expect(
      voidEntry('does-not-exist', TEST_USER_ID, 'missing'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

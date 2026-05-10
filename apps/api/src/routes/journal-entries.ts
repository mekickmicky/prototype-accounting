import { Elysia } from 'elysia';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authGuard } from '../middleware/auth-guard';
import { BusinessRuleError } from '../lib/errors';
import { createDraft, update, deleteDraft, post, voidEntry } from '../services/journal-entry';
import { ListJEsQuery, CreateJEBody, UpdateJEBody, VoidJEBody } from '@wind-acc/shared';

const SORTABLE_FIELDS = new Set([
  'entry_date',
  'je_no',
  'created_at',
  'total_debit',
  'period_code',
]);

function buildOrderBy(sort?: string): Prisma.JournalEntryOrderByWithRelationInput {
  if (!sort) return { entry_date: 'desc' };
  const [field, dir] = sort.split(':');
  if (field && SORTABLE_FIELDS.has(field) && (dir === 'asc' || dir === 'desc')) {
    return { [field]: dir as 'asc' | 'desc' };
  }
  return { entry_date: 'desc' };
}

export const journalEntryRoutes = new Elysia({ prefix: '/journal-entries' })
  .use(authGuard)

  // GET /journal-entries — paginated list, no lines in response
  .get('', async ({ query }) => {
    const parsed = ListJEsQuery.safeParse(query);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const {
      period,
      branch,
      status,
      source_type,
      q,
      date_from,
      date_to,
      account,
      page,
      page_size,
      sort,
    } = parsed.data;

    const where: Prisma.JournalEntryWhereInput = {};

    if (period) where.period_code = period;
    if (branch) where.branch_code = branch;
    if (status) where.status = status;
    if (source_type) where.source_type = source_type;

    if (date_from || date_to) {
      where.entry_date = {
        ...(date_from ? { gte: new Date(date_from) } : {}),
        ...(date_to ? { lte: new Date(date_to) } : {}),
      };
    }

    // q searches description, je_no, and source_id (external reference)
    if (q) {
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { je_no: { contains: q, mode: 'insensitive' } },
        { source_id: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (account) {
      where.lines = { some: { account_code: account } };
    }

    const skip = (page - 1) * page_size;
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip,
        take: page_size,
        orderBy: buildOrderBy(sort),
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return {
      success: true as const,
      data: entries,
      meta: { total, page, page_size },
    };
  })

  // GET /journal-entries/:id — full with lines
  .get('/:id', async ({ params }) => {
    const je = await prisma.journalEntry.findUnique({
      where: { id: params.id },
      include: { lines: { orderBy: { line_no: 'asc' } } },
    });
    if (!je) {
      throw new BusinessRuleError('NOT_FOUND', { entity: 'JournalEntry', id: params.id });
    }
    return { success: true as const, data: je };
  })

  // POST /journal-entries — create DRAFT
  .post('', async ({ user, body, set }) => {
    if (user.role === 'VIEWER') {
      throw new BusinessRuleError('FORBIDDEN', { required_roles: ['ADMIN', 'ACCOUNTANT'] });
    }
    const parsed = CreateJEBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const je = await prisma.$transaction(tx => createDraft(tx, parsed.data, user.user_id));
    set.status = 201;
    return { success: true as const, data: je };
  })

  // PATCH /journal-entries/:id — update DRAFT only
  // Requires If-Match header with the last known updated_at for optimistic locking
  .patch('/:id', async ({ user, params, body, request }) => {
    const parsed = UpdateJEBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const ifMatch = request.headers.get('if-match');
    if (!ifMatch) {
      throw new BusinessRuleError('VALIDATION_ERROR', { reason: 'if_match_header_required' });
    }
    const je = await prisma.$transaction(tx =>
      update(tx, params.id, parsed.data, user.user_id, ifMatch),
    );
    return { success: true as const, data: je };
  })

  // POST /journal-entries/:id/post — DRAFT → POSTED
  .post('/:id/post', async ({ user, params }) => {
    const je = await post(params.id, user.user_id);
    return { success: true as const, data: je };
  })

  // POST /journal-entries/:id/void — create reversing JE
  .post('/:id/void', async ({ user, params, body }) => {
    const parsed = VoidJEBody.safeParse(body);
    if (!parsed.success) {
      throw new BusinessRuleError('VALIDATION_ERROR', { issues: parsed.error.issues });
    }
    const result = await voidEntry(params.id, user.user_id, parsed.data.reason);
    return { success: true as const, data: result };
  })

  // DELETE /journal-entries/:id — DRAFT only, 204 No Content
  .delete('/:id', async ({ user, params, set }) => {
    await prisma.$transaction(tx => deleteDraft(tx, params.id, user.user_id));
    set.status = 204;
  });

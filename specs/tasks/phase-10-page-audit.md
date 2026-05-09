# Phase 10 — Page Audit

**Goal:** Read-only audit of all 61 frontend pages. Workers identify issues with root causes. No code changes.
**Reads:** specs/05-api-contracts.md, specs/06-ui-design-system.md, specs/04-modules.md, CLAUDE.md
**Acceptance:** All three `docs/audit/issues-group-*.md` files exist and contain a section for every assigned page.

## Conventions

- **Language:** All generated output must be written in **English**.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md`.

## CRITICAL: Read-Only Rule

Workers MUST NOT edit any source file in `apps/` or `packages/`. The ONLY file each worker may write is its designated output file in `docs/audit/`. Violation of this rule corrupts the codebase.

## Audit Checklist

For each page, check all of the following and document every issue found with a clear root cause:

1. **TypeScript safety** — prop type errors, missing null guards, bad optional chaining, `as any` casts
2. **Money handling** — `parseFloat()`, `Number()`, or raw JS `number` arithmetic on monetary amounts (must use `Decimal.js`). Rule from CLAUDE.md: "Never `parseFloat`. Never `number`."
3. **API endpoint alignment** — does `fetch(...)` call the correct path from `specs/05-api-contracts.md`? Correct HTTP method and payload shape?
4. **Suspense boundary** — any component calling `useSearchParams()` must be wrapped in `<Suspense>` (Next.js 15 requirement). Missing wrapper = runtime error.
5. **Loading state** — every async fetch needs a visible loading indicator (spinner or skeleton)
6. **Error state** — every fetch failure needs user-visible error display
7. **Empty state** — list/table pages need an empty state row or component when data is []
8. **Form validation** — new/edit forms must show field-level validation errors, not silently fail
9. **UI completeness** — obviously stub content ("TODO", hardcoded test data, missing sections vs spec)
10. **Import correctness** — missing imports, circular imports, wrong import paths

## Output Format

Each worker writes a markdown file. Use this structure:

```markdown
# Page Audit — Group [A/B/C]
_Audited: {date}_

## [route path] — [page.tsx path]

- **Issue**: [short title] — [detailed root cause]
- **Issue**: ...

_No issues found._ (if clean)

---
```

Use the URL route as the H2 heading (e.g., `## /gl/accounts` or `## /login`).
List every issue as a bullet. Be specific: quote the offending line or pattern.
Write "No issues found." only when truly clean after checking all 10 categories.

## Dependency Graph

```
T-10.1, T-10.2, T-10.3 — all independent, run in parallel
```

---

## Tasks

### T-10.1 — Page Audit: Group A — Root + GL + AR (21 pages)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/audit/issues-group-a.md`
- **Reads:**
  `apps/web/src/app/page.tsx`,
  `apps/web/src/app/login/page.tsx`,
  `apps/web/src/app/dev/components/page.tsx`,
  `apps/web/src/app/(authenticated)/dashboard/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/dashboard/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/accounts/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/accounts/[code]/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/journal-entries/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/journal-entries/new/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/journal-entries/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/gl/periods/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/dashboard/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/customers/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/customers/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/customers/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/invoices/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/invoices/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/invoices/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/receipts/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/receipts/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ar/receipts/[id]/page.tsx`
- **Spec:**
  Read every file listed in **Reads** above using the Read tool. For each file, apply the 10-category audit checklist defined in the "Audit Checklist" section of this spec. Write all findings to `docs/audit/issues-group-a.md` using the output format defined in the "Output Format" section. DO NOT edit any source file — only write to `docs/audit/issues-group-a.md`.
- **Depends on:** —
- **Blocks:** —
- **Done when:** `docs/audit/issues-group-a.md` exists and contains exactly 21 H2 sections (one per page), each with at least one bullet or "No issues found."
- **Budget USD:** 3.00
- **Timeout Min:** 50

---

### T-10.2 — Page Audit: Group B — AP + Bank + Tax pp30/pnd3 (21 pages)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/audit/issues-group-b.md`
- **Reads:**
  `apps/web/src/app/(authenticated)/ap/dashboard/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/vendors/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/vendors/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/vendors/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/bills/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/bills/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/bills/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/payments/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/payments/new/page.tsx`,
  `apps/web/src/app/(authenticated)/ap/payments/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/bank/accounts/page.tsx`,
  `apps/web/src/app/(authenticated)/bank/accounts/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/bank/import/page.tsx`,
  `apps/web/src/app/(authenticated)/bank/reconcile/[account_id]/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/dashboard/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pp30/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pp30/new/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pp30/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pnd3/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pnd3/new/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pnd3/[id]/page.tsx`
- **Spec:**
  Read every file listed in **Reads** above using the Read tool. For each file, apply the 10-category audit checklist defined in the "Audit Checklist" section of this spec. Write all findings to `docs/audit/issues-group-b.md` using the output format defined in the "Output Format" section. DO NOT edit any source file — only write to `docs/audit/issues-group-b.md`.
- **Depends on:** —
- **Blocks:** —
- **Done when:** `docs/audit/issues-group-b.md` exists and contains exactly 21 H2 sections (one per page), each with at least one bullet or "No issues found."
- **Budget USD:** 3.00
- **Timeout Min:** 50

---

### T-10.3 — Page Audit: Group C — Tax pnd53/wht + Reports + Settings (19 pages)

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/audit/issues-group-c.md`
- **Reads:**
  `apps/web/src/app/(authenticated)/tax/pnd53/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pnd53/new/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/pnd53/[id]/page.tsx`,
  `apps/web/src/app/(authenticated)/tax/wht-certs/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/trial-balance/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/profit-loss/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/general-ledger/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/balance-sheet/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/cash-flow/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/ap-aging/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/ar-aging/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/vat-summary/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/branch-pnl/page.tsx`,
  `apps/web/src/app/(authenticated)/reports/cash-position/page.tsx`,
  `apps/web/src/app/(authenticated)/settings/account-map/page.tsx`,
  `apps/web/src/app/(authenticated)/settings/audit-log/page.tsx`,
  `apps/web/src/app/(authenticated)/settings/integrations/test/page.tsx`,
  `apps/web/src/app/(authenticated)/settings/integrations/dashboard/page.tsx`
- **Spec:**
  Read every file listed in **Reads** above using the Read tool. For each file, apply the 10-category audit checklist defined in the "Audit Checklist" section of this spec. Write all findings to `docs/audit/issues-group-c.md` using the output format defined in the "Output Format" section. DO NOT edit any source file — only write to `docs/audit/issues-group-c.md`.
- **Depends on:** —
- **Blocks:** —
- **Done when:** `docs/audit/issues-group-c.md` exists and contains exactly 19 H2 sections (one per page), each with at least one bullet or "No issues found."
- **Budget USD:** 3.00
- **Timeout Min:** 50

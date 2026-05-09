# Phase 11 — Audit Evaluation & Fix Plan

**Goal:** Two-stage synthesis. Sonnet compresses 171 audit findings into a compact pattern summary; Opus reads only the summary to design a prioritized fix task spec for Phase 12.
**Reads:** docs/audit/issues-group-a.md, docs/audit/issues-group-b.md, docs/audit/issues-group-c.md
**Acceptance:** `specs/tasks/phase-12-bug-fixes.md` exists with well-structured, prioritized fix tasks.

## Conventions

- **Language:** All generated output must be written in **English**.
- **Status checkbox:** Each task has `- [ ] **Status:** Not started`. On pickup change to `- [~] **Status:** In progress (owner: {name})`. When finished AND `Done when` verified, change to `- [x] **Status:** Done ({YYYY-MM-DD})`. NEVER mark `[x]` unless `Done when` has actually been checked.
- **Phase progress:** When all tasks in this file are `[x]`, mark this phase done in `specs/tasks/PROGRESS.md`.

## Dependency Graph

```
T-11.0 (Sonnet: compress audit → summary.md)
  └─ T-11.1 (Opus: summary.md → phase-12-bug-fixes.md)
```

---

## Tasks

### T-11.0 — Compress audit findings into pattern summary

- [x] **Status:** Done (2026-05-09)
- **Model:** Sonnet
- **Files:** `docs/audit/summary.md`
- **Reads:** `docs/audit/issues-group-a.md`, `docs/audit/issues-group-b.md`, `docs/audit/issues-group-c.md`
- **Spec:**

  Read all three audit files in full. Compress 171 issue bullets into a compact `docs/audit/summary.md`.
  Do NOT copy bullets verbatim — identify repeating patterns and count affected pages.

  **Output structure for `docs/audit/summary.md`:**

  ```markdown
  # Audit Summary
  _Compressed from 171 issues across 60 pages — 2026-05-09_

  ## Patterns (recurring across multiple pages)

  ### P-1: [Pattern name]
  - **Affected pages:** N (list modules: GL:2, AR:5, ...)
  - **Root cause:** [one sentence]
  - **Worst case:** [most severe instance with route and quoted issue]
  - **Severity:** Critical | High | Medium | Low

  ### P-2: ...

  ## Unique Issues (non-repeating, one page only)

  | Route | Issue | Severity |
  |---|---|---|
  | /gl/periods | VIEWER can close period — role guard missing on destructive action | Critical |
  | ... | ... | ... |

  ## Clean Pages (no issues)
  /login, /gl/journal-entries, /gl/journal-entries/new, ...
  ```

  **Severity rules:**
  - **Critical** — security bypass, data corruption risk, hard crash, or wrong financial data shown
  - **High** — violates CLAUDE.md invariants (parseFloat on money = High), visibly broken feature
  - **Medium** — UX degradation, inconsistency, spec deviation without data risk
  - **Low** — cosmetic, polish

  **Target length:** 1–3 pages. If the summary exceeds 3 pages, you are being too verbose — collapse further.
  The goal is to reduce Opus's input from ~40KB to ~3KB while losing zero signal about patterns and severity.

- **Depends on:** —
- **Blocks:** T-11.1
- **Done when:** `docs/audit/summary.md` exists, is under 200 lines, contains a Patterns section and a Unique Issues table, and all 171 issues are represented (either as part of a pattern or as a unique issue row)
- **Budget USD:** 1.50
- **Timeout Min:** 20

---

### T-11.1 — Design Phase 12 fix plan (Opus)

- [x] **Status:** Done (2026-05-09)
- **Model:** Opus
- **Files:** `specs/tasks/phase-12-bug-fixes.md`
- **Reads:** `docs/audit/summary.md`
- **Spec:**

  Read `docs/audit/summary.md`. Use it to design a complete, prioritized fix task spec written to `specs/tasks/phase-12-bug-fixes.md`.

  **Your job is to write the plan, not implement the fixes.**

  **Design principles:**
  - Fix Critical issues first (independent tasks, unblocked)
  - Group repeated patterns by module so Sonnet workers can fix them in parallel (e.g., "fix parseFloat in AR pages" and "fix parseFloat in AP pages" are separate parallel tasks)
  - Each task: 5–15 file edits max. If a pattern spans >15 files, split by module
  - Tasks that touch the same files must be sequential (use `Depends on`)
  - Be specific in each task's Spec: tell the worker exactly what to change (e.g., "replace all `parseFloat(x)` with `new Decimal(x)`, replace `fmtMoney` helper body, replace `x > 0` comparisons with `new Decimal(x).gt(0)`")

  **Required field format for every task:**
  ```
  ### T-12.N — [Title]

  - [ ] **Status:** Not started
  - **Model:** Sonnet
  - **Files:** `path/to/file.tsx`, ...
  - **Reads:** `docs/audit/summary.md`
  - **Spec:**
    [Precise instructions. Reference pattern IDs from summary.md (e.g., "Fix P-1 in these files"). Quote the exact code pattern to replace and what to replace it with.]
  - **Depends on:** T-12.X or —
  - **Blocks:** T-12.Y or —
  - **Done when:** [Concrete verifiable condition]
  - **Budget USD:** 2.00
  - **Timeout Min:** 40
  ```

  Budget guidance per task:
  - Small task (≤5 files, mechanical): **$2.00**
  - Medium task (6–10 files): **$2.50**
  - Large task (11–15 files): **$3.50**

- **Depends on:** T-11.0
- **Blocks:** —
- **Done when:** `specs/tasks/phase-12-bug-fixes.md` exists, has at minimum 6 tasks, all Critical and High severity issues from `docs/audit/summary.md` are covered, each task has all required fields, and the dependency graph has no circular references
- **Budget USD:** 3.00
- **Timeout Min:** 30

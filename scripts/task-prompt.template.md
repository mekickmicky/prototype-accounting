You are completing exactly ONE task ({{ID}}) for the WIND accounting prototype.

Working directory: /Users/mekick/code/PROTOTYPE/prototype-accounting

## Steps

1. Read `CLAUDE.md` (project conventions — money handling, naming, Decimal, Thai/English rules).
2. Read `{{PHASE_FILE}}` and locate the heading `### {{ID}}`. Read its **Spec**, **Reads**, **Files**, **Depends on**, and **Done when** sections carefully.
3. For every spec section listed under **Reads:**, open and read that file/section before writing code.
4. If your task **Depends on** another task, briefly read the corresponding service/file produced by that dep so your work integrates cleanly. Do NOT modify it.
5. Implement the task strictly per its Spec. Use existing utilities (e.g. `Decimal` helpers, error classes, numbering service) referenced by the spec — do not re-implement them.
6. Verify each item in **Done when** is satisfied before marking the task complete.

## Hard rules (non-negotiable)

- **Language:** All code, file content, identifiers, comments, and any commit message MUST be **English**.
  Thai is permitted ONLY in: (a) user-facing UI strings, (b) PDF templates for Thai tax forms / invoices / WHT certs, (c) seeded `name_th` columns, (d) i18n message catalogs.
- **Stay in scope:** ONLY do {{ID}}. Do NOT start, scaffold, or stub other tasks. If you find issues in another task's output, note them in the blocker section instead of fixing them yourself.
- **No git commits.** The user reviews and commits manually. Do not run `git commit`, `git push`, or `git reset`.
- **Money:** always `Decimal` (decimal.js). Never `Float`, `Number`, `parseFloat`. Compare with `.eq()`, add with `.plus()`.
- **Period codes:** `YYYY-MM` format, Asia/Bangkok TZ for derivation, Gregorian for storage.
- **Errors:** throw `BusinessRuleError` with stable codes. Never leak Prisma errors to API responses.
- **DB writes:** wrap in `prisma.$transaction` whenever multiple rows or sibling rows depend on each other.

## When finished

If every **Done when** check passes:

- Edit `{{PHASE_FILE}}`. Find the line `- [ ] **Status:** Not started` (or `- [~] **Status:** ...`) directly beneath the heading `### {{ID}}` and replace it with:
  ```
  - [x] **Status:** Done ({{TODAY}})
  ```
- Then exit cleanly. Do NOT begin another task.

## If blocked

If you hit a real blocker you cannot resolve (missing dep, contradiction in spec, environment issue):

- Edit `{{PHASE_FILE}}`. Replace the status line with:
  ```
  - [!] **Status:** Blocked ({{TODAY}}): <one-line reason>
  ```
- Append a paragraph in `specs/tasks/PROGRESS.md` under the `## Open questions / blockers` heading, naming the task ID and explaining the blocker in 2-4 sentences.
- Exit cleanly.

Do NOT mark `[x]` unless you actually verified the **Done when** items.

# Issue Tracking Convention

Issues found during testing or review live here as flat markdown files. When fixed, the file moves to `done/`.

## Why a file-based system (vs. GitHub issues / Linear / Notion)

- **Co-located with the code** — open the issue while reviewing the diff
- **Greppable / scriptable** — `grep -r "issue:" docs/issue/`
- **Survives in git history** — can see when issues opened/closed across branches
- **No external dep** — works offline, in subagent context, in CI logs
- **Lightweight** — for prototype-stage debt, not for cross-team coordination

## Lifecycle

```
docs/issue/<id>-<slug>.md          # open issue
   ↓ (resolved)
docs/issue/done/<id>-<slug>.md     # archived, kept for history
```

## Naming

`<NN>-<short-slug>.md` — two-digit sequential ID, kebab-case slug.
Examples:
- `01-trial-balance-rounding-bug.md`
- `02-period-close-allows-future-period.md`
- `03-je-form-decimal-overflow-on-paste.md`

Pad ID to 2 digits so sort order matches creation order. Move past 99? bump to 3 digits.

## File template

```markdown
---
id: NN
title: Short description
opened: YYYY-MM-DD
phase: 2
related-tasks: T-2.12, T-2.24
severity: blocker | high | medium | low
status: open | wip | done
---

## Symptom

What you observed. Reproduction steps. Screenshots / log excerpts in fenced blocks.

## Expected

What should happen instead, and why (reference spec / invariant if applicable).

## Root cause

(Fill in when diagnosed.)

## Fix

(Fill in when fixed. List commits / task IDs that resolved it.)

## Notes

Anything else: links to related issues, decisions made, follow-ups.
```

## Severity meaning

| Severity | Meaning |
|---|---|
| **blocker** | Phase cannot ship until fixed. PR is on hold. |
| **high** | Wrong output for normal cases. Must fix before next phase boundary. |
| **medium** | Edge case, workaround exists, can ship and fix in next sprint. |
| **low** | Cosmetic, nice-to-have, lint-style. |

## Workflow

1. **Find an issue while testing** → create `docs/issue/<NN>-<slug>.md` from template
2. **Triaged** → update `severity` and `related-tasks`
3. **Working on it** → set `status: wip`, optionally spawn a fix worker
4. **Fixed + verified** → set `status: done`, fill `Fix` section, **move file** to `docs/issue/done/`
5. **Reopened** → move back to `docs/issue/` and set `status: open`

## Move command

```bash
git mv docs/issue/01-foo.md docs/issue/done/01-foo.md
# or, if you don't want to track the move in this commit:
mv docs/issue/01-foo.md docs/issue/done/01-foo.md
```

## Naming the next ID

```bash
ls docs/issue docs/issue/done | grep -oE '^[0-9]+' | sort -n | tail -1
# → take +1 for the next issue
```

(Or just look — the filenames sort alphabetically.)

# 12 — Orchestration & Model Strategy

> **Scope:** Which model runs the **orchestrator session** (the human-facing session that calls `bun scripts/orchestrate.ts`) at each phase. The **worker** model is separate — it lives in each task's `**Model:**` line in `specs/tasks/phase-*.md` and is set per-task by the planner.

## Two-tier hybrid: Sonnet default, Opus on-trigger

**Default driver = Sonnet 4.6.** It runs the routine loop (check ready → spawn worker → sync Notion → mark done) at low cost.

**Opus 4.7 is invoked on-demand** when judgment quality moves the needle. Two ways to invoke:
1. The user switches the active session to Opus.
2. Sonnet spawns Opus as a **background agent** that posts its review/diagnosis to Notion. The user reads the report instead of swapping sessions.

The user has stated a preference for option 2 — keep Sonnet as the active conversational session, read Opus's Notion reports for review work.

## Phase-by-phase guide

| Phase | Default orchestrator | Reasoning |
|---|---|---|
| **1 — Foundation** | **Opus** | Pattern still being set. Conventions (money handling, Decimal usage, Prisma map style, branch_code propagation) emerge here. Locking in mistakes is expensive. |
| **2 — GL Core** | **Opus** until JE posting / period close / trial balance proven, then **Sonnet**. | Core invariants (debit=credit, immutable JE, period locking) are the heart of the system. Worth the cost to verify carefully. |
| **3 — AR** | **Sonnet** | CRUD-heavy, repeats GL pattern. Spec is concrete by now. |
| **4 — AP** | **Sonnet** | Mirrors AR. |
| **5 — Tax** | **Sonnet** for builds, **Opus** for tax-form correctness review (ภพ.30, ภงด.3/53). | Legal/compliance stakes — wrong WHT or VAT calc is a real-world problem, not a bug. |
| **6 — Bank** | **Sonnet** for builds, **Opus** for reconciliation logic + slip-verify edge cases. | Reconciliation has hidden complexity (timing differences, partial matches). |
| **7 — Reports** | **Sonnet** for builds, **Opus** to verify P&L/BS/Cash Flow reconcile and tie to GL. | Math errors here are silent and hard to catch later. |
| **8 — Integrations** | **Sonnet** | Webhook plumbing — straightforward. |

## Escalation triggers (switch to Opus regardless of phase)

Any of these should bring Opus in:

1. **Worker reports `Status: Blocked`** with non-trivial blocker — diagnose root cause before unblocking.
2. **Phase boundary review** — before declaring Phase N done and starting N+1, run an Opus review across the phase's deliverables. End-of-phase report → Notion.
3. **Subjective done-when** — UI density/quality, "feels right" criteria, code-review-style invariant checks.
4. **Spec ambiguity** — multiple valid interpretations of a task. Opus picks, documents the call, updates spec if needed.
5. **Cross-cutting change** — touching shared types, Prisma schema, money/date handling, or any of the seven invariants in `CLAUDE.md`.
6. **User explicitly asks** — "review this", "second opinion", "is this right?"

## What stays the same regardless of orchestrator model

- **Worker `**Model:**` field** in `specs/tasks/phase-*.md` — leave alone. Workers are planned per-task; orchestrator changes don't override them.
- **Orchestration mechanics** — `orchestrate.ts ready / spawn / status / done`, tmux session `wind-acc`, MAX_PARALLEL=3.
- **Notion sync** — every spawn updates the Notion task page (Status=WIP, Started, Run Mode, Actual Model). Every `done` updates Completed + Status=Done.
- **Critical invariants** in `CLAUDE.md` are non-negotiable for either model.

## Budget vs. quality balance

This project optimizes for **effective output, not cheapest run.** The hybrid is *not* a cost-cutting choice — it's a model-selection choice. Sonnet is genuinely sufficient for dispatch and CRUD-pattern work. Opus is genuinely better at review and ambiguity. Putting each where it shines is the point.

If a phase consistently triggers Opus escalation more than ~30% of tasks, that's a signal the spec for that phase is under-specified — fix the spec, don't paper over with Opus.

# Safeguard #1 — Per-task budget cap

> Hard ceiling on USD spend per spawned worker. Prevents a runaway worker from burning unlimited credits before any other safeguard catches it.

## Problem

`scripts/orchestrate.ts` spawns Claude Code workers with `-p --permission-mode bypassPermissions` (lines 248, 253). A worker that loops, mis-reads its task, or repeatedly retries on a transient error keeps making API calls until its conversation context fills — there is **no upper bound on cost per task**.

Today the only cost containers are:
- `MAX_PARALLEL=3` — caps concurrent burn rate, not total per-task.
- `--max-cycles` / `--max-tasks` on the auto loop — caps how many tasks are *started*, not how much each spends.

## Goal

Each spawned worker MUST exit (or be killed) once it has spent more than `BUDGET_USD_PER_TASK`. The orchestrator must surface the kill, mark the task `Blocked`, and Telegram-notify with the budget that was hit.

## Design

### Use the upstream flag

`claude --max-budget-usd <amount>` already exists and works with `-p` (the print mode the orchestrator uses). When the worker hits the cap, claude exits non-zero with a clear stderr message. **No polling, no token-counting on our side.**

### Defaults

| Model     | Default cap | Rationale                                                            |
|-----------|-------------|----------------------------------------------------------------------|
| Opus      | `$3.00`     | One Opus task historically averages ~$0.40–1.20; 3× headroom.        |
| Sonnet    | `$1.00`     | Sonnet typical $0.10–0.30; 3–4× headroom.                            |
| DeepSeek  | `$0.50`     | Cheap; the cap is mostly insurance against an infinite loop.         |

Globally overridable via env (`BUDGET_USD_OPUS`, `BUDGET_USD_SONNET`, `BUDGET_USD_DEEPSEEK`). Per-task override via spec field `Budget USD: 5.00` if a task is known-expensive (e.g. T-2.27 PDF rendering, T-3.7 invoice posting).

### Caveat: DeepSeek

`--max-budget-usd` enforces against Anthropic API billing. DeepSeek workers run through the `ai-deepseek` alias (different provider). The flag is **passed but may no-op**. For DeepSeek, the wall-clock timeout from Safeguard #2 is the real backstop — document this clearly.

## Implementation

### File changes

**`scripts/orchestrate.ts`**

1. Add env reader near line 27:
   ```ts
   const BUDGET_USD = {
     Opus:     parseFloat(process.env.BUDGET_USD_OPUS     ?? '3.00'),
     Sonnet:   parseFloat(process.env.BUDGET_USD_SONNET   ?? '1.00'),
     DeepSeek: parseFloat(process.env.BUDGET_USD_DEEPSEEK ?? '0.50'),
   } as const;
   ```

2. Extend `Task` type with optional `budgetUsd?: number` parsed from spec.

3. Update `parseTask()` to look for `Budget USD: 1.50` line in task body.

4. In `providerFor()` (line 247–254), append `--max-budget-usd <n>`:
   ```ts
   const budget = task.budgetUsd ?? BUDGET_USD[eff];
   const budgetFlag = ` --max-budget-usd ${budget.toFixed(2)}`;
   return { alias, flags: `${baseFlags}${budgetFlag}` };
   ```
   (Pass `task` into `providerFor` and `buildLaunchCommand`.)

5. After spawn (line 300), record `budgetUsd` next to the task in a runtime map so the auto loop can render it.

### Spec template change

**`scripts/task-prompt.template.md`** — add a line in the metadata block instructing workers that they have `${BUDGET_USD}` of API budget for this task and the harness will hard-stop them at that figure. This sets the right priors (don't over-explore; bail out and ask if blocked).

### Detection of budget-kill

When the worker exits non-zero and stderr contains `max budget` (case-insensitive), the orchestrator should:
- mark the task `Blocked` with reason `budget exceeded ($X.XX)`
- Telegram `error` notify with task ID and budget
- emit Langfuse event `task:budget_exceeded`

This detection happens in the auto loop's WIP scan (Safeguard #2 already handles dead-pane detection — same code path picks up budget kills).

## Test plan

1. **Unit**: spawn a deliberately tight task with `--max-budget-usd 0.01` → worker exits immediately with budget error → orchestrator marks Blocked.
2. **Integration**: run a normal task with default cap → completes without hitting cap.
3. **Override**: spec field `Budget USD: 0.05` on a task → flag passes through (verify with `--dry-run` printout).
4. **DeepSeek caveat**: spawn DeepSeek worker with cap → confirm flag is passed but task can still complete (proxy ignores).

## Open questions

- Should the cap be a **soft warning at 50%** (Telegram ping) before the hard kill? Probably yes — gives the user a chance to manually intervene before losing work.
- How to surface accumulated spend per `auto` run? Simplest: parse the budget-exceeded stderr lines and sum, log at stop.

## Out of scope

- True per-task token counting (we trust `--max-budget-usd` upstream).
- Cost reporting dashboards (Langfuse already shows token spend per trace; we tag traces with task ID).

## Acceptance criteria

- [ ] Spawning any task without override hits the model-default cap.
- [ ] Spec-level `Budget USD:` field overrides global default.
- [ ] Budget-kill exits worker, marks task `Blocked`, sends Telegram.
- [ ] `--dry-run spawn` prints the resolved `--max-budget-usd` flag for inspection.
- [ ] Documented DeepSeek caveat in `docs/auto-orchestrator.md`.

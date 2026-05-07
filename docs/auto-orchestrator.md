# Auto Orchestrator Mode

> Continuous worker dispatch loop for `scripts/orchestrate.ts`. Runs unattended, refilling worker slots as tasks finish, until a stop condition fires.

## Why this exists

The default flow is human-driven: an operator (Claude session or human) runs `orchestrate.ts spawn T-X.Y T-Y.Z` each time slots free up. That works for hand-curated task selection but wastes operator turns on routine "T-1.13 done → spawn T-1.14" dispatch.

`auto` mode automates the routine cycle while keeping a human in the loop for the parts that need judgment (review, blocker triage, phase-boundary PR).

## How it fits the existing tooling

| Layer | Mode |
|---|---|
| **Workers** (per-task Claude/DeepSeek) | unchanged — same template, same `bypassPermissions`, same Telegram notify hooks |
| **Orchestrator** | `auto` is a new subcommand alongside `ready / spawn / status / done / schedule / attach` |
| **Notion** | `auto` does NOT update Notion pages — local phase markdown remains the source of truth. Notion sync stays a Claude-session responsibility (so an operator session can still curate dashboards) |
| **Telegram** | `auto` reuses existing `notify.ts` for start / done / blocked. Adds one extra event: `info` ping at cycle boundaries (cap state, idle slots) |

## Loop semantics

```
forever:
  parse all tasks
  if stop_condition_met → notify info "auto stopped: <reason>"; exit
  free_slots = MAX_PARALLEL - count(wip)
  if free_slots == 0 → sleep DELAY; continue
  candidates = ready_tasks(filtered by --phase / --include / --exclude)
  if candidates.empty → sleep DELAY; continue
  pick = top-N candidates (N = free_slots), respecting file conflicts
  spawn(pick)
  sleep DELAY
```

### Picking which to spawn

Default ordering is the same as `cmdReady`: phase ascending, then task ID ascending. This means auto mode favors low-numbered phases — if you launch with `--phase 1,2` it will fully drain Phase 1 ready before pulling Phase 2.

File conflicts (already implemented in `cmdSpawn`) filter out collision pairs **before** picking. If T-2.5 and T-2.6 both write `packages/shared/src/foo.ts`, only the first by sort order is picked this cycle; the second waits for the next cycle.

### Delay

Default poll interval: **30 seconds**.

Reasoning: workers take 1-15 minutes typically. Polling faster wastes file I/O without helping latency. Polling slower (>60s) leaves slots idle longer than the workers themselves take to finish small tasks.

Configurable via `--delay <seconds>`. Min enforced: 10s (prevent runaway).

## Flags

| Flag | Default | Effect |
|---|---|---|
| `--phase <list>` | all | Comma-separated phase numbers to consider. Tasks outside list are ignored even if ready. Example: `--phase 1,2` |
| `--include <ids>` | none | Comma-separated task IDs allowed to run. Overrides `--phase`. Example: `--include T-1.14,T-2.5` |
| `--exclude <ids>` | none | Comma-separated task IDs to skip. Useful for parking known-flaky tasks. |
| `--max-tasks <n>` | unbounded | Stop after N tasks transition to done since auto started (not all-time). |
| `--max-cycles <n>` | unbounded | Stop after N polling cycles, regardless of progress. Hard timeout. |
| `--stop-on-blocked` | off | Stop immediately if any task transitions to blocked. (Recommended.) |
| `--stop-on-error <n>` | 3 | Stop if `n` consecutive cycles spawn nothing despite ready tasks (suggests systemic problem). |
| `--delay <seconds>` | 30 | Polling interval. Min 10s. |
| `--dry-run` | off | Log what would be spawned each cycle without actually spawning. |

## Stop conditions

Auto stops when **any** of these fires:

1. **All tasks done** — `done == total`
2. **No ready and no WIP** — nothing can possibly progress (probably a dep error or all blocked)
3. `--stop-on-blocked` set and a task is blocked
4. `--max-tasks` reached
5. `--max-cycles` reached
6. **Manual stop file** — operator creates `.orchestrator.stop` at repo root. Auto checks for this every cycle.
7. **SIGINT / SIGTERM** — Ctrl-C or kill: clean shutdown, send notify, exit

Every stop sends a Telegram `info` notification with the reason.

## Manual stop / resume

```bash
# stop a running auto loop without killing the terminal
touch .orchestrator.stop

# auto exits cleanly within DELAY seconds, removes the stop file
# resume:
bun scripts/orchestrate.ts auto --phase 1,2
```

## Safety guarantees

1. **Inherits cmdSpawn checks** — file conflicts, deps satisfied, slot cap, status==todo
2. **No file modifications outside spawn** — auto mode reads phase markdown, never writes (workers + setStatus do)
3. **Stop file checked first each cycle** — even if a worker just finished, the stop file is honored before the next spawn
4. **No retry on spawned task** — if a worker spawns then crashes, auto does NOT respawn it. The phase file still says WIP; operator must `done` or reset it manually. This is intentional — silent retries hide real failures.
5. **No reset on blocked** — auto sees blocked, stops (or skips depending on flag). Operator decides what to do with blocker.

## What auto does NOT do

- ❌ Update Notion (operator session does this)
- ❌ Review worker output / verify done-when (operator session does this — that's the whole point of `auto` letting operator focus on review)
- ❌ Resolve blockers
- ❌ Choose between equivalent ready tasks intelligently — uses sort order
- ❌ Mix-and-match models per cycle — uses planned model + DEEPSEEK_FALLBACK env var only
- ❌ PR creation, commit, or push
- ❌ Cancel / kill running workers

## Recommended workflows

### Workflow A — drain a phase overnight

```bash
bun scripts/orchestrate.ts auto \
  --phase 2 \
  --stop-on-blocked \
  --max-cycles 200
```

Goes home, comes back to either Phase 2 done or first blocker reported on Telegram. Phase 2 PR ready to assemble.

### Workflow B — pre-fill foundation prep

While operator session is busy reviewing Phase 1, run:

```bash
bun scripts/orchestrate.ts auto \
  --include T-2.17,T-3.3,T-3.25,T-4.16,T-5.13 \
  --max-tasks 5 \
  --stop-on-blocked
```

Banks the small isolated Zod / static catalog tasks while operator handles judgment work elsewhere. Stops itself once all 5 are done.

### Workflow C — burn-down

```bash
bun scripts/orchestrate.ts auto --stop-on-blocked
```

Run after a clean phase boundary, no scope filter. Tries to drain everything. Stops only on blocker or all-done.

## Implementation notes

- Reuse `parseAllTasks`, `ready`, `fileConflicts`, `effectiveModel`, `notify` (already exist).
- New helper: `selectBatch(tasks, slots, filters)` — applies phase/include/exclude filters, sorts, applies file-conflict avoidance, returns up to `slots` tasks.
- Loop should `await` between cycles (not setInterval) so signal handlers + stop-file checks happen synchronously between cycles.
- Track `tasksStartedThisRun` and `cycleCount` for `--max-tasks` and `--max-cycles`.
- Track `consecutiveEmptyCycles` for `--stop-on-error`.
- On exit, always log final counts + reason + send Telegram `info`.

## Cost & quota awareness

Auto mode uses zero LLM tokens itself — it's plain TypeScript. The cost is in the workers it spawns, which is the same cost as human-driven dispatch.

Watch out for:
- DeepSeek API quota / payment failures → workers fail silently (per memory note) → auto sees them as still-WIP → no retry → eventually stops via `--stop-on-error`. Telegram should ping the failed worker's blocked notify if template fires.
- Anthropic TPM limits at MAX_PARALLEL=5+ → workers may fail to start, manifests same way.

If you suspect a quota issue: check `.orchestrator.log` (if added later) or the tmux pane output directly.

## Future extensions (not in v1)

- `--watch` mode using fswatch on phase files (latency 1-2s vs 30s polling)
- Per-task budget caps (max wall time per worker)
- Auto-PR creation at phase boundary (would need git knowledge — out of scope for now)
- Slot-aware scheduling (reserve a slot for fast tasks, etc.)

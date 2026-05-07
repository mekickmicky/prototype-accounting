# Safeguard #2 — Stale-WIP detection + per-task wall-clock timeout

> Detect WIP tasks whose worker pane has died (orphan) or whose runtime has exceeded a sane ceiling (hung). Orchestrator currently waits forever in either case.

## Problem

A task is marked `[~] **Status:** In progress (DATE, pane SESSION:T-X.Y)` the moment we spawn it. The status stays `WIP` until the worker writes `[x] **Status:** Done (DATE)` to the spec or someone manually edits it. Failure modes that the auto loop currently misses:

| Failure                                                         | Today's behavior                                                       |
|-----------------------------------------------------------------|------------------------------------------------------------------------|
| Worker process dies (zellij tab closed, OOM, panic)             | Spec stays `WIP` → `wip` count never decrements → loop blocked forever |
| Worker hangs (waiting on a TTY prompt, infinite tool retry)     | Same as above; pane technically alive but doing nothing                |
| Worker exits non-zero (DeepSeek 402, network blip)              | Same; no signal back to orchestrator                                   |
| `--max-budget-usd` kill from Safeguard #1                       | Same; the kill itself is fine, but nobody updates the spec             |

`MAX_PARALLEL=3` makes this acute: one orphan WIP cuts capacity by 33%, three orphans halt the loop entirely.

## Goal

Every cycle, the auto loop verifies each WIP task is **live and within its time budget**. Orphans are reset to `Todo`. Hung tasks are killed and marked `Blocked` with reason. Both events Telegram-notify.

## Design

### Two checks per WIP, every cycle

**A. Pane-alive check** — is the zellij tab still open?

Already have a primitive: `zellij ... action query-tab-names` (line 231) returns the live tab list. For each WIP task: if the pane name (`SESSION:T-X.Y`) isn't in that list, the worker is gone.

```
WIP in spec    pane in zellij    → action
yes            yes               → live; check timeout
yes            no                → orphan; reset to Todo + notify
```

**Reset, not Blocked**: an orphan is usually a transient (laptop slept, zellij crashed). Resetting to `Todo` lets the next cycle re-spawn cleanly. Notify the user so they know it happened.

**B. Wall-clock timeout** — has the task been WIP too long?

Spec format is already `[~] **Status:** In progress (2026-05-07, pane wind-acc:T-3.5)`. Parse the date; compare with `now`.

| Model    | Default timeout | Why                                                  |
|----------|-----------------|------------------------------------------------------|
| Opus     | 90 min          | Largest tasks (T-2.6 close period, T-3.7 post)       |
| Sonnet   | 60 min          | Routine work                                         |
| DeepSeek | 30 min          | Short-form helpers; if it stalls 30 min something's wrong |

Globally overridable: `WIP_TIMEOUT_MIN_OPUS / SONNET / DEEPSEEK`. Per-task spec field `Timeout Min: 120`.

Spec date granularity is **per-day** today (`2026-05-07`). That's not enough to compute minutes. Two options:

1. **Bump granularity** — write `In progress (2026-05-07T14:32+07:00, pane …)` going forward.
2. **Track separately** — maintain `.orchestrator.wip-started.json` keyed by task ID with millisecond timestamps, written at spawn, deleted at done/reset.

**Pick option 2.** Cleaner — no spec-format churn, survives manual spec edits, atomic JSON write. Spec date stays as today's display.

### Action on timeout

1. `zellij action close-tab` (kill the worker)
2. Set spec status to `[!] **Status:** Blocked (DATE) — wall-clock timeout (Nm > Mm cap)`
3. Append a short blocker note to the spec for the operator to triage
4. `notify error` → Telegram with task ID + duration
5. Langfuse event `task:wall_clock_timeout`

### Action on orphan

1. Set spec status back to `[ ] **Status:** Not started`
2. Remove the WIP-started JSON entry
3. `notify info` → Telegram: "T-X.Y orphaned (pane gone) — reset to Todo"
4. Next cycle picks it up again automatically

## Implementation

### File changes

**`scripts/orchestrate.ts`**

1. Near line 27 add config:
   ```ts
   const WIP_TIMEOUT_MIN = {
     Opus:     parseInt(process.env.WIP_TIMEOUT_MIN_OPUS     ?? '90', 10),
     Sonnet:   parseInt(process.env.WIP_TIMEOUT_MIN_SONNET   ?? '60', 10),
     DeepSeek: parseInt(process.env.WIP_TIMEOUT_MIN_DEEPSEEK ?? '30', 10),
   } as const;

   const WIP_STARTED_FILE = join(ROOT, '.orchestrator.wip-started.json');
   ```

2. Add `recordWipStart(taskId)` helper that writes `{ [taskId]: epochMs }` to that file (read-modify-write). Call it inside `cmdSpawn()` right after `setStatus(t, 'wip', …)` (line 400).

3. Add `clearWipStart(taskId)` — call when task transitions out of WIP (Done, Blocked, Todo via reset).

4. Add `listLiveTabs(): string[]` — wraps `zellij action query-tab-names`.

5. New function `scanWipHealth(tasks): { orphans: Task[], timeouts: Task[] }`:
   - reads `WIP_STARTED_FILE`
   - reads live tab list
   - for each WIP task: classify orphan vs timeout vs healthy

6. In `cmdAuto` loop (around line 695), **before** computing `slots`, call `scanWipHealth` and act:
   ```ts
   const health = scanWipHealth(tasks);
   for (const t of health.orphans) await resetToTodo(t);
   for (const t of health.timeouts) await killAndBlock(t, reason);
   if (health.orphans.length || health.timeouts.length) {
     // re-parse so counts.wip reflects the changes before slot calc
     tasks = await parseAllTasks();
     counts = countByStatus(tasks);
   }
   ```

7. `killAndBlock(task, reason)` — `zellij action close-tab`, set spec to `Blocked`, append blocker note, notify, clear WIP file entry.

### Spec format additions

Optional per-task override:
```markdown
- **Timeout Min:** 120
```
Parsed in `parseTask()`; falls back to model default.

### Cleanup of `.orchestrator.wip-started.json`

- On `cmdDone` → remove entry
- On manual `cmdReset` (if exists) → remove entry
- On orchestrator startup → prune entries that no longer have a matching WIP spec (handles crashes mid-spawn)

## Edge cases

- **User manually marks a WIP task Done** outside the orchestrator: `clearWipStart` runs at next scan when transitioning out of WIP detected via diff against last-seen state. Prune-on-startup catches the rest.
- **Pane closed manually but task succeeded** (rare — user closed tab right after Done was written): we'd see Status=Done, no WIP entry, no problem. The check only fires on `status === 'wip'`.
- **Clock skew** (laptop slept, woken up): `now - started_at` jumps, would trigger spurious timeouts. Mitigate: also require `pane alive` for at least one cycle before a timeout fires (i.e. don't kill on first cycle after a long sleep). Simplest: cap (`elapsed - sleep_detected_gap`) using process uptime delta heuristic, OR just accept one false-positive per sleep cycle and let the user Telegram-confirm.
- **Shared pane name collision** — pane names are `T-X.Y`, unique by spec. Safe.

## Test plan

1. **Orphan**: spawn task, manually `zellij action close-tab` → next cycle resets to Todo + Telegram.
2. **Timeout**: set `WIP_TIMEOUT_MIN_SONNET=1`, spawn a Sonnet task that idles → after 60s, killed + Blocked + Telegram.
3. **Healthy**: normal task completes → WIP entry cleared at Done, no false alarms.
4. **Manual override**: spec `Timeout Min: 5` → 5 minutes wins regardless of model default.
5. **Crash recovery**: kill orchestrator mid-spawn (before WIP file write), restart `auto` → prune-on-startup removes stale entry, task re-spawnable.

## Open questions

- Should orphan reset preserve `Started:` date for analytics? Probably no — clean slate is simpler.
- Hard kill via `close-tab` vs send `Ctrl-C` first then close after grace? Worker is `claude -p` so SIGINT propagates cleanly; a 5-second grace period is reasonable.

## Out of scope

- Cumulative WIP duration across multiple spawns (each spawn resets the clock).
- Pause-and-resume semantics (we kill, not pause).
- Detection of *busy* hung — relies on output scanning (Safeguard #3).

## Acceptance criteria

- [ ] WIP task with no live pane → reset to Todo within 1 cycle.
- [ ] WIP task running > model timeout → killed + Blocked within 1 cycle.
- [ ] `.orchestrator.wip-started.json` is created/updated/cleared atomically.
- [ ] Both events emit Telegram + Langfuse trace event.
- [ ] Manual override via spec `Timeout Min:` honored.
- [ ] Restart-after-crash does not lose tracking for live workers (prune logic correct).

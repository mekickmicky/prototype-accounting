# Safeguard #3 — Pane output error scan

> Tail each WIP worker's pane buffer every cycle. Pattern-match for API/auth/quota/payment errors and surface them immediately. Implements the user's standing rule: "Stop and surface DeepSeek/external-API failures the moment they appear."

## Problem

Each spawned worker runs as `claude -p ...` inside an isolated zellij tab. The orchestrator can see:
- Spec markdown status (after the worker writes it)
- Pane existence (Safeguard #2)
- Task duration

The orchestrator **cannot see** anything the worker prints. So when:
- DeepSeek returns `402 Payment Required` (out of credit)
- Anthropic returns `429 Rate limited` or `401 Unauthorized` (bad key)
- A tool errors out repeatedly (`prisma migrate` failing on a connection refused)
- The model goes into an obvious loop (same error 50 times)

…the worker silently retries or sits at a stack trace, the spec stays `WIP`, and the auto loop happily waits. Safeguard #2 will catch it after 30–90 minutes, but by then real money/time is wasted and the user has gotten zero notification.

This is the safeguard most directly tied to the durable rule in memory: **"Notify on DeepSeek/external-API failures — stop and surface auth/quota/payment errors to user immediately."**

## Goal

Every cycle, for each WIP worker: dump the visible pane buffer → regex for error signatures → if matched, kill the pane, mark `Blocked` with the matching snippet as the reason, and Telegram-ping the user with enough context to triage.

## Design

### Capture pane output

Zellij supports `zellij action dump-screen <path>` which writes the visible buffer of the focused tab to a file. We need it for a *named* tab without focusing it.

Two options:

1. **`zellij action dump-screen` per tab** — Zellij doesn't natively support targeting a tab by name for dump-screen in stable releases. Need to focus → dump → restore focus. Risk: visible flicker if user is attached.
2. **Tail the worker's logs** — make the launch command tee its output to `/tmp/wind-acc-orchestrator/<task-id>.log` and tail that file instead.

**Pick option 2.** Cleaner, no zellij focus juggling, robust against zellij version changes. Modify `spawnInPane()` (line 297) to wrap the launch command:

```ts
const logPath = `${LOG_DIR}/${task.id}.log`;
const wrapped = `${cmd} 2>&1 | tee ${logPath}; exec zsh -i`;
```

(`tee` keeps the user's ability to read inside the pane while also persisting to disk.)

### Error pattern catalogue

Maintain a regex list with severity + suggested action.

```ts
const ERROR_PATTERNS: Array<{
  name: string;
  re: RegExp;
  severity: 'fatal' | 'warn';
  hint: string;
}> = [
  // Auth / billing — fatal, user must intervene
  { name: 'deepseek_payment',
    re: /(insufficient[_ ]?balance|payment[_ ]?required|402)/i,
    severity: 'fatal',
    hint: 'DeepSeek out of credit — top up at platform.deepseek.com' },
  { name: 'auth_invalid',
    re: /(invalid[_ ]api[_ ]key|unauthorized|401|authentication[_ ]failed)/i,
    severity: 'fatal',
    hint: 'API key rejected — check ~/.config or env' },
  { name: 'rate_limit_persistent',
    re: /(rate[_ ]?limit|429).+(retry|exceeded)/i,
    severity: 'warn',
    hint: 'Rate limited; if persists across multiple cycles, escalate' },
  { name: 'quota_exhausted',
    re: /(quota[_ ]exceeded|usage[_ ]?limit|insufficient[_ ]quota)/i,
    severity: 'fatal',
    hint: 'Provider quota — upgrade plan or wait for reset' },

  // Tool / runtime — usually fatal for the task
  { name: 'budget_killed',
    re: /max[_ ]?budget[_ ]?(exceeded|reached)/i,
    severity: 'fatal',
    hint: 'Hit --max-budget-usd cap from Safeguard #1' },
  { name: 'prisma_connect',
    re: /can'?t reach database server|ECONNREFUSED.+5432/i,
    severity: 'fatal',
    hint: 'Postgres not running — docker compose up -d postgres' },
  { name: 'oom',
    re: /(JavaScript heap out of memory|FATAL ERROR.*allocation failed)/i,
    severity: 'fatal',
    hint: 'Worker OOM — task too large; split or escalate model' },

  // Loop signature — same line repeated > 20×
  { name: 'output_loop',
    re: /__loop_detected__/, // synthetic, see below
    severity: 'fatal',
    hint: 'Worker is repeating itself — check pane' },
];
```

Patterns are conservative on purpose — false positive cost (one unnecessary kill) is small; false negative cost (silent overnight burn) is large.

### Loop detection

Pattern-matching on individual lines won't catch "model repeats the same 50-line block forever." Add a simple heuristic: **tail the last 200 lines, hash every contiguous 20-line window, alert if ≥3 windows hash-collide**. Insert a synthetic marker `__loop_detected__` into the scan buffer so it flows through the same alert path.

### Action on match

**Fatal**:
1. `zellij action close-tab` (kill worker)
2. Set spec status to `[!] **Status:** Blocked (DATE) — {pattern.name}: {hint}`
3. Append a "Last 30 lines" snippet to the task's blocker note in the spec (so operator can triage from spec alone)
4. `notify error` → Telegram with task ID, pattern name, hint, and the 5 lines around the match
5. Langfuse event `task:error_pattern_matched` with pattern name + sample
6. **If pattern is `auth_invalid` or `quota_exhausted` or `deepseek_payment`** → also halt the entire `auto` loop (`stopReason = 'API key/quota/billing failure on T-X.Y'`). One bad key = all subsequent tasks would fail the same way. Halt-and-escalate beats burning the rest of the queue.

**Warn**:
1. Telegram `info` ping (no kill)
2. Increment per-task warn counter; if same pattern fires 3 cycles in a row, promote to fatal

### Snippet selection

For the Telegram message, send the **5 lines preceding and 2 lines following** the regex match. Strip ANSI escapes. Truncate each line to 200 chars. If the buffer has multiple matches, send the latest only.

## Implementation

### File changes

**`scripts/orchestrate.ts`**

1. Near line 27 add:
   ```ts
   const LOG_DIR = process.env.WORKER_LOG_DIR ?? '/tmp/wind-acc-orchestrator';
   const PANE_SCAN_TAIL_LINES = 500;
   ```

2. In startup, `mkdir -p` the log dir.

3. Modify `spawnInPane()` to redirect output to per-task log file via `tee`.

4. New module-level constant `ERROR_PATTERNS` (catalogue above).

5. New function `scanPaneOutput(taskId): { match: ErrorPattern; snippet: string[] } | null`:
   - reads tail of `<LOG_DIR>/<task-id>.log`
   - strips ANSI
   - runs each pattern regex; first fatal match wins
   - also runs loop heuristic
   - returns null if clean

6. In `cmdAuto` loop, after `scanWipHealth` (Safeguard #2) and before slot calc:
   ```ts
   for (const t of tasks.filter(x => x.status === 'wip')) {
     const hit = scanPaneOutput(t.id);
     if (!hit) continue;
     if (hit.match.severity === 'fatal') {
       await killAndBlock(t, `${hit.match.name}: ${hit.match.hint}`, hit.snippet);
       if (HALT_PATTERNS.has(hit.match.name)) {
         stopReason = `API failure on ${t.id} (${hit.match.name})`;
         interrupted = true;
         break;
       }
     } else {
       await warnPattern(t, hit);
     }
   }
   ```

7. Helper `stripAnsi(s: string): string` — there are tiny published implementations (`/\x1b\[[0-9;]*[a-zA-Z]/g`); inline rather than add a dep.

### Log rotation

Worker logs accumulate. At end of `cmdAuto`, gzip + move logs older than 24h to `<LOG_DIR>/archive/`. At end of every successful task (`cmdDone`), keep the log for 24h then prune.

## Edge cases

- **Pattern in user-provided text** — a worker writing a JE description containing the word "unauthorized" would false-positive. Mitigation: patterns target stderr-like phrasing (`ECONNREFUSED`, `401 Unauthorized`, `Authentication failed`) more than bare keywords. Prefer specificity in regex over recall.
- **Log file races** — `tee` flushes on newline; tail-reads are at-most-line-aligned. Safe to read concurrently.
- **Encoded color codes** — strip ANSI before regex match to avoid `\x1b[31m401\x1b[0m` evading `\b401\b`.
- **Task that legitimately retries** (e.g., a worker validating a flaky test) — pattern catalogue should NOT include generic "Error" or "Failed" — those are too noisy. Catalogue is API/auth/billing/infra only.
- **Multi-line stack traces** — patterns like `oom` need to match across lines; use `[\s\S]` instead of `.` where needed.

## Test plan

1. **Synthetic 402**: write `Payment Required` to a worker log → next cycle: pane killed, Blocked with hint, Telegram fires, auto loop halts.
2. **Synthetic 429**: write `Rate limit exceeded, retrying` → warn fires (no kill); after 3 cycles same pattern → escalates to fatal.
3. **Real DeepSeek auth fail**: temporarily corrupt the DeepSeek key, spawn a DeepSeek worker → pattern matches within 1–2 cycles, auto halts, Telegram has hint.
4. **Clean run**: normal task → no false alarms across the full task duration.
5. **Loop detection**: spawn a worker, manually echo the same 30-line block 5× into its log → loop heuristic fires, marks Blocked.
6. **Snippet quality**: trigger a fatal → Telegram message contains 5 preceding + 2 following lines, ANSI-stripped, ≤200 chars/line.

## Open questions

- Should we **also** pipe the log tail to Langfuse on match (for forensics) vs only Telegram? Yes, attach as trace event metadata — diagnostic value is high.
- Per-pattern cooldowns? Probably not for fatal; for warn, cooldown of 1 cycle is implicit since we re-scan each cycle.
- Should fatal-on-auth halt the loop or just the affected task? Halt the whole loop — one bad key dooms everything.

## Out of scope

- General log analytics (we're alerting, not aggregating).
- ML-based anomaly detection (regex catalogue is sufficient and predictable).
- Auto-retry on transient errors (let the worker self-retry; we just monitor).

## Acceptance criteria

- [ ] Worker output is captured to `<LOG_DIR>/<task-id>.log` via `tee`.
- [ ] `scanPaneOutput` correctly identifies all catalogued patterns in a unit test.
- [ ] Fatal match → kill + Blocked + Telegram + Langfuse event within 1 cycle.
- [ ] Auth/quota/billing match → fatal, AND halts the auto loop with clear stopReason.
- [ ] Warn match → no kill but Telegram + counter; escalates to fatal at 3 consecutive cycles.
- [ ] Loop heuristic catches a 30-line repeated-block synthetic test.
- [ ] No false positives during a 1-hour normal-load auto run.
- [ ] Log files rotate after 24h.

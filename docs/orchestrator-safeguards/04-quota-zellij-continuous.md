# Safeguard plans #5, #6, #7 — quota detection, zellij tab close, continuous mode

Three follow-ups identified during the Phase 5 run. Plans only — implement after current phase wraps.

---

## #5 — Anthropic 5-hour session quota detection

### What we observed

Phase 5 worker T-5.11 wrote this to its log and exited:

```
You've hit your limit · resets 5:10pm (Asia/Bangkok)
```

Three workers (T-5.10, T-5.11, T-5.12) burned through this in succession because:

1. Worker hits the quota → claude exits non-zero almost immediately.
2. Tab closes (close-tab fix sometimes works).
3. Safeguard #2 sees pane-gone for a WIP task → resets to Todo.
4. Next cycle the task is "ready" again → orchestrator re-spawns.
5. New worker hits the same quota → loop. T-5.12 was respawned **8 times** before the user-issued SIGTERM.

Each respawn:
- Burns ~$0.01–0.05 in API attempt cost.
- Eats one of the operator's healthy worker slots while the quota is still flat.
- Pollutes the spec markdown with status churn.

### Goal

Detect "quota hit" within one cycle, halt the loop, surface the reset time to the user, and refuse to spawn anything until the reset elapses.

### Design

**Detection** — extend Safeguard #3's `ERROR_PATTERNS` catalogue:

```ts
{
  name: 'anthropic_quota_session',
  re: /(you'?ve hit your limit|usage limit reached).+resets?\s+(\d{1,2}:\d{2}\s*(am|pm)?)/i,
  severity: 'fatal',
  hint: 'Anthropic 5-hour session quota — wait for reset',
  // capture the reset time so the orchestrator can pause until then
  extract: (m: RegExpMatchArray) => ({ reset_at: m[2] }),
},
{
  name: 'anthropic_quota_daily',
  re: /(usage limit reached|message limit reached).+(daily|24[ -]?hour)/i,
  severity: 'fatal',
  hint: 'Anthropic daily quota — wait until tomorrow',
},
```

The pattern table needs to grow a `extract` function (currently doesn't exist) so the regex can pull the reset timestamp.

**Halt logic** — add a HALT_PATTERNS-style branch in `cmdAuto`:

```ts
if (hit.match.name === 'anthropic_quota_session' && hit.extract) {
  const resetTime = parseResetTime(hit.extract.reset_at);  // YYYY-MM-DDTHH:MM
  stopReason = `🚫 Anthropic session quota hit on ${t.id}. Resets at ${resetTime}.`;
  notifyAuto(stopReason);
  // Optional: write a sentinel file the user can check
  writeFileSync('.orchestrator.quota-pause', resetTime);
  interrupted = true;
  break;
}
```

**Pre-flight check on start** — at the top of `cmdAuto`, read `.orchestrator.quota-pause`. If present and the reset time is in the future, refuse to start (or sleep until reset).

```ts
const pauseUntil = readQuotaPause();
if (pauseUntil && pauseUntil > Date.now()) {
  console.log(`Quota pause until ${new Date(pauseUntil).toISOString()}. Sleeping…`);
  notifyAuto(`⏳ orchestrator paused for quota until ${pauseUntil}`);
  await sleepUntil(pauseUntil);
  await fs.unlink('.orchestrator.quota-pause');
}
```

**Reset-time parsing** — claude prints local time like `5:10pm (Asia/Bangkok)`. Parse with `date-fns-tz` or hand-rolled: `parse('5:10pm', 'h:mma')` against today's date in Asia/Bangkok TZ; if that's in the past add 24h (i.e. it's tomorrow's 5:10pm).

### Edge cases

- **Reset time already passed** by the time we react (e.g. orchestrator was sleeping): pause for 0 seconds = immediate resume. Don't crash.
- **Multiple workers hit quota same cycle**: first detection wins; subsequent detections are no-ops.
- **Quota hit message wording changes** in claude updates: regex might break silently. Mitigation: also pattern-match a simpler `"limit"` + `"resets"` co-occurrence as fallback.

### Acceptance

- [ ] Worker hitting quota → orchestrator halts within 1 cycle.
- [ ] `.orchestrator.quota-pause` file written with reset timestamp.
- [ ] Telegram notify includes the reset time and which task triggered.
- [ ] On next `auto` start, sentinel file is read; if reset is in the future, sleep + resume; if past, just unlink and proceed.
- [ ] No more than 1 task respawn before halt fires.

---

## #6 — zellij tab auto-close on worker completion

### What we observed

Despite the `; zellij action close-tab` suffix added in commit `a43a569`, multiple T-3.x, T-4.x, and T-5.x tabs persist in the zellij session after their workers exited. Currently 15+ zombie tabs visible. Symptoms:

- FD pressure (zellij's PTY count drifts upward).
- Operator's tab list is cluttered.
- Safeguard #2 *sometimes* sees a "live" pane for a worker that's actually dead, so the orphan-detect path doesn't fire — the wall-clock timeout has to bail the task out instead.

### Hypotheses for why close-tab fails

1. **Pipe semantics**: `claude … | tee LOG; close-tab`. If `claude` exits with a SIGPIPE because tee dies first (rare), the pipeline state is weird and `close-tab` doesn't run.
2. **Zellij session targeting**: from inside a zellij pane the action SHOULD target the current session, but if the orchestrator's spawn shell didn't fully attach to the session (it shouldn't have, but), close-tab is a no-op.
3. **Tab is the last in a focused group**: zellij sometimes keeps the last tab as a placeholder.
4. **SIGINT forwarding**: if the operator hits Ctrl-C in another tab, zellij sometimes interrupts the cleanup line.

### Design

**Two-pronged fix**:

**A. Make the in-shell close-tab more robust.** Use the Zellij plugin URL pattern that DOES auto-close reliably:

```sh
${cmd} 2>&1 | tee ${logPath}
# Hard-kill the tab regardless of exit status
( zellij action close-tab 2>/dev/null || true )
```

Wrap close-tab in a subshell so a failed close doesn't propagate. Or use `zellij --session ${SESSION} action close-tab` to be explicit about which session.

**B. Add an out-of-band reaper to the auto loop.** Each cycle, after `scanWipHealth`, sweep tabs whose name corresponds to a Done or Blocked task:

```ts
async function reapDoneTabs(tasks: Task[]): Promise<void> {
  const liveTabs = listLiveTabs();  // existing helper
  const finishedTaskIds = new Set(
    tasks.filter((t) => t.status === 'done' || t.status === 'blocked').map((t) => t.id),
  );
  for (const tabName of liveTabs) {
    if (finishedTaskIds.has(tabName)) {
      // close it
      spawnSync('zellij', ['--session', SESSION, 'action', 'go-to-tab-name', tabName], { stdio: 'ignore' });
      spawnSync('zellij', ['--session', SESSION, 'action', 'close-tab'], { stdio: 'ignore' });
    }
  }
}
```

Run after each cycle. The reaper handles tabs that the in-shell cleanup missed.

### Caveat: focus disruption

`go-to-tab-name + close-tab` changes the operator's currently-focused tab. If the operator is attached to zellij doing manual work, this is rude. Mitigations:

- Skip the reaper unless `--reap` is passed (default off).
- Or, before the reap, save the active tab name and restore focus after.

The save-restore approach:

```ts
const before = currentFocusedTab();
// reap...
if (before) spawnSync('zellij', ['--session', SESSION, 'action', 'go-to-tab-name', before], { stdio: 'ignore' });
```

### Acceptance

- [ ] After a clean worker exit, the tab disappears within 10s.
- [ ] After a worker crash (SIGKILL, OOM), reaper closes the tab on the next cycle.
- [ ] Reaper preserves operator focus when they're attached.
- [ ] No interference with live worker tabs.

---

## #7 — Continuous "supervisor" mode

### What we want

The current `auto` loop runs once. It stops when it hits any safeguard. If the user wants Phase 5 → Phase 6 → Phase 7 → Phase 8 to run end-to-end across overnight, they have to manually relaunch each phase.

User's request: a mode that checks every 10 minutes, and re-launches `auto` if conditions are right.

### Design

**`cmdSupervise`** — a new top-level command alongside `cmdAuto`:

```sh
bun scripts/orchestrate.ts supervise --phases 5,6,7,8 --check-interval 600
```

**Loop semantics**:

```ts
forever:
  if .orchestrator.stop exists → exit
  if .orchestrator.quota-pause exists AND in future → sleep until reset
  parse all tasks
  if every task in --phases is Done/Blocked → notify "🎉 all phases complete"; exit
  if no auto loop is currently running:
    pick the next un-finished phase from --phases
    spawn auto with --phase <X> --max-tasks 20
    notify "▶ supervisor launched auto for phase X"
  sleep --check-interval
```

**Tracking active auto loop**: write a sentinel `.orchestrator.auto-pid` with the auto-loop's PID when launched, delete on exit. Supervisor checks `kill -0 <pid>` to see if it's still alive.

**Phase ordering**: the supervisor walks phases in the order given. When current phase has 0 ready + 0 WIP → move to next phase. This handles cross-phase dependencies cleanly (Phase 6 starts when Phase 5 actually has all its anchors built).

**Failure handling**:
- Auto loop exits with stopReason "quota hit" → respect the pause, supervisor waits + retries.
- Auto loop exits with "phase complete" → supervisor advances.
- Auto loop exits with anything else (timeout / blocked / error) → supervisor sleeps `--check-interval` and tries again. After N consecutive failures (default 3) → halt + notify.

### Heartbeat

Supervisor pings Healthchecks separately from auto. So if the supervisor itself dies (rare), the user gets paged. Different ping URL: `HEALTHCHECK_PING_URL_SUPERVISOR`.

### Logs

Each supervisor launch is one auto invocation. Logs go to the existing per-cycle file. Supervisor maintains its own log at `/tmp/wind-acc-orchestrator/supervisor.log` for cross-launch tracking.

### Edge cases

- **User runs `auto` manually while supervisor is running**: respect it. Supervisor sees a live auto loop and doesn't launch another. Two parallel auto loops would race the spec markdown.
- **Phase has all blocked tasks**: supervisor advances anyway after a few cycles to avoid stalling.
- **Supervisor restart mid-pause**: re-reads `.orchestrator.quota-pause`, resumes the wait correctly.

### Why not cron

Cron with `auto --max-cycles 5` every 10 min is the dumber alternative. It works for the basic case but:
- Cross-phase advance is awkward (cron is stateless).
- Quota detection still requires the auto loop to do the right thing on its own.
- Healthchecks integration is per-invocation, not aggregated.

The supervisor approach gives us state + ordering + better observability.

### Acceptance

- [ ] `bun orchestrate.ts supervise --phases 5,6,7,8` runs unattended for 24h.
- [ ] Auto-advances through phases as each completes.
- [ ] Pauses on quota hit, resumes after reset.
- [ ] Respects `.orchestrator.stop` sentinel.
- [ ] Sends start / phase-advance / phase-complete / final-done Telegram pings.
- [ ] Idempotent: restarting the supervisor mid-run picks up exactly where it left off.

---

## Implementation order (when ready)

1. **#5 quota detection** — prevents repeat of the T-5.12 retry-loop disaster.
2. **#6 tab reaper** — cosmetic + FD hygiene; lower priority but cheap.
3. **#7 supervisor** — depends on #5 to be useful (otherwise it just re-launches into the same quota wall).

All three are non-trivial but bounded. Estimate: ~3-5 hours total to implement + test.

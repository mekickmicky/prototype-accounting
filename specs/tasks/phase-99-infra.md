# Phase 99 — Infrastructure tasks

> Out-of-band orchestrator/observability work. Numbered 99 to keep them separate from build phases. Spawned via the same `orchestrate.ts` machinery so we get notify + status tracking + file-conflict checks for free.

---

### T-99.1 — Zellij swap (replace tmux in orchestrate.ts)

- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `scripts/orchestrate.ts` (EDIT)
- **Reads:** `docs/setup/zellij.md`
- **Depends on:** —
- **Blocks:** T-99.4
- **Done when:** Zellij installed; spawning, listing, and attaching all work via Zellij CLI; smoke test of one task spawn → done → pane close confirmed; help text updated.

**Spec:** Read `docs/setup/zellij.md` for the full design. Replace tmux shell-outs in `scripts/orchestrate.ts` with Zellij equivalents. Keep external API unchanged. Do NOT remove tmux from system. Verify `zellij list-sessions` and `zellij action new-tab` work as expected on macOS.

---

### T-99.2 — SQLite-backed orchestrator state (Sonnet implements per Opus design)

- [ ] **Status:** Not started
- **Model:** Sonnet
- **Files:** `scripts/lib/store.ts` (NEW), `scripts/orchestrate.ts` (EDIT), `.gitignore` (EDIT), `docs/setup/sqlite-orchestrator-running.md` (NEW)
- **Reads:** `docs/setup/sqlite-orchestrator.md`
- **Depends on:** T-99.1
- **Blocks:** —
- **Done when:** SQLite store exists at `.orchestrator/state.db`; `orchestrate.ts sync` populates DB from markdown; `ORCHESTRATOR_USE_SQLITE=1` flag routes reads through DB; markdown still updated on status change; `orchestrate.ts history` lists past worker runs; smoke test (sync → spawn → done → query) passes.

**Spec:** Implement strictly per the design doc — schema, store API, sync semantics, feature flag, mirror writes. Do NOT extract to a separate package (that's a follow-up). Do NOT remove the markdown read path yet — keep both behind the flag.

**Why depends on T-99.1:** Both edit `scripts/orchestrate.ts`. Serialize to avoid merge conflicts.

---

### T-99.3 — Langfuse infrastructure setup (Phase A — no orchestrator wiring)

- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `docker-compose.yml` (EDIT), `.env.example` (EDIT), `package.json` or `packages/shared/package.json` (EDIT — add langfuse dep), `scripts/langfuse-smoke-test.ts` (NEW), `docs/setup/langfuse-running.md` (NEW)
- **Reads:** `docs/setup/langfuse.md`
- **Depends on:** —
- **Blocks:** T-99.4
- **Done when:** Langfuse self-hosted via docker-compose, UI accessible locally, API keys created, smoke test sends + retrieves a trace successfully, README documents the setup steps for future operators.

**Spec:** Read `docs/setup/langfuse.md` Phase A section. Self-host first; if Postgres conflicts or port issues, fall back to Cloud free tier and document why in `langfuse-running.md`. Do NOT touch `scripts/orchestrate.ts` (that's T-99.4). Smoke test should be runnable as `bun scripts/langfuse-smoke-test.ts`.

---

### T-99.4 — Wire Langfuse traces into orchestrator (Phase B)

- [x] **Status:** Done (2026-05-07)
- **Model:** Sonnet
- **Files:** `scripts/orchestrate.ts` (EDIT)
- **Reads:** `docs/setup/langfuse.md`, `docs/setup/langfuse-running.md`
- **Depends on:** T-99.1, T-99.3
- **Blocks:** —
- **Done when:** `cmdSpawn` creates a Langfuse trace per task; `cmdAuto` cycles emit spans; trace closes on done/blocked detection; cost field left null (not in scope); spawning a real worker produces a visible trace within 10s.

**Spec:** Read `docs/setup/langfuse.md` Phase B. Treat workers as opaque — instrument at the orchestrator boundary only. Do not break existing notify / healthcheck integration.

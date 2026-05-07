# Langfuse setup — observability for orchestrator + workers

> Self-host Langfuse via Docker compose. Orchestrator emits trace/span events per spawn; eventually wire cost data via Anthropic billing API. Workers themselves don't talk to Langfuse — they're CLI processes. Orchestrator instruments at process boundary.

## Why self-host

- Privacy: prompts may contain proprietary specs and Thai tax logic
- Free for self-host, no per-event cost
- Unlimited retention — useful for cost analysis across phases
- Same docker-compose pattern can serve other MEKICK projects

## Two-phase rollout

### Phase A — T-99.3: Infra setup (THIS task, Sonnet, parallelizable with T-99.1)

Get Langfuse running locally, instrument with a smoke test. NO orchestrate.ts wiring yet.

**Scope:**
1. Add Langfuse to existing `docker-compose.yml` (alongside whatever's there for Postgres)
2. Bring up: `docker compose up -d langfuse-server langfuse-web`
3. Create initial project + API keys via UI (manual step, document URLs in README)
4. Add `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` to `.env.example`
5. Add `langfuse` package to `packages/shared/` (so api + scripts can both use)
6. Write `scripts/langfuse-smoke-test.ts` — sends one trace + one span, prints the trace URL
7. Document setup in `docs/setup/langfuse-running.md`:
   - How to start (`docker compose up`)
   - URL for UI
   - How to find API keys
   - Smoke test command

**Files:**
- `docker-compose.yml` (EDIT — add langfuse services)
- `.env.example` (EDIT — add LANGFUSE_* vars)
- `package.json` or `packages/shared/package.json` (EDIT — add langfuse dep)
- `scripts/langfuse-smoke-test.ts` (NEW)
- `docs/setup/langfuse-running.md` (NEW)

**Done when:**
- `docker compose ps` shows langfuse healthy
- UI accessible at http://localhost:3030 (or whatever port)
- Smoke test prints a working trace URL
- README documents the manual key-creation step

### Phase B — T-99.4: Wire to orchestrator (LATER, after T-99.1 Zellij done)

After Zellij work is merged (avoids orchestrate.ts conflict).

**Scope:**
- Wrap `cmdSpawn` to start a trace per task: `langfuse.trace({ name: task.id, metadata: { phase, model } })`
- Each cycle in `cmdAuto` creates a span: `trace.span({ name: 'cycle-N' })`
- Worker exit (detected via tmux pane disappearance OR phase-file status change) → close trace with status
- Cost: leave `cost` field empty for v1 — bridge Anthropic billing API later

**Files:**
- `scripts/orchestrate.ts` (EDIT)

**Done when:**
- Spawning a task creates a visible trace in Langfuse UI within 10s
- Auto loop spans show cycle progression
- Trace closes when worker marks done/blocked

## Self-host vs cloud decision

If self-host turns out painful (Postgres dep, port conflicts, etc.), worker may switch to Langfuse Cloud free tier. Document the decision in `langfuse-running.md` either way.

## Out of scope (v1)

- Cost tracking per worker (needs Anthropic billing API integration — separate task)
- Prompt caching trace details (Claude Code is a black box from our side)
- Score / eval features
- Alert rules
- Multi-environment (just local for now)

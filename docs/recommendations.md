# Workflow Improvement Recommendations

> Tools, concepts, and patterns to upgrade the parallel-worker orchestration flow used by `scripts/orchestrate.ts`. Listed in priority order. Each item: what it solves, effort to add, and why community uses it.

## Quick wins (high ROI, < 1 hour each)

### 1. Healthchecks.io — dead-man's switch ✅ implemented
Detects silent crashes (Bun OOM, network drop, terminated terminal). Auto loop pings a URL every cycle; if pings stop for N minutes, Healthchecks emails / Telegrams an alert.

- Cost: free tier covers 20 checks
- Set up: 5 min — create check, copy UUID, set `HEALTHCHECK_PING_URL` in `.env`
- Why community: dead-simple, no agent install, the canonical "is it still alive?" pattern

### 2. Anthropic prompt caching ✅ implemented
Static prompt prefix (project conventions, hard rules, template boilerplate) gets cached → 90% token discount on cached portion. With 158 workers each reading similar context, the savings compound.

- Cost: same Anthropic billing, just cheaper
- Set up: 30 min — restructure template so static content is at top, variable content (task ID, today) at bottom; ensure Claude Code session prefix gets cached
- Why community: lowest-friction cost reduction for high-volume agent flows

### 3. Helicone proxy — instant cost dashboard
Drop-in proxy for Anthropic API. Change one base URL → get cost-per-call, latency, error rate, token usage dashboards.

- Cost: free tier 100k requests/mo
- Set up: 10 min — sign up, replace `https://api.anthropic.com` with `https://oai.helicone.ai/v1` in worker env
- Why community: easiest LLM observability, no SDK changes
- **Caveat:** workers spawn via `claude` CLI which may not honor custom base URL; may need wrapper

### 4. Justfile — DX shortcuts
`justfile` (modern Make) for common ops. `just auto`, `just status`, `just review T-2.5`, etc. Reduces cognitive load.

- Cost: free, single binary
- Set up: 15 min
- Why community: prefer over Make for new projects (better error messages, no tab/space hell)

### 5. Apprise — multi-channel notify failover
If Telegram bot dies, you go silent. Apprise sends to Telegram + Discord + ntfy.sh + email simultaneously with one CLI.

- Cost: free OSS
- Set up: 20 min — `pip install apprise`, replace `notify.ts` body with apprise call
- Why community: 80+ providers in one tool, used in Home Assistant / Uptime Kuma

## Medium-term (high impact, 2-8 hours)

### 6. Langfuse / Arize Phoenix — full LLM observability
Trace every worker's LLM calls, costs, prompts, responses. Build dashboards: cost per phase, slowest tasks, retry counts.

- Cost: Langfuse self-host = free, cloud = $29/mo. Phoenix = OSS only.
- Set up: 2-3 hours — instrument worker spawning, send traces
- Why community: gold-standard for LLM agent observability; alternatives are pile of half-baked tools

### 7. SQLite for orchestrator state
Replace markdown parsing every cycle with SQLite. Tables: `tasks`, `worker_runs`, `events`. Get queryable history, cost rollups, retry tracking, race-free updates.

- Cost: free, built into Bun
- Set up: 4-6 hours — schema, migration from existing markdown, sync layer keeping markdown as "view"
- Why community: standard pattern for any orchestrator at scale

### 8. Zellij or mprocs — better worker monitoring
tmux works but loses utility past 5 panes. Zellij has named tabs, layouts, plugins. Mprocs shows N panes in a grid.

- Cost: free
- Set up: 30 min to install + write a layout config
- Why community: zellij is the modern tmux; mprocs purpose-built for this exact pattern

### 9. Worker heartbeat / zombie detection
Workers write to `apps/api/.heartbeats/T-X.Y.txt` every 30s. Orchestrator marks blocked + kills pane if no update in 5 min. Catches hung workers stuck on tool prompts.

- Cost: free
- Set up: 1-2 hours — template hook + orchestrator timeout check
- Why community: standard "liveness probe" pattern from Kubernetes / SRE

### 10. Cost budget guard
Add `--budget-usd 50` flag. Auto polls Anthropic billing API before each spawn; stops if cumulative session spend exceeds threshold.

- Cost: free (uses billing API)
- Set up: 1 hour
- Why community: required for unattended overnight runs to avoid runaway

## Architectural concepts

### 11. Idempotent spawn
Spawn a task twice → second invocation is a no-op (returns existing run). Needed for safe restart-after-crash scenarios.

### 12. Rate limiting (token bucket)
Cap workers spawned per minute; cap total Anthropic TPM. Prevents thundering-herd at session start.

### 13. Idle-spawn from fallback queue
If primary phase queue is filter-empty for N cycles, spawn from a fallback list of "always-safe small tasks" (Zod schemas, static catalogs). Keeps slots warm, finishes prep work in idle time.

### 14. DAG visualization
`bun scripts/orchestrate.ts schedule --format mermaid` → render → see dep graph. Spot bottlenecks (e.g., "JE service is critical path; can we parallelize?")

### 15. Per-task wall-clock budget
Each task spec gets a `**Max duration:**` field. Worker exceeding it auto-blocks with reason "exceeded budget". Forces small tasks.

### 16. Auto-retry transient failures
Worker exits with no status change → retry once. Catches network blips, file lock races. Risk: hides real failures, must log retries clearly.

### 17. Phase-boundary auto-PR
At end of phase: orchestrator creates a draft PR with all phase commits, runs lint/test, posts to Slack. Operator only reviews + merges.

## Community frameworks (rewrite-level commitment)

### 18. LangGraph
State-machine multi-agent framework. Would replace `cmdAuto` loop with a proper graph. Strengths: retry logic, checkpoints, human-in-the-loop nodes.

- When to consider: if scaling past this prototype to multiple projects

### 19. CrewAI
Role-based agents (planner, coder, reviewer, tester). Could split current "worker" role into specialized roles per task.

- When to consider: if review automation becomes a goal

### 20. Anthropic Claude Agent SDK
Official Anthropic framework for building proper sub-agents (vs. CLI spawn). Better integration with caching, tool use, file operations.

- When to consider: if migrating off CLI-spawn pattern

### 21. Anthropic Batch API
50% discount, 24h SLA. For tasks that aren't time-sensitive (Phase 7 reports, Phase 8 integrations once stable).

- Set up: 2-4 hours — batch packaging logic in orchestrator
- Catch: not real-time, breaks current "ping when done" UX

### 22. Inngest / Temporal — durable workflows
Workflow engines with built-in retry, scheduling, observability. Overkill for prototype but considered if this graduates to production multi-day pipelines.

## Optimization concepts

### 23. Session-level prompt caching
Each worker reads CLAUDE.md → same content cached within session. Run multi-task workers (one session, sequential tasks) to amortize the cache cost. Risk: scope creep within a worker session.

### 24. Pre-built context bundles per phase
Build `bundles/phase-2.md` = CLAUDE.md + spec 02 + spec 04 sections relevant to Phase 2 → workers read ONE file → fewer tool calls + better caching prefix.

### 25. Deterministic spawn ordering for cache reuse
Sort batch in same order each cycle so the *common prefix* of conversations across workers stays stable → maximize CDN-edge cache hits at Anthropic.

## Notification patterns

### 26. Notification levels (verbose / normal / quiet)
`NOTIFY_LEVEL=verbose` sends every event; `quiet` only sends errors + phase completion. Reduces Telegram fatigue when running 20+ tasks.

### 27. Daily digest
Cron job at 9am: send Telegram message with prior-day summary (tasks done, blockers seen, cost, time saved vs. estimate).

## Anti-patterns to avoid

- ❌ **Auto-fixing blocked workers with another LLM** — hides bugs, false confidence
- ❌ **Skipping `--stop-on-blocked`** — burns budget on cascading failures
- ❌ **Increasing MAX_PARALLEL without file-conflict awareness** — already implemented, but don't disable
- ❌ **Cron-driven auto without budget guard** — runaway risk
- ❌ **Ignoring blockers on the assumption "I'll fix later"** — debt compounds; review same-day or reset

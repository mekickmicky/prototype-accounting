# T-99.2 — SQLite-backed orchestrator state (Opus design, Sonnet implements)

> Replace markdown-parsing-every-cycle with a SQLite store. Markdown remains the human-editable spec; SQLite becomes the runtime source of truth synced from markdown. Designed once here so it can be lifted into a reusable package across MEKICK projects.

## Goals

1. **Faster cycles** — avoid re-parsing 158 markdown blocks every 30s
2. **Queryable history** — runtime/cost/duration per task, per phase, per model
3. **Race-safe** — concurrent operator + auto loop + manual `done` calls without lost updates
4. **Cross-project reusable** — schema + store layer can be extracted to `@mekick/orchestrator-core`

## Non-goals (v1)

- Replacing markdown as the spec source — markdown stays primary
- Multi-project shared DB — one DB per project
- Distributed coordination across machines — single-machine only
- ORM layer — raw SQL via Bun's built-in SQLite is enough

## Architecture

```
specs/tasks/phase-N-*.md  (HUMAN spec)
        ↓ (sync on demand: orchestrate.ts sync)
.orchestrator/state.db    (RUNTIME source of truth)
        ↓ (read by orchestrate.ts cycle)
        ↓ (write by orchestrate.ts spawn / done / status mark)
        ↓ (sync back to markdown checkbox state on done/blocked)
```

**Sync direction:**
- Markdown → DB: explicit `sync` command (parses all phase files, upserts tasks). Run after editing specs.
- DB → Markdown: orchestrator updates checkbox in markdown each time it changes status (current behavior preserved).

**Why both directions:**
- Operators edit markdown to add/change task definitions — DB doesn't know about new tasks until sync
- Workers edit markdown checkbox when finished — orchestrator picks up the change next cycle, mirrors to DB
- Markdown remains git-trackable; DB is gitignored

## Schema (v1)

```sql
-- Phase metadata (one row per phase file)
CREATE TABLE phases (
  number INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                      -- "GL Core"
  file_path TEXT NOT NULL                  -- "specs/tasks/phase-2-gl-core.md"
);

-- Tasks (one row per task across all phases)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,                     -- "T-2.5"
  phase_number INTEGER NOT NULL REFERENCES phases(number),
  name TEXT NOT NULL,                      -- "Period close checklist"
  status TEXT NOT NULL CHECK (status IN ('todo','wip','done','blocked')),
  status_detail TEXT,                      -- "In progress (2026-05-08, pane wind-acc:T-2.5)"
  planned_model TEXT NOT NULL,             -- "Sonnet"
  files_text TEXT,                         -- raw Files: field
  reads_text TEXT,                         -- raw Reads: field
  blocks_text TEXT,
  done_when TEXT,
  blocker_reason TEXT,                     -- one-liner from blocked status
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_phase ON tasks(phase_number);

-- Files extracted from a task's Files: field, normalized for conflict detection
CREATE TABLE task_files (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                      -- "apps/api/prisma/schema.prisma"
  PRIMARY KEY (task_id, path)
);

CREATE INDEX idx_task_files_path ON task_files(path);

-- Dependencies (edges of the DAG)
CREATE TABLE task_deps (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on TEXT NOT NULL,                -- "T-2.4" or "Phase 1" — keep raw form
  PRIMARY KEY (task_id, depends_on)
);

-- Each spawn = one row in worker_runs (re-spawn after blocked = new row)
CREATE TABLE worker_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  pane_id TEXT,                            -- tmux/zellij pane ref
  actual_model TEXT,                       -- may differ from planned (DEEPSEEK_FALLBACK)
  started_at INTEGER NOT NULL,
  ended_at INTEGER,                        -- null until known
  outcome TEXT,                            -- 'done', 'blocked', 'orphan' (pane gone, no status change)
  cost_usd REAL,                           -- nullable, populated later from billing
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_cached INTEGER,
  notes TEXT
);

CREATE INDEX idx_worker_runs_task ON worker_runs(task_id);
CREATE INDEX idx_worker_runs_started ON worker_runs(started_at);

-- Event log (orchestrator-level events: cycle starts, file conflicts, stop reasons)
CREATE TABLE orchestrator_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,                      -- 'auto-start','cycle','spawn','conflict-block','stop','heartbeat'
  payload_json TEXT
);

CREATE INDEX idx_events_ts ON orchestrator_events(ts);
CREATE INDEX idx_events_kind ON orchestrator_events(kind);
```

## Store layer API (TypeScript signatures)

```ts
// scripts/lib/store.ts
export interface TaskStore {
  // Sync operations
  syncFromMarkdown(): Promise<{ added: number; updated: number; removed: number }>;
  syncStatusToMarkdown(taskId: string): Promise<void>;

  // Read
  getTask(id: string): Task | undefined;
  listTasks(filter?: { phase?: number; status?: TaskStatus }): Task[];
  ready(filter?: TaskFilter): Task[];
  countByStatus(): Record<TaskStatus, number>;
  filesForTask(id: string): string[];
  conflictsForBatch(toSpawn: string[], wipIds: string[]): Conflict[];

  // Write
  setStatus(id: string, status: TaskStatus, detail: string): void;
  recordRunStart(taskId: string, paneId: string, actualModel: string): number; // returns run_id
  recordRunEnd(runId: number, outcome: RunOutcome, notes?: string): void;
  recordEvent(kind: string, payload?: object): void;
}
```

## Migration strategy

1. **Add `bun:sqlite` import + schema bootstrap** — on first run, create `.orchestrator/state.db` if missing
2. **Add `sync` subcommand** — explicit `bun scripts/orchestrate.ts sync` parses all phase files, upserts to DB
3. **Add a feature flag** `ORCHESTRATOR_USE_SQLITE=1` in env — when set, all read paths go through SQLite instead of markdown
4. **Mirror writes** during transition — every status change writes BOTH markdown and DB so we can flip the read flag without losing data
5. **Cut over** — once verified, remove the markdown-as-source-of-truth code paths

## Reusability path (post-v1)

After this works for wind-accounting, extract to `@mekick/orchestrator-core`:

- `schema.sql` — exported as text constant
- `TaskStore` class — generic over task ID format and phase format
- Adapters for: tmux, zellij, claude-code-spawn, notify channels
- Each consuming project provides:
  - `.orchestrator/config.ts` — task source path, spawn command builder, notify hooks
  - Project-specific markdown format

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Schema changes break across projects | Versioned schema; migration files in `migrations/` |
| Concurrent writers (auto + operator) corrupt DB | SQLite handles this if `journal_mode = WAL` and writes are wrapped in transactions |
| Markdown drift from DB | `sync` is idempotent + `validate` command compares both sides |
| `.orchestrator/` accidentally committed | Add to `.gitignore` upfront |

## Sonnet implementation checklist

When T-99.2 is spawned (after this design is approved):

- [ ] Create `.orchestrator/` directory + add to `.gitignore`
- [ ] Write `scripts/lib/store.ts` implementing `TaskStore` with `bun:sqlite`
- [ ] Add `cmdSync` to `scripts/orchestrate.ts`
- [ ] Refactor `parseAllTasks` calls to go through `store.listTasks()` when feature flag set
- [ ] Mirror `setStatus` writes to both markdown + DB
- [ ] Add `cmdHistory` subcommand: print past 20 worker runs with duration
- [ ] Smoke test: sync → spawn → done → query history
- [ ] README in `docs/setup/sqlite-orchestrator-running.md`

## Out of scope (Sonnet should NOT do without further design)

- Multi-project package extraction (separate effort)
- Anthropic billing API integration for cost field
- DB-backed locking (use markdown as semaphore for now)
- Web UI for browsing tasks

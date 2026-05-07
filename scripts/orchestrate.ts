#!/usr/bin/env bun
// WIND Accounting — Parallel Task Orchestrator
// Reads specs/tasks/phase-*.md, parses tasks, manages zellij session of child Claude sessions.

import { readdir, readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import Langfuse from 'langfuse';

// Langfuse is optional — if keys are missing we no-op every call.
const lf: Langfuse | null =
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST ?? 'http://localhost:3030',
        flushAt: 5,
        flushInterval: 10_000,
      })
    : null;

const ROOT = '/Users/mekick/code/PROTOTYPE/prototype-accounting';
const TASKS_DIR = join(ROOT, 'specs/tasks');
const TEMPLATE_PATH = join(ROOT, 'scripts/task-prompt.template.md');
const SESSION = 'wind-acc';
const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL ?? '3', 10);

// Safeguard #1 — Per-task budget caps.
// --max-budget-usd is passed to each spawned claude worker. When hit, the
// worker exits non-zero. Safeguard #2 dead-pane scan detects it and marks the
// task Blocked. For DeepSeek the flag is passed but may no-op (different
// provider billing); Safeguard #2 wall-clock timeout is the real backstop.
const BUDGET_USD = {
  Opus:     parseFloat(process.env.BUDGET_USD_OPUS     ?? '3.00'),
  Sonnet:   parseFloat(process.env.BUDGET_USD_SONNET   ?? '1.00'),
  DeepSeek: parseFloat(process.env.BUDGET_USD_DEEPSEEK ?? '0.50'),
} as const;

// Safeguard #2 — Stale-WIP detection + wall-clock timeout.
// WIP_TIMEOUT_MIN: how long a task may stay WIP before it is killed and Blocked.
// WIP_STARTED_FILE: per-task epoch-ms timestamps, written at spawn, cleared on Done/Reset.
const WIP_TIMEOUT_MIN = {
  Opus:     parseInt(process.env.WIP_TIMEOUT_MIN_OPUS     ?? '90', 10),
  Sonnet:   parseInt(process.env.WIP_TIMEOUT_MIN_SONNET   ?? '60', 10),
  DeepSeek: parseInt(process.env.WIP_TIMEOUT_MIN_DEEPSEEK ?? '30', 10),
} as const;
const WIP_STARTED_FILE = join(ROOT, '.orchestrator.wip-started.json');

// Safeguard #3 — Pane output error scan.
// Worker stdout+stderr is tee'd to per-task log files. Each cycle we tail
// the last PANE_SCAN_TAIL_LINES lines and pattern-match for API/auth/billing
// errors. Fatal matches kill the worker and mark it Blocked. Warn matches
// increment a counter and escalate to fatal at 3 consecutive cycles.
const LOG_DIR = process.env.WORKER_LOG_DIR ?? '/tmp/wind-acc-orchestrator';
const PANE_SCAN_TAIL_LINES = 500;

// Init log dir synchronously at startup so spawnInPane can always write.
mkdirSync(LOG_DIR, { recursive: true });
mkdirSync(join(LOG_DIR, 'archive'), { recursive: true });

interface ErrorPattern {
  name: string;
  re: RegExp;
  severity: 'fatal' | 'warn';
  hint: string;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // Auth / billing — fatal, user must intervene
  {
    name: 'deepseek_payment',
    re: /(insufficient[_ ]?balance|payment[_ ]?required|402)/i,
    severity: 'fatal',
    hint: 'DeepSeek out of credit — top up at platform.deepseek.com',
  },
  {
    name: 'auth_invalid',
    re: /(invalid[_ ]api[_ ]key|unauthorized|401|authentication[_ ]failed)/i,
    severity: 'fatal',
    hint: 'API key rejected — check ~/.config or env',
  },
  {
    name: 'rate_limit_persistent',
    re: /(rate[_ ]?limit|429).+(retry|exceeded)/i,
    severity: 'warn',
    hint: 'Rate limited; if persists across multiple cycles, escalate',
  },
  {
    name: 'quota_exhausted',
    re: /(quota[_ ]exceeded|usage[_ ]?limit|insufficient[_ ]quota)/i,
    severity: 'fatal',
    hint: 'Provider quota — upgrade plan or wait for reset',
  },
  // Tool / runtime — usually fatal for the task
  {
    name: 'budget_killed',
    re: /max[_ ]?budget[_ ]?(exceeded|reached)/i,
    severity: 'fatal',
    hint: 'Hit --max-budget-usd cap from Safeguard #1',
  },
  {
    name: 'prisma_connect',
    re: /can'?t reach database server|ECONNREFUSED.+5432/i,
    severity: 'fatal',
    hint: 'Postgres not running — docker compose up -d postgres',
  },
  {
    name: 'oom',
    re: /JavaScript heap out of memory|FATAL ERROR[\s\S]*allocation failed/i,
    severity: 'fatal',
    hint: 'Worker OOM — task too large; split or escalate model',
  },
  // Synthetic loop detection marker (injected by heuristic below)
  {
    name: 'output_loop',
    re: /__loop_detected__/,
    severity: 'fatal',
    hint: 'Worker is repeating itself — check pane',
  },
];

/** Pattern names that halt the entire auto loop when matched (not just the task). */
const HALT_PATTERNS = new Set(['auth_invalid', 'quota_exhausted', 'deepseek_payment']);

/** Per-task warn counters (in-memory, resets on Done/Reset). */
const warnCounters = new Map<string, Map<string, number>>();

type Status = 'todo' | 'wip' | 'done' | 'blocked';
type Model = 'Opus' | 'Sonnet' | 'DeepSeek';

// Runtime override: when DEEPSEEK_FALLBACK is set to Sonnet or Opus, tasks
// planned as DeepSeek run on the fallback model instead. The task spec
// (Planned Model) stays as DeepSeek — only execution changes. Unset to
// resume normal DeepSeek routing.
const DEEPSEEK_FALLBACK = (process.env.DEEPSEEK_FALLBACK ?? '').trim();

function effectiveModel(planned: Model): Model {
  if (planned === 'DeepSeek' && (DEEPSEEK_FALLBACK === 'Sonnet' || DEEPSEEK_FALLBACK === 'Opus')) {
    return DEEPSEEK_FALLBACK as Model;
  }
  return planned;
}

interface Task {
  id: string;
  phase: number;
  name: string;
  file: string;
  status: Status;
  model: Model;
  files: string;
  reads: string;
  depends: string[];
  blocks: string;
  doneWhen: string;
  /** Per-task budget override from spec field `Budget USD: N.NN`. */
  budgetUsd?: number;
  /** Per-task wall-clock timeout override from spec field `Timeout Min: N`. */
  timeoutMin?: number;
}

// ---------------- Parser ----------------

async function parseAllTasks(): Promise<Task[]> {
  const out: Task[] = [];
  const files = (await readdir(TASKS_DIR))
    .filter((f) => /^phase-\d+-.*\.md$/.test(f))
    .map((f) => join(TASKS_DIR, f))
    .sort();

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const phase = parseInt(basename(file).match(/^phase-(\d+)-/)![1], 10);

    // Split on `### T-N.M — Name`
    const parts = content.split(/^### (T-\d+\.\d+)\s+—\s+(.+)$/m);
    // parts[0] = preamble; then triples of [id, name, body]
    for (let i = 1; i < parts.length; i += 3) {
      const id = parts[i];
      const name = parts[i + 1].trim();
      const body = parts[i + 2];

      const statusMatch = body.match(/^- \[(.)\] \*\*Status:\*\*/m);
      const status: Status = !statusMatch
        ? 'todo'
        : statusMatch[1] === 'x'
          ? 'done'
          : statusMatch[1] === '~'
            ? 'wip'
            : statusMatch[1] === '!'
              ? 'blocked'
              : 'todo';

      const model = (body.match(/^- \*\*Model:\*\* (\S+)/m)?.[1] ?? 'Sonnet') as Model;
      const files_ = body.match(/^- \*\*Files:\*\* (.+)$/m)?.[1].trim() ?? '';
      const reads = body.match(/^- \*\*Reads:\*\* (.+)$/m)?.[1].trim() ?? '';
      const depRaw = body.match(/^- \*\*Depends on:\*\* (.+)$/m)?.[1].trim() ?? '—';
      const blocks = body.match(/^- \*\*Blocks:\*\* (.+)$/m)?.[1].trim() ?? '';
      const doneWhen = body.match(/^- \*\*Done when:\*\* (.+)$/m)?.[1].trim() ?? '';
      const budgetRaw = body.match(/^- \*\*Budget USD:\*\* ([\d.]+)/m)?.[1];
      const budgetUsd = budgetRaw ? parseFloat(budgetRaw) : undefined;
      const timeoutRaw = body.match(/^- \*\*Timeout Min:\*\* (\d+)/m)?.[1];
      const timeoutMin = timeoutRaw ? parseInt(timeoutRaw, 10) : undefined;

      out.push({
        id,
        phase,
        name,
        file,
        status,
        model,
        files: files_,
        reads,
        depends: parseDeps(depRaw),
        blocks,
        doneWhen,
        budgetUsd,
        timeoutMin,
      });
    }
  }
  return out;
}

function parseDeps(raw: string): string[] {
  if (raw === '—' || raw === '-' || raw.toLowerCase() === 'none') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

// Extract file paths from a task's Files: field. Files are wrapped in
// backticks; annotations like (NEW) / (EDIT) are stripped.
function extractFiles(filesField: string): string[] {
  if (!filesField) return [];
  return [...filesField.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
}

// Two tasks "conflict" if they list the same backticked path. This is the
// minimum bar to prevent obvious lockfile / shared-package races. Globs and
// directory-level overlap are NOT detected — keep file lists in task specs
// at file-path granularity for this to work.
function fileConflicts(
  toSpawn: Task[],
  wipTasks: Task[],
): Array<{ taskId: string; file: string; ownerId: string; reason: 'wip' | 'batch' }> {
  const conflicts: Array<{ taskId: string; file: string; ownerId: string; reason: 'wip' | 'batch' }> = [];
  const wipFiles = new Map<string, string>();
  for (const t of wipTasks) {
    for (const f of extractFiles(t.files)) wipFiles.set(f, t.id);
  }
  const batchFiles = new Map<string, string>();
  for (const t of toSpawn) {
    for (const f of extractFiles(t.files)) {
      if (wipFiles.has(f)) {
        conflicts.push({ taskId: t.id, file: f, ownerId: wipFiles.get(f)!, reason: 'wip' });
      }
      const prior = batchFiles.get(f);
      if (prior && prior !== t.id) {
        conflicts.push({ taskId: t.id, file: f, ownerId: prior, reason: 'batch' });
      } else {
        batchFiles.set(f, t.id);
      }
    }
  }
  return conflicts;
}

// ---------------- Ready ----------------

function depSatisfied(dep: string, tasks: Task[]): boolean {
  const phMatch = dep.match(/^Phase\s+(\d+)/i);
  if (phMatch) {
    const ph = parseInt(phMatch[1], 10);
    const phTasks = tasks.filter((t) => t.phase === ph);
    return phTasks.length > 0 && phTasks.every((t) => t.status === 'done');
  }
  const idMatch = dep.match(/T-\d+\.\d+/);
  if (!idMatch) return true;
  const ref = tasks.find((t) => t.id === idMatch[0]);
  return ref?.status === 'done';
}

function ready(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => t.status === 'todo')
    .filter((t) => t.depends.every((d) => depSatisfied(d, tasks)))
    .sort((a, b) => a.phase - b.phase || cmpId(a.id, b.id));
}

function cmpId(a: string, b: string): number {
  const pa = a.match(/T-(\d+)\.(\d+)/)!;
  const pb = b.match(/T-(\d+)\.(\d+)/)!;
  return parseInt(pa[1]) - parseInt(pb[1]) || parseInt(pa[2]) - parseInt(pb[2]);
}

// ---------------- Status update ----------------

async function setStatus(task: Task, newStatus: Status, suffix: string): Promise<void> {
  const content = await readFile(task.file, 'utf-8');
  const marker =
    newStatus === 'done' ? 'x' : newStatus === 'wip' ? '~' : newStatus === 'blocked' ? '!' : ' ';
  const heading = `### ${task.id} `;
  const headIdx = content.indexOf(heading);
  if (headIdx === -1) throw new Error(`heading not found: ${task.id}`);

  // Find first status line after heading (within next ~400 chars)
  const slice = content.slice(headIdx, headIdx + 600);
  const statusRe = /- \[.\] \*\*Status:\*\*[^\n]*/;
  const m = slice.match(statusRe);
  if (!m) throw new Error(`no status line under ${task.id}`);

  const newLine = `- [${marker}] **Status:** ${suffix}`;
  const updated =
    content.slice(0, headIdx) +
    slice.replace(statusRe, newLine) +
    content.slice(headIdx + slice.length);
  await writeFile(task.file, updated);
}

// ---------------- WIP tracking (Safeguard #2) ----------------

/** Read the WIP-started JSON file; return empty object on any error. */
async function readWipStarted(): Promise<Record<string, number>> {
  try {
    const raw = await readFile(WIP_STARTED_FILE, 'utf-8');
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Atomically write the WIP-started JSON file (write tmp → rename). */
async function writeWipStarted(data: Record<string, number>): Promise<void> {
  const tmp = `${WIP_STARTED_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, WIP_STARTED_FILE);
}

/** Record that a task just started WIP (epoch ms). */
async function recordWipStart(taskId: string): Promise<void> {
  const data = await readWipStarted();
  data[taskId] = Date.now();
  await writeWipStarted(data);
}

/** Remove a task's WIP-started entry (call on Done / Blocked / Todo-reset). */
async function clearWipStart(taskId: string): Promise<void> {
  const data = await readWipStarted();
  if (!(taskId in data)) return;
  delete data[taskId];
  await writeWipStarted(data);
}

/**
 * Prune WIP-started entries whose tasks are no longer marked WIP in the spec.
 * Run at startup to handle crashes mid-spawn.
 */
async function pruneWipStarted(tasks: Task[]): Promise<void> {
  const data = await readWipStarted();
  const wipIds = new Set(tasks.filter((t) => t.status === 'wip').map((t) => t.id));
  let changed = false;
  for (const id of Object.keys(data)) {
    if (!wipIds.has(id)) {
      delete data[id];
      changed = true;
    }
  }
  if (changed) await writeWipStarted(data);
}

interface WipHealth {
  orphans: Task[];
  timeouts: Task[];
}

/**
 * Classify WIP tasks as orphan (pane gone) or timed-out (runtime > model cap).
 * Healthy tasks are ignored.
 */
async function scanWipHealth(tasks: Task[]): Promise<WipHealth> {
  const wipTasks = tasks.filter((t) => t.status === 'wip');
  if (wipTasks.length === 0) return { orphans: [], timeouts: [] };

  const started = await readWipStarted();
  const liveTabs = listWindows();
  const now = Date.now();

  const orphans: Task[] = [];
  const timeouts: Task[] = [];

  for (const t of wipTasks) {
    const paneAlive = liveTabs.includes(t.id);
    if (!paneAlive) {
      orphans.push(t);
      continue;
    }
    // Check wall-clock timeout
    const startMs = started[t.id];
    if (startMs !== undefined) {
      const eff = effectiveModel(t.model);
      const capMin = t.timeoutMin ?? WIP_TIMEOUT_MIN[eff];
      const elapsedMin = (now - startMs) / 60_000;
      if (elapsedMin > capMin) {
        timeouts.push(t);
      }
    }
  }

  return { orphans, timeouts };
}

/** Reset an orphaned task back to Todo and clear its WIP entry. */
async function resetToTodo(task: Task): Promise<void> {
  await setStatus(task, 'todo', 'Not started');
  await clearWipStart(task.id);
  console.log(`[wip-health] ${task.id}: orphaned (pane gone) — reset to Todo`);
  notify('info', task.id, `orphaned (pane gone) — reset to Todo`);
  lf && autoTrace?.event({
    name: 'task:orphan_reset',
    metadata: { taskId: task.id, model: task.model },
  });
}

/** Kill a timed-out task: close its zellij tab, mark Blocked, notify. */
async function killAndBlock(task: Task, reason: string, dryRun = false): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const eff = effectiveModel(task.model);
  const capMin = task.timeoutMin ?? WIP_TIMEOUT_MIN[eff];
  const started = await readWipStarted();
  const startMs = started[task.id];
  const elapsedMin = startMs ? Math.round((Date.now() - startMs) / 60_000) : '?';
  const blockMsg = `Blocked (${today}) — ${reason} (${elapsedMin}m > ${capMin}m cap)`;

  if (!dryRun) {
    // Close the zellij tab by name (the tab is named after the task id)
    spawnSync(
      'zellij',
      ['--session', SESSION, 'action', 'close-tab', '--name', task.id],
      { encoding: 'utf-8' },
    );
  }

  await setStatus(task, 'blocked', blockMsg);
  await clearWipStart(task.id);
  console.log(`[wip-health] ${task.id}: killed + Blocked — ${reason}`);
  notify('error', task.id, blockMsg);
  lf && autoTrace?.event({
    name: 'task:wall_clock_timeout',
    metadata: { taskId: task.id, model: task.model, elapsedMin, capMin, reason },
  });
}

// ---------------- Pane output scan (Safeguard #3) ----------------

/** Strip ANSI escape sequences from a string. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/** Simple djb2 hash used for loop-repetition detection. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

interface ScanHit {
  match: ErrorPattern;
  snippet: string[];
}

/**
 * Read the tail of the worker log and scan for error patterns.
 * Also runs a loop-repetition heuristic (≥3 identical 20-line windows).
 * Returns the first fatal hit, or warn hit if no fatal found, or null if clean.
 */
function scanPaneOutput(taskId: string): ScanHit | null {
  const logPath = join(LOG_DIR, `${taskId}.log`);
  let raw: string;
  try {
    raw = readFileSync(logPath, 'utf-8');
  } catch {
    return null; // log not yet written — task just started or no output yet
  }

  const allLines = raw.split('\n');
  const tailLines = allLines.slice(-PANE_SCAN_TAIL_LINES);

  // Loop-detection heuristic: take last 200 lines, slide 20-line windows,
  // if ≥3 windows share the same hash inject a synthetic marker.
  const loopLines = tailLines.slice(-200);
  const windowHashes = new Map<number, number>();
  const windowSize = 20;
  for (let i = 0; i <= loopLines.length - windowSize; i++) {
    const windowHash = djb2(loopLines.slice(i, i + windowSize).join('\n'));
    windowHashes.set(windowHash, (windowHashes.get(windowHash) ?? 0) + 1);
  }
  const hasLoop = [...windowHashes.values()].some((count) => count >= 3);
  const scanBuffer = tailLines.map(stripAnsi);
  if (hasLoop) scanBuffer.push('__loop_detected__');

  // Scan for patterns
  let warnHit: ScanHit | null = null;
  for (const pattern of ERROR_PATTERNS) {
    for (let i = 0; i < scanBuffer.length; i++) {
      if (pattern.re.test(scanBuffer[i] ?? '')) {
        const snippet = scanBuffer
          .slice(Math.max(0, i - 5), Math.min(scanBuffer.length, i + 3))
          .map((l) => (l ?? '').slice(0, 200));
        const hit: ScanHit = { match: pattern, snippet };
        if (pattern.severity === 'fatal') return hit;
        if (!warnHit) warnHit = hit; // keep first warn
        break;
      }
    }
  }
  return warnHit;
}

/**
 * Handle a warn-level pattern hit. Increments per-task counter;
 * if the same pattern fires 3 consecutive cycles, promotes to fatal (killAndBlock).
 * Returns true if escalated to fatal (caller should not re-check).
 */
async function warnPattern(task: Task, hit: ScanHit): Promise<boolean> {
  const taskCounters = warnCounters.get(task.id) ?? new Map<string, number>();
  warnCounters.set(task.id, taskCounters);
  const prev = taskCounters.get(hit.match.name) ?? 0;
  const next = prev + 1;
  taskCounters.set(hit.match.name, next);

  const snippetText = hit.snippet.join('\n');
  console.log(`[pane-scan] ${task.id} WARN [${hit.match.name}] (${next}x): ${hit.match.hint}`);

  if (next >= 3) {
    // Escalate to fatal
    console.log(`[pane-scan] ${task.id}: escalating ${hit.match.name} warn → fatal after ${next} cycles`);
    notify('error', task.id, `pattern ${hit.match.name} escalated to fatal: ${hit.match.hint}`);
    await killAndBlock(task, `${hit.match.name} (escalated from warn after ${next} cycles): ${hit.match.hint}`);
    taskCounters.delete(hit.match.name);
    return true;
  }

  notify('info', task.id, `pattern ${hit.match.name} warn (${next}/3): ${hit.match.hint}\n${snippetText.slice(0, 300)}`);
  return false;
}

/** Rotate logs older than 24h to ${LOG_DIR}/archive/ (gzip with Bun shell). */
async function rotateLogs(): Promise<void> {
  try {
    const archiveDir = join(LOG_DIR, 'archive');
    await mkdir(archiveDir, { recursive: true });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const files = await readdir(LOG_DIR);
    for (const f of files) {
      if (!f.endsWith('.log')) continue;
      const fullPath = join(LOG_DIR, f);
      try {
        const stat = Bun.file(fullPath);
        const mtime = (await stat.stat()).mtime;
        if (mtime.getTime() < cutoff) {
          const destBase = join(archiveDir, f);
          // Move then gzip; if gzip not available, just move
          spawnSync('sh', ['-c', `gzip -c "${fullPath}" > "${destBase}.gz" && rm "${fullPath}"`], { encoding: 'utf-8' });
        }
      } catch {
        // skip — file may have been removed between readdir and stat
      }
    }
  } catch {
    // never fail the loop on a log rotation error
  }
}

// Reset warn counters for a task when it transitions out of WIP.
function clearWarnCounters(taskId: string): void {
  warnCounters.delete(taskId);
}

// ---------------- Zellij ----------------

function zellijAvailable(): boolean {
  return spawnSync('which', ['zellij']).status === 0;
}

function sessionExists(): boolean {
  const r = spawnSync('zellij', ['list-sessions', '--short'], { encoding: 'utf-8' });
  return r.status === 0 && r.stdout.split('\n').some((l) => l.trim() === SESSION);
}

function ensureSession(): void {
  if (sessionExists()) return;
  // Zellij has no --detached flag; spawn without a TTY so the server starts headless.
  const child = spawn('zellij', ['--session', SESSION], { detached: true, stdio: 'ignore' });
  child.unref();
  spawnSync('sleep', ['1']);
}

function listWindows(): string[] {
  if (!zellijAvailable() || !sessionExists()) return [];
  const r = spawnSync('zellij', ['--session', SESSION, 'action', 'query-tab-names'], {
    encoding: 'utf-8',
  });
  return r.stdout.trim().split('\n').filter((n) => n.startsWith('T-'));
}

function providerFor(model: Model, task: Task): { alias: string; flags: string } {
  // -p (print mode): worker runs the prompt to completion then exits. Without
  // this, claude stays in interactive mode after marking the task done — the
  // process lingers waiting for the next prompt, eating credits and creating
  // orphan workers across sessions.
  // bypassPermissions: workers are sandboxed to one task spec, run in their
  // own zellij tab, and the template forbids git commits / cross-task edits.
  // acceptEdits stalled workers on every bash command (verification curls,
  // dev-server starts, prisma migrate). Bypass keeps them productive — the
  // prompt template is the actual safety boundary.
  //
  // Safeguard #1: --max-budget-usd hard-caps each worker's API spend. For
  // DeepSeek (different billing provider), the flag is passed but may no-op —
  // Safeguard #2 wall-clock timeout is the backstop for DeepSeek workers.
  const budget = task.budgetUsd ?? BUDGET_USD[model];
  const budgetFlag = ` --max-budget-usd ${budget.toFixed(2)}`;
  if (model === 'DeepSeek') {
    return { alias: 'ai-deepseek', flags: `-p --permission-mode bypassPermissions${budgetFlag}` };
  }
  const cliModel = model === 'Opus' ? 'opus' : 'sonnet';
  return {
    alias: 'ai-anthropic',
    flags: `-p --model ${cliModel} --permission-mode bypassPermissions${budgetFlag}`,
  };
}

function buildLaunchCommand(task: Task): string {
  const today = new Date().toISOString().slice(0, 10);
  const eff = effectiveModel(task.model);
  const provider = providerFor(eff, task);
  const resolvedBudget = (task.budgetUsd ?? BUDGET_USD[eff]).toFixed(2);
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const prompt = template
    .replaceAll('{{ID}}', task.id)
    .replaceAll('{{PHASE_FILE}}', task.file)
    .replaceAll('{{MODEL}}', eff)
    .replaceAll('{{TODAY}}', today)
    .replaceAll('{{BUDGET_USD}}', resolvedBudget);

  // Single-quote escape for shell
  const promptQuoted = `'${prompt.replace(/'/g, `'\\''`)}'`;
  return `cd ${ROOT} && ${provider.alias} && claude ${provider.flags} ${promptQuoted}`;
}

function notify(type: 'start' | 'done' | 'blocked' | 'error' | 'info', taskId: string, message: string): void {
  // Fire-and-forget — notify.ts no-ops if env not configured.
  spawnSync('bun', [join(ROOT, 'scripts/notify.ts'), type, taskId, message], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

// Active spans keyed by task id — opened on spawn, closed on done/blocked.
const activeSpans = new Map<string, ReturnType<ReturnType<Langfuse['trace']>['span']>>();
let autoTrace: ReturnType<Langfuse['trace']> | null = null;

function spawnInPane(task: Task, dryRun: boolean): string {
  const cmd = buildLaunchCommand(task);
  // Safeguard #3: tee worker output to per-task log for error scanning.
  // tee's exit status masks the underlying exit (fine — we use log content, not exit code).
  const logPath = join(LOG_DIR, `${task.id}.log`);
  const wrappedCmd = `${cmd} 2>&1 | tee ${logPath}; exec zsh -i`;
  if (dryRun) {
    console.log(`# ${task.id} (${task.model}) — would run in zellij:${SESSION}:${task.id}`);
    console.log(`# log: ${logPath}`);
    console.log(wrappedCmd);
    return cmd;
  }
  ensureSession();
  // Launch zsh -i so ~/.zshrc aliases (ai-anthropic etc.) are available.
  // The wrappedCmd already ends with `; exec zsh -i` so the tab stays open.
  const result = spawnSync(
    'zellij',
    ['--session', SESSION, 'action', 'new-tab', '--name', task.id, '--', 'zsh', '-i', '-c', wrappedCmd],
    { encoding: 'utf-8' },
  );
  if (result.status !== 0) throw new Error(`Failed to create zellij tab for ${task.id}: ${result.stderr}`);
  return cmd;
}

// ---------------- Commands ----------------

async function cmdReady(): Promise<void> {
  const tasks = await parseAllTasks();
  const r = ready(tasks);
  const counts = countByStatus(tasks);
  if (r.length === 0) {
    console.log(
      `No ready tasks. done=${counts.done} wip=${counts.wip} blocked=${counts.blocked} todo=${counts.todo}`,
    );
    if (counts.wip > 0) {
      console.log(
        `In progress: ${tasks.filter((t) => t.status === 'wip').map((t) => t.id).join(', ')}`,
      );
    }
    if (counts.blocked > 0) {
      console.log(
        `Blocked: ${tasks.filter((t) => t.status === 'blocked').map((t) => t.id).join(', ')}`,
      );
    }
    return;
  }
  console.log(`Ready tasks (${r.length}):\n`);
  for (const t of r) {
    console.log(`  ${t.id}  [${t.model.padEnd(8)}]  ${t.name}`);
    if (t.files) console.log(`         files:  ${truncate(t.files, 100)}`);
    if (t.depends.length > 0) {
      console.log(`         deps:   ${t.depends.join(', ')} (all done)`);
    }
    console.log('');
  }
  const slots = MAX_PARALLEL - counts.wip;
  console.log(
    `In-progress: ${counts.wip}/${MAX_PARALLEL} | Slots free: ${slots} | Blocked: ${counts.blocked} | Done: ${counts.done}/${tasks.length}`,
  );
  console.log(`To launch: bun scripts/orchestrate.ts spawn <T-X.Y> [<T-X.Y> ...]`);
}

async function cmdSpawn(ids: string[], dryRun: boolean): Promise<void> {
  if (!zellijAvailable() && !dryRun) {
    console.error('zellij not installed. Run: brew install zellij');
    process.exit(1);
  }
  const tasks = await parseAllTasks();
  const counts = countByStatus(tasks);
  const remaining = MAX_PARALLEL - counts.wip;
  if (!dryRun && ids.length > remaining) {
    console.error(
      `Cap reached. wip=${counts.wip}, MAX_PARALLEL=${MAX_PARALLEL}, can spawn at most ${remaining} more.`,
    );
    process.exit(1);
  }

  // Resolve all requested tasks before spawning so we can check file conflicts
  // across the whole batch + against current WIP. Skip tasks that aren't
  // valid; the conflict check runs only on the survivors.
  const candidates: Task[] = [];
  for (const id of ids) {
    const t = tasks.find((x) => x.id === id);
    if (!t) {
      console.error(`Task not found: ${id}`);
      continue;
    }
    if (t.status !== 'todo') {
      console.error(`${id}: status is ${t.status}, skipping`);
      continue;
    }
    if (!t.depends.every((d) => depSatisfied(d, tasks))) {
      console.error(`${id}: deps not satisfied: ${t.depends.join(', ')}`);
      continue;
    }
    candidates.push(t);
  }

  const force = process.argv.includes('--force');
  const wip = tasks.filter((t) => t.status === 'wip');
  const conflicts = fileConflicts(candidates, wip);
  if (conflicts.length > 0) {
    console.error(`File conflicts detected (${conflicts.length}):`);
    for (const c of conflicts) {
      const where = c.reason === 'wip' ? 'currently WIP' : 'in this batch';
      console.error(`  ${c.taskId} ↔ ${c.ownerId} (${where}): ${c.file}`);
    }
    if (!force) {
      console.error(
        '\nRefusing to spawn. Re-run with --force to override (risk: lockfile/migration races, lost edits).',
      );
      process.exit(1);
    }
    console.error('--force given; proceeding anyway.');
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const t of candidates) {
    const id = t.id;
    if (!dryRun) {
      await setStatus(t, 'wip', `In progress (${today}, pane ${SESSION}:${id})`);
      await recordWipStart(id);
    }
    spawnInPane(t, dryRun);
    if (!dryRun) {
      const eff = effectiveModel(t.model);
      const modelTag = eff === t.model ? eff : `${t.model} → ${eff}`;
      console.log(`Spawned ${id} (${modelTag}) in zellij tab '${SESSION}:${id}'`);
      notify('start', t.id, `${t.name} [${modelTag}]`);
      if (lf) {
        const parent = autoTrace ?? lf.trace({ name: `spawn:${id}`, sessionId: SESSION });
        const span = parent.span({
          name: id,
          input: { task: t.name, model: modelTag, files: t.files, phase: t.phase },
          metadata: { doneWhen: t.doneWhen, blocks: t.blocks },
        });
        activeSpans.set(id, span);
      }
    }
  }
  if (!dryRun) {
    console.log('');
    console.log(`Attach: zellij attach ${SESSION}`);
    console.log('  Ctrl-t [arrows]   switch tabs');
    console.log('  Ctrl-\\ d          detach (tabs keep running)');
  }
}

async function cmdStatus(): Promise<void> {
  const tasks = await parseAllTasks();
  const counts = countByStatus(tasks);
  console.log(
    `Total: ${tasks.length} | done=${counts.done} wip=${counts.wip} blocked=${counts.blocked} todo=${counts.todo}`,
  );
  const wip = tasks.filter((t) => t.status === 'wip');
  if (wip.length > 0) {
    console.log('\nIn progress:');
    for (const t of wip) console.log(`  ${t.id}  [${t.model}]  ${t.name}`);
  }
  const blocked = tasks.filter((t) => t.status === 'blocked');
  if (blocked.length > 0) {
    console.log('\nBlocked:');
    for (const t of blocked) console.log(`  ${t.id}  [${t.model}]  ${t.name}`);
  }
  if (zellijAvailable() && sessionExists()) {
    const w = listWindows();
    console.log(`\nZellij session '${SESSION}' tabs: ${w.length > 0 ? w.join(', ') : '(none)'}`);
  } else {
    console.log(`\nZellij session '${SESSION}': not running`);
  }
}

async function cmdDone(id: string): Promise<void> {
  const tasks = await parseAllTasks();
  const t = tasks.find((x) => x.id === id);
  if (!t) {
    console.error(`Task not found: ${id}`);
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  await setStatus(t, 'done', `Done (${today})`);
  await clearWipStart(id);
  console.log(`Marked ${id} as done.`);
  notify('done', t.id, t.name);
  const span = activeSpans.get(id);
  if (span) {
    span.end({ output: { status: 'done' }, level: 'DEFAULT' });
    activeSpans.delete(id);
    await lf?.flushAsync();
  }
}

async function cmdSchedule(): Promise<void> {
  const tasks = await parseAllTasks();
  const remaining = new Set(tasks.map((t) => t.id));
  const completed = new Set<string>();
  const waves: Task[][] = [];

  while (remaining.size > 0) {
    const wave: Task[] = [];
    for (const id of remaining) {
      const t = tasks.find((x) => x.id === id)!;
      const ok = t.depends.every((d) => {
        const ph = d.match(/^Phase\s+(\d+)/i);
        if (ph) {
          return tasks
            .filter((x) => x.phase === parseInt(ph[1], 10))
            .every((x) => completed.has(x.id));
        }
        const im = d.match(/T-\d+\.\d+/);
        if (!im) return true;
        return completed.has(im[0]);
      });
      if (ok) wave.push(t);
    }
    if (wave.length === 0) {
      console.error('Cycle or unresolved deps; remaining:', [...remaining].join(', '));
      break;
    }
    wave.sort((a, b) => a.phase - b.phase || cmpId(a.id, b.id));
    waves.push(wave);
    for (const t of wave) {
      remaining.delete(t.id);
      completed.add(t.id);
    }
  }

  const lines: string[] = [];
  lines.push('# Build Schedule');
  lines.push('');
  lines.push(
    `Computed ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Regenerate via \`bun scripts/orchestrate.ts schedule\`.`,
  );
  lines.push('');
  lines.push(
    `Pure topological grouping — wave N can run in parallel ONLY after wave N-1 fully completes. **${tasks.length} total tasks across ${waves.length} waves.**`,
  );
  lines.push('');
  lines.push(
    `Caveat: this assumes ALL deps must finish before a task starts. In practice, intra-phase tasks can often start as soon as their *specific* deps land — use \`bun scripts/orchestrate.ts ready\` for the live picture.`,
  );
  lines.push('');
  for (let i = 0; i < waves.length; i++) {
    lines.push(`## Wave ${i + 1} (${waves[i].length} tasks)`);
    lines.push('');
    for (const t of waves[i]) {
      lines.push(`- \`${t.id}\` **${t.model}** — ${t.name}`);
    }
    lines.push('');
  }

  await writeFile(join(TASKS_DIR, 'SCHEDULE.md'), lines.join('\n'));
  console.log(
    `Wrote ${join(TASKS_DIR, 'SCHEDULE.md')} (${waves.length} waves, ${tasks.length} tasks)`,
  );
}

function cmdAttach(): void {
  console.log(`zellij attach ${SESSION}`);
  console.log('  Ctrl-t [arrows]   next / prev tab');
  console.log('  Ctrl-\\ d          detach (tabs keep running)');
}

// ---------------- Auto loop ----------------

interface AutoOpts {
  phases: Set<number> | null;
  include: Set<string> | null;
  exclude: Set<string>;
  maxTasks: number;
  maxCycles: number;
  stopOnBlocked: boolean;
  stopOnError: number;
  delaySec: number;
  dryRun: boolean;
}

const STOP_FILE = join(ROOT, '.orchestrator.stop');

function parseAutoArgs(rest: string[]): AutoOpts {
  function getFlag(name: string): string | undefined {
    const idx = rest.indexOf(name);
    return idx >= 0 ? rest[idx + 1] : undefined;
  }
  const phaseRaw = getFlag('--phase');
  const includeRaw = getFlag('--include');
  const excludeRaw = getFlag('--exclude');
  return {
    phases: phaseRaw ? new Set(phaseRaw.split(',').map((s) => parseInt(s.trim(), 10))) : null,
    include: includeRaw ? new Set(includeRaw.split(',').map((s) => s.trim())) : null,
    exclude: new Set((excludeRaw ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    maxTasks: parseInt(getFlag('--max-tasks') ?? '0', 10) || Infinity,
    maxCycles: parseInt(getFlag('--max-cycles') ?? '0', 10) || Infinity,
    stopOnBlocked: rest.includes('--stop-on-blocked'),
    stopOnError: parseInt(getFlag('--stop-on-error') ?? '3', 10),
    delaySec: Math.max(10, parseInt(getFlag('--delay') ?? '30', 10)),
    dryRun: rest.includes('--dry-run'),
  };
}

function selectBatch(tasks: Task[], slots: number, opts: AutoOpts): Task[] {
  if (slots <= 0) return [];
  const candidates = ready(tasks).filter((t) => {
    if (opts.exclude.has(t.id)) return false;
    if (opts.include) return opts.include.has(t.id);
    if (opts.phases) return opts.phases.has(t.phase);
    return true;
  });
  // Walk in sort order, skip any candidate whose files conflict with already
  // picked or current WIP. Phase ascending then ID ascending is the existing
  // ready() sort order — same priority used in interactive flow.
  const wip = tasks.filter((t) => t.status === 'wip');
  const picked: Task[] = [];
  for (const c of candidates) {
    if (picked.length >= slots) break;
    const trial = [...picked, c];
    if (fileConflicts(trial, wip).length === 0) picked.push(c);
  }
  return picked;
}

async function checkStopFile(): Promise<boolean> {
  try {
    const fs = await import('node:fs/promises');
    await fs.access(STOP_FILE);
    return true;
  } catch {
    return false;
  }
}

async function removeStopFile(): Promise<void> {
  try {
    const fs = await import('node:fs/promises');
    await fs.unlink(STOP_FILE);
  } catch {
    // ignore
  }
}

function notifyAuto(message: string): void {
  spawnSync('bun', [join(ROOT, 'scripts/notify.ts'), 'info', message], {
    cwd: ROOT,
    stdio: 'ignore',
  });
}

// Healthchecks.io heartbeat. Set HEALTHCHECK_PING_URL in env (the full URL
// from your check, e.g. https://hc-ping.com/<uuid>). If unset, no-op.
// Suffixes:
//   /start  — auto loop began
//   (none)  — heartbeat / cycle ok
//   /fail   — abnormal exit (signal / max-cycles / error stop)
//   /<n>    — exit code (not used here, but supported by HC)
async function healthcheckPing(suffix: '' | '/start' | '/fail' = ''): Promise<void> {
  const base = process.env.HEALTHCHECK_PING_URL;
  if (!base) return;
  const url = `${base.replace(/\/+$/, '')}${suffix}`;
  try {
    await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) });
  } catch {
    // never fail the orchestrator on a missed ping
  }
}

async function cmdAuto(rest: string[]): Promise<void> {
  if (!zellijAvailable()) {
    console.error('zellij not installed. Run: brew install zellij');
    process.exit(1);
  }
  const opts = parseAutoArgs(rest);
  console.log('Auto orchestrator starting:');
  console.log(`  phase filter:    ${opts.phases ? [...opts.phases].join(',') : 'all'}`);
  console.log(`  include filter:  ${opts.include ? [...opts.include].join(',') : '—'}`);
  console.log(`  exclude filter:  ${opts.exclude.size > 0 ? [...opts.exclude].join(',') : '—'}`);
  console.log(`  delay:           ${opts.delaySec}s`);
  console.log(`  max tasks:       ${opts.maxTasks === Infinity ? '∞' : opts.maxTasks}`);
  console.log(`  max cycles:      ${opts.maxCycles === Infinity ? '∞' : opts.maxCycles}`);
  console.log(`  stop on blocked: ${opts.stopOnBlocked}`);
  console.log(`  stop file:       ${STOP_FILE}`);
  console.log(`  dry-run:         ${opts.dryRun}`);
  console.log('');

  notifyAuto(
    `🤖 auto started (phase=${opts.phases ? [...opts.phases].join(',') : 'all'}, delay=${opts.delaySec}s)`,
  );
  await healthcheckPing('/start');
  if (lf) {
    autoTrace = lf.trace({
      name: 'auto-orchestrator',
      sessionId: SESSION,
      input: {
        phases: opts.phases ? [...opts.phases] : 'all',
        maxParallel: MAX_PARALLEL,
        delaySec: opts.delaySec,
      },
    });
  }

  // Safeguard #2: Prune stale WIP-started entries from any previous crashed run.
  // This ensures entries for tasks that aren't actually WIP don't skew timeout math.
  {
    const initialTasks = await parseAllTasks();
    await pruneWipStarted(initialTasks);
  }

  let cycleCount = 0;
  let consecutiveEmptyCycles = 0;
  const startedThisRun: string[] = [];
  const seenWip = new Set<string>();
  const seenDone = new Set<string>();
  const seenBlocked = new Set<string>();

  let stopReason = '';

  // Graceful shutdown on Ctrl-C / SIGTERM
  let interrupted = false;
  const onSignal = (sig: string) => {
    interrupted = true;
    stopReason = `signal ${sig}`;
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  while (!interrupted) {
    cycleCount += 1;
    if (cycleCount > opts.maxCycles) {
      stopReason = `max-cycles ${opts.maxCycles} reached`;
      break;
    }
    if (await checkStopFile()) {
      stopReason = 'stop file present';
      await removeStopFile();
      break;
    }

    let tasks = await parseAllTasks();
    let counts = countByStatus(tasks);

    // Safeguard #2 — scan WIP health: orphans (pane gone) and wall-clock timeouts.
    // Run before slot/batch computation so counts reflect any resets/kills.
    if (!opts.dryRun) {
      const health = await scanWipHealth(tasks);
      for (const t of health.orphans) {
        await resetToTodo(t);
        clearWarnCounters(t.id);
      }
      for (const t of health.timeouts) {
        await killAndBlock(t, 'wall-clock timeout');
        clearWarnCounters(t.id);
      }
      if (health.orphans.length > 0 || health.timeouts.length > 0) {
        // Re-parse so WIP count is accurate before slot calc
        tasks = await parseAllTasks();
        counts = countByStatus(tasks);
      }
    }

    // Safeguard #3 — scan pane output for API/auth/billing/runtime errors.
    // Runs after Safeguard #2 (which may have already handled some tasks).
    if (!opts.dryRun) {
      const wipNow = tasks.filter((t) => t.status === 'wip');
      let needsReparse = false;
      for (const t of wipNow) {
        if (interrupted) break;
        const hit = scanPaneOutput(t.id);
        if (!hit) continue;
        if (hit.match.severity === 'fatal') {
          await killAndBlock(t, `${hit.match.name}: ${hit.match.hint}`);
          clearWarnCounters(t.id);
          needsReparse = true;
          lf && autoTrace?.event({
            name: 'task:error_pattern_matched',
            metadata: { taskId: t.id, pattern: hit.match.name, hint: hit.match.hint, snippet: hit.snippet.join('\n').slice(0, 500) },
          });
          notify('error', t.id, `${hit.match.name}: ${hit.match.hint}\n${hit.snippet.join('\n').slice(0, 300)}`);
          if (HALT_PATTERNS.has(hit.match.name)) {
            stopReason = `API failure on ${t.id} (${hit.match.name}): ${hit.match.hint}`;
            interrupted = true;
            break;
          }
        } else {
          const escalated = await warnPattern(t, hit);
          if (escalated) {
            needsReparse = true;
            lf && autoTrace?.event({
              name: 'task:error_pattern_matched',
              metadata: { taskId: t.id, pattern: hit.match.name, hint: hit.match.hint, escalated: true },
            });
          }
        }
      }
      if (needsReparse) {
        tasks = await parseAllTasks();
        counts = countByStatus(tasks);
      }
    }

    // Track transitions for telemetry / done counter.
    // Also clear WIP-started entries + warn counters when a worker writes Done or Blocked itself.
    for (const t of tasks) {
      if (t.status === 'done' && !seenDone.has(t.id)) {
        seenDone.add(t.id);
        if (!opts.dryRun) { await clearWipStart(t.id); clearWarnCounters(t.id); }
      }
      if (t.status === 'blocked' && !seenBlocked.has(t.id)) {
        seenBlocked.add(t.id);
        if (!opts.dryRun) { await clearWipStart(t.id); clearWarnCounters(t.id); }
      }
      if (t.status === 'wip' && !seenWip.has(t.id)) seenWip.add(t.id);
    }

    if (counts.done === tasks.length) {
      stopReason = 'all tasks done';
      break;
    }
    if (counts.wip === 0 && ready(tasks).length === 0) {
      stopReason = 'no ready tasks and no WIP — nothing to progress';
      break;
    }
    if (opts.stopOnBlocked && counts.blocked > 0) {
      stopReason = `blocked task detected (${counts.blocked})`;
      break;
    }
    const doneSinceStart = startedThisRun.filter((id) =>
      tasks.find((t) => t.id === id && t.status === 'done'),
    ).length;
    if (doneSinceStart >= opts.maxTasks) {
      stopReason = `max-tasks ${opts.maxTasks} reached`;
      break;
    }

    const slots = MAX_PARALLEL - counts.wip;
    const batch = selectBatch(tasks, slots, opts);

    // Distinguish "filter excluded everything" (expected: chain waiting) from
    // "filter let things through but file-conflict blocked all picks" (real
    // problem worth stopping for).
    const filteredCandidates = ready(tasks).filter((t) => {
      if (opts.exclude.has(t.id)) return false;
      if (opts.include) return opts.include.has(t.id);
      if (opts.phases) return opts.phases.has(t.phase);
      return true;
    });

    if (batch.length === 0) {
      const conflictBlocked =
        filteredCandidates.length > 0 && slots > 0 && batch.length === 0;
      if (conflictBlocked) {
        consecutiveEmptyCycles += 1;
      } else {
        consecutiveEmptyCycles = 0;
      }
      if (conflictBlocked && consecutiveEmptyCycles >= opts.stopOnError) {
        stopReason = `${consecutiveEmptyCycles} consecutive cycles where filtered candidates exist but file conflicts blocked all spawn`;
        break;
      }
      console.log(
        `[cycle ${cycleCount}] wip=${counts.wip}/${MAX_PARALLEL} done=${counts.done}/${tasks.length} — no spawn (idle)`,
      );
      autoTrace?.event({ name: 'cycle:idle', metadata: { cycle: cycleCount, wip: counts.wip, done: counts.done, total: tasks.length } });
    } else {
      consecutiveEmptyCycles = 0;
      console.log(
        `[cycle ${cycleCount}] wip=${counts.wip}/${MAX_PARALLEL} done=${counts.done}/${tasks.length} — spawning: ${batch.map((t) => t.id).join(', ')}`,
      );
      autoTrace?.event({ name: 'cycle:spawn', metadata: { cycle: cycleCount, spawned: batch.map((t) => t.id), wip: counts.wip, done: counts.done, total: tasks.length } });
      if (!opts.dryRun) {
        await cmdSpawn(batch.map((t) => t.id), false);
        for (const t of batch) startedThisRun.push(t.id);
      } else {
        console.log('  [dry-run] would spawn above');
      }
    }

    // Heartbeat at end of cycle — proves the loop is still alive
    await healthcheckPing('');

    // Safeguard #3: Rotate old logs to archive (fire-and-forget, non-blocking)
    rotateLogs().catch(() => undefined);

    // Sleep until next cycle, but check stop file mid-sleep at 1s granularity
    for (let i = 0; i < opts.delaySec; i++) {
      if (interrupted) break;
      if (await checkStopFile()) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  console.log('');
  console.log(`Auto stopped: ${stopReason || 'unknown'}`);
  console.log(
    `  cycles=${cycleCount} started=${startedThisRun.length} (${startedThisRun.join(', ') || '—'})`,
  );
  notifyAuto(`🛑 auto stopped: ${stopReason}. cycles=${cycleCount}, started=${startedThisRun.length}`);
  const cleanStops = ['all tasks done', 'no ready tasks and no WIP — nothing to progress', 'stop file present'];
  if (autoTrace) {
    autoTrace.update({
      output: { stopReason, cycles: cycleCount, started: startedThisRun },
      level: cleanStops.includes(stopReason) ? 'DEFAULT' : 'WARNING',
    });
    await lf?.flushAsync();
    autoTrace = null;
  }
  await healthcheckPing(cleanStops.includes(stopReason) ? '' : '/fail');
}

// ---------------- Helpers ----------------

function countByStatus(tasks: Task[]) {
  return {
    done: tasks.filter((t) => t.status === 'done').length,
    wip: tasks.filter((t) => t.status === 'wip').length,
    blocked: tasks.filter((t) => t.status === 'blocked').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
  };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

// ---------------- Main ----------------

const [, , subcommand, ...rest] = process.argv;

(async () => {
  switch (subcommand) {
    case 'ready':
      await cmdReady();
      break;
    case 'spawn': {
      const dryRun = rest.includes('--dry-run');
      const ids = rest.filter((x) => !x.startsWith('--'));
      if (ids.length === 0) {
        console.error('usage: orchestrate.ts spawn <T-X.Y> [<T-X.Y> ...] [--dry-run]');
        process.exit(1);
      }
      await cmdSpawn(ids, dryRun);
      break;
    }
    case 'status':
      await cmdStatus();
      break;
    case 'done':
      if (!rest[0]) {
        console.error('usage: orchestrate.ts done <T-X.Y>');
        process.exit(1);
      }
      await cmdDone(rest[0]);
      break;
    case 'schedule':
      await cmdSchedule();
      break;
    case 'attach':
      cmdAttach();
      break;
    case 'auto':
      await cmdAuto(rest);
      break;
    default:
      console.log('WIND Accounting orchestrator');
      console.log('');
      console.log('Commands:');
      console.log('  ready                          List tasks whose deps are satisfied');
      console.log(
        '  spawn <T-X.Y> ... [--dry-run]  Mark wip + launch in zellij tab(s); cap=MAX_PARALLEL',
      );
      console.log('  status                         Show wip/blocked + zellij tabs');
      console.log('  done <T-X.Y>                   Manually mark a task done');
      console.log('  schedule                       Regenerate specs/tasks/SCHEDULE.md');
      console.log('  attach                         Print zellij attach hint');
      console.log(
        '  auto [flags]                   Continuous spawn loop. See docs/auto-orchestrator.md',
      );
      console.log(
        '                                  Flags: --phase, --include, --exclude, --max-tasks,',
      );
      console.log(
        '                                         --max-cycles, --delay, --stop-on-blocked, --dry-run',
      );
      console.log('');
      console.log(`MAX_PARALLEL=${MAX_PARALLEL} (override via env)`);
      process.exit(subcommand ? 1 : 0);
  }
})();

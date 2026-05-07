#!/usr/bin/env bun
// WIND Accounting — Parallel Task Orchestrator
// Reads specs/tasks/phase-*.md, parses tasks, manages tmux session of child Claude sessions.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = '/Users/mekick/code/PROTOTYPE/prototype-accounting';
const TASKS_DIR = join(ROOT, 'specs/tasks');
const TEMPLATE_PATH = join(ROOT, 'scripts/task-prompt.template.md');
const SESSION = 'wind-acc';
const MAX_PARALLEL = parseInt(process.env.MAX_PARALLEL ?? '3', 10);

type Status = 'todo' | 'wip' | 'done' | 'blocked';
type Model = 'Opus' | 'Sonnet' | 'DeepSeek';

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
      });
    }
  }
  return out;
}

function parseDeps(raw: string): string[] {
  if (raw === '—' || raw === '-' || raw.toLowerCase() === 'none') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
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

// ---------------- Tmux ----------------

function tmuxAvailable(): boolean {
  return spawnSync('which', ['tmux']).status === 0;
}

function sessionExists(): boolean {
  return spawnSync('tmux', ['has-session', '-t', SESSION]).status === 0;
}

function ensureSession(): void {
  if (!sessionExists()) {
    spawnSync('tmux', ['new-session', '-d', '-s', SESSION, '-n', 'orchestrator', 'zsh', '-i']);
  }
}

function listWindows(): string[] {
  if (!tmuxAvailable() || !sessionExists()) return [];
  const r = spawnSync('tmux', ['list-windows', '-t', SESSION, '-F', '#{window_name}'], {
    encoding: 'utf-8',
  });
  return r.stdout.trim().split('\n').filter((n) => n.startsWith('T-'));
}

function providerFor(model: Model): { alias: string; flags: string } {
  // bypassPermissions for spawned workers: they're sandboxed to one task spec,
  // run in their own tmux pane, and template forbids git commits / cross-task
  // edits. acceptEdits stalled workers on every bash command (verification curls,
  // dev-server starts, prisma migrate). Bypass keeps them productive — the
  // prompt template is the actual safety boundary.
  if (model === 'DeepSeek') {
    return { alias: 'ai-deepseek', flags: '--permission-mode bypassPermissions' };
  }
  const cliModel = model === 'Opus' ? 'opus' : 'sonnet';
  return {
    alias: 'ai-anthropic',
    flags: `--model ${cliModel} --permission-mode bypassPermissions`,
  };
}

function buildLaunchCommand(task: Task): string {
  const today = new Date().toISOString().slice(0, 10);
  const template = readFileSync(TEMPLATE_PATH, 'utf-8');
  const prompt = template
    .replaceAll('{{ID}}', task.id)
    .replaceAll('{{PHASE_FILE}}', task.file)
    .replaceAll('{{MODEL}}', task.model)
    .replaceAll('{{TODAY}}', today);

  // Single-quote escape for shell
  const promptQuoted = `'${prompt.replace(/'/g, `'\\''`)}'`;
  const provider = providerFor(task.model);
  return `cd ${ROOT} && ${provider.alias} && claude ${provider.flags} ${promptQuoted}`;
}

function spawnInPane(task: Task, dryRun: boolean): string {
  const cmd = buildLaunchCommand(task);
  if (dryRun) {
    console.log(`# ${task.id} (${task.model}) — would run in tmux:${SESSION}:${task.id}`);
    console.log(cmd);
    return cmd;
  }
  ensureSession();
  // Use -P -F to print the pane ID; window names with dots (e.g. "T-1.4") confuse
  // tmux target parsing because ":" + dotted name is read as window:pane index.
  // Targeting by stable %paneId avoids that ambiguity entirely.
  const newWindow = spawnSync(
    'tmux',
    ['new-window', '-P', '-F', '#{pane_id}', '-t', SESSION, '-n', task.id, 'zsh', '-i'],
    { encoding: 'utf-8' },
  );
  const paneId = newWindow.stdout?.trim();
  if (!paneId) throw new Error(`Failed to create tmux window for ${task.id}`);
  // Give the interactive shell a moment to load aliases from ~/.zshrc.
  spawnSync('sleep', ['0.5']);
  spawnSync('tmux', ['send-keys', '-t', paneId, cmd, 'Enter']);
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
  if (!tmuxAvailable() && !dryRun) {
    console.error('tmux not installed. Run: brew install tmux');
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

  const today = new Date().toISOString().slice(0, 10);
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
    if (!dryRun) {
      await setStatus(t, 'wip', `In progress (${today}, pane ${SESSION}:${id})`);
    }
    spawnInPane(t, dryRun);
    if (!dryRun) {
      console.log(`Spawned ${id} (${t.model}) in tmux pane '${SESSION}:${id}'`);
    }
  }
  if (!dryRun) {
    console.log('');
    console.log(`Attach: tmux attach -t ${SESSION}`);
    console.log('  Ctrl-b n / p   switch panes');
    console.log('  Ctrl-b d       detach (panes keep running)');
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
  if (tmuxAvailable() && sessionExists()) {
    const w = listWindows();
    console.log(`\nTmux session '${SESSION}' panes: ${w.length > 0 ? w.join(', ') : '(none)'}`);
  } else {
    console.log(`\nTmux session '${SESSION}': not running`);
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
  console.log(`Marked ${id} as done.`);
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
  console.log(`tmux attach -t ${SESSION}`);
  console.log('  Ctrl-b n   next pane');
  console.log('  Ctrl-b p   prev pane');
  console.log('  Ctrl-b d   detach (panes keep running)');
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
    default:
      console.log('WIND Accounting orchestrator');
      console.log('');
      console.log('Commands:');
      console.log('  ready                          List tasks whose deps are satisfied');
      console.log(
        '  spawn <T-X.Y> ... [--dry-run]  Mark wip + launch in tmux pane(s); cap=MAX_PARALLEL',
      );
      console.log('  status                         Show wip/blocked + tmux panes');
      console.log('  done <T-X.Y>                   Manually mark a task done');
      console.log('  schedule                       Regenerate specs/tasks/SCHEDULE.md');
      console.log('  attach                         Print tmux attach hint');
      console.log('');
      console.log(`MAX_PARALLEL=${MAX_PARALLEL} (override via env)`);
      process.exit(subcommand ? 1 : 0);
  }
})();

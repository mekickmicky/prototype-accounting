#!/usr/bin/env bun
// Wraps `claude -p` so the orchestrator can capture model + token usage + cost
// from the spawned worker (Issue 02 — docs/issue/002-langfuse-no-cost-tracking.md).
//
// Usage:
//   claude-worker.ts <metaPath> -- <claude-args...>
//
// metaPath: file to write JSON metadata into when claude exits.
// claude-args: forwarded verbatim. We append `--output-format stream-json
//   --verbose` so we can read a final `result` event with usage/cost.
//
// Streaming: assistant text deltas are written to stdout as they arrive so the
// per-task tee log keeps the same human-readable shape it had before — only
// the wire format from claude is JSON.
//
// Requires Claude Code CLI ≥ 1.0.88 (older versions reject -p with a hard
// "needs an update" message).

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const metaPath = process.argv[2];
const sepIdx = process.argv.indexOf('--', 3);
if (!metaPath || sepIdx < 0) {
  console.error('Usage: claude-worker.ts <metaPath> -- <claude-args...>');
  process.exit(2);
}
const claudeArgs = process.argv.slice(sepIdx + 1);
const args = [...claudeArgs, '--output-format', 'stream-json', '--verbose'];

const proc = spawn('claude', args, { stdio: ['inherit', 'pipe', 'inherit'] });

let buf = '';
let lastResult: Record<string, unknown> | null = null;
let initModel: string | null = null;
let initSessionId: string | null = null;

function handleEvent(evt: Record<string, unknown>): void {
  const type = evt.type;
  if (type === 'system' && evt.subtype === 'init') {
    if (typeof evt.model === 'string') initModel = evt.model;
    if (typeof evt.session_id === 'string') initSessionId = evt.session_id;
    return;
  }
  if (type === 'assistant') {
    const msg = evt.message as { content?: Array<Record<string, unknown>> } | undefined;
    if (Array.isArray(msg?.content)) {
      for (const blk of msg!.content!) {
        if (blk.type === 'text' && typeof blk.text === 'string') {
          process.stdout.write(blk.text);
        }
      }
    }
    return;
  }
  if (type === 'result') {
    lastResult = evt;
  }
}

proc.stdout.on('data', (chunk: Buffer) => {
  buf += chunk.toString('utf-8');
  let nl: number;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      handleEvent(JSON.parse(line) as Record<string, unknown>);
    } catch {
      // Pass through anything that isn't valid JSON (bootstrap warnings etc.).
      process.stdout.write(line + '\n');
    }
  }
});

proc.on('error', (err) => {
  console.error('claude-worker: failed to spawn claude:', err.message);
  process.exit(127);
});

proc.on('exit', (code) => {
  // Trailing newline so subsequent zellij output starts on its own line.
  process.stdout.write('\n');

  // Always emit a meta file when we got *anything* useful — even on error
  // exits, the init model + session id are diagnostic gold.
  if (lastResult || initModel || initSessionId) {
    const r = (lastResult ?? {}) as Record<string, unknown>;
    const meta = {
      capturedAt: new Date().toISOString(),
      taskId: process.env.TASK_ID ?? null,
      model: (r.model as string | undefined) ?? initModel,
      sessionId: (r.session_id as string | undefined) ?? initSessionId,
      durationMs: r.duration_ms ?? null,
      durationApiMs: r.duration_api_ms ?? null,
      numTurns: r.num_turns ?? null,
      usage: r.usage ?? null,
      totalCostUsd: r.total_cost_usd ?? null,
      isError: r.is_error ?? (code !== 0),
      subtype: r.subtype ?? null,
      exitCode: code,
    };
    try {
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    } catch (e) {
      console.error('claude-worker: failed to write meta:', (e as Error).message);
    }
  }
  process.exit(code ?? 0);
});

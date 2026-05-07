#!/usr/bin/env bun
// Telegram notification CLI for wind-accounting orchestrator events.
//
// Usage:
//   bun scripts/notify.ts <type> [task-id] [message...]
//
// Types:
//   start    — worker spawned        🚀 (silent push)
//   done     — task complete          ✅
//   blocked  — task blocked           🚨
//   error    — orchestrator/system    ❌
//   info     — anything else          💬 (silent push)
//
// Examples:
//   bun scripts/notify.ts done T-1.7 "Reusable UI components scaffold"
//   bun scripts/notify.ts blocked T-1.10 "Prisma schema missing Account model"
//   bun scripts/notify.ts info "Phase 1 complete — 16/16 done"
//
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from env. Bun auto-loads .env
// at repo root. If either is missing, prints a warning to stderr and exits 0
// — never breaks the caller.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ICON: Record<string, string> = {
  start: "🚀",
  done: "✅",
  blocked: "🚨",
  error: "❌",
  info: "💬",
};

const SILENT_TYPES = new Set(["start", "info"]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const [, , typeArg, ...rest] = process.argv;

if (!typeArg || typeArg === "--help" || typeArg === "-h") {
  console.error(
    "usage: notify.ts <start|done|blocked|error|info> [task-id] [message...]",
  );
  process.exit(typeArg ? 0 : 1);
}

const type = typeArg.toLowerCase();
if (!ICON[type]) {
  console.error(
    `[notify] unknown type "${type}". valid: ${Object.keys(ICON).join(", ")}`,
  );
  process.exit(1);
}

const taskRe = /^T-\d+\.\d+$/;
let taskId = "";
let message = "";
if (rest[0] && taskRe.test(rest[0])) {
  taskId = rest[0];
  message = rest.slice(1).join(" ").trim();
} else {
  message = rest.join(" ").trim();
}

const ts = new Date().toLocaleString("en-GB", {
  timeZone: "Asia/Bangkok",
  hour12: false,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const parts: string[] = [ICON[type]];
if (taskId) parts.push(`<b>${taskId}</b>`);
parts.push(type);
if (message) parts.push(`— ${escapeHtml(message)}`);
const text = `${parts.join(" ")}\n<i>${ts} BKK</i>`;

if (!TOKEN || !CHAT_ID) {
  console.error(
    "[notify] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set, skipping send.",
  );
  console.error(`[notify] would have sent: ${text.replace(/\n/g, " | ")}`);
  process.exit(0);
}

try {
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text,
      parse_mode: "HTML",
      // disable_notification: SILENT_TYPES.has(type),
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.error(`[notify] telegram API ${r.status}: ${body}`);
    process.exit(0);
  }
} catch (e) {
  console.error(`[notify] fetch failed: ${e}`);
  process.exit(0);
}

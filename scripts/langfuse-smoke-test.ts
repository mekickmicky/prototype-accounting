#!/usr/bin/env bun
// Langfuse smoke test — sends one trace + span, retrieves it via API, prints trace URL.
// Usage: bun scripts/langfuse-smoke-test.ts
// Requires LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY (and optionally LANGFUSE_HOST) in .env
// See docs/setup/langfuse-running.md for setup instructions.

import Langfuse from "langfuse";

const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
const secretKey = process.env.LANGFUSE_SECRET_KEY;
const host = process.env.LANGFUSE_HOST ?? "http://localhost:3030";

if (!publicKey || !secretKey) {
  console.error(
    "Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set in .env\n" +
      "See docs/setup/langfuse-running.md for how to create API keys.",
  );
  process.exit(1);
}

const langfuse = new Langfuse({ publicKey, secretKey, baseUrl: host });

// --- send ---
const trace = langfuse.trace({
  name: "wind-acc-smoke-test",
  metadata: { source: "smoke-test", repo: "prototype-accounting" },
});

const span = trace.span({
  name: "test-span",
  input: { message: "hello" },
});

span.end({ output: { message: "world" } });

await langfuse.flushAsync();
console.log("Trace sent.");

// --- retrieve (wait for async ingestion) ---
await new Promise((r) => setTimeout(r, 3000));

const auth = Buffer.from(`${publicKey}:${secretKey}`).toString("base64");
const res = await fetch(`${host}/api/public/traces/${trace.id}`, {
  headers: { Authorization: `Basic ${auth}` },
});

if (!res.ok) {
  console.error(
    `Error: could not retrieve trace via API (HTTP ${res.status}). ` +
      "Is langfuse-server running? Did you set the correct API keys?",
  );
  process.exit(1);
}

const data = (await res.json()) as { id: string };
if (data.id !== trace.id) {
  console.error(`Error: retrieved trace id mismatch (got ${data.id})`);
  process.exit(1);
}

console.log("Smoke test passed.");
console.log(`Trace URL: ${host}/trace/${trace.id}`);

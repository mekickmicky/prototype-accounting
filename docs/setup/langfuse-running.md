# Langfuse — running locally (self-hosted)

Self-hosted Langfuse for wind-accounting observability. Uses a dedicated Postgres container so there's no interference with the app DB on port 5433.

## Quick start

```bash
# Start Langfuse and its DB
docker compose up -d langfuse-db langfuse-server

# Wait ~30s for DB init + Langfuse migrations, then open:
open http://localhost:3030
```

## Port map

| Service      | URL                    |
|---|---|
| Langfuse UI  | http://localhost:3030  |
| Langfuse DB  | internal only (no host port) |

## First-time setup (manual — do once)

1. Open http://localhost:3030
2. Register an account — the first registered user becomes the admin.
3. Create a new project, e.g. **wind-accounting**.
4. Go to **Settings → API Keys** and click **Create new API key**.
5. Copy the **Public Key** and **Secret Key** into your `.env`:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=http://localhost:3030
```

## Smoke test

After creating keys and updating `.env`:

```bash
bun install          # installs langfuse SDK if not yet installed
bun scripts/langfuse-smoke-test.ts
```

Expected output:

```
Smoke test passed.
Trace URL: http://localhost:3030/trace/<uuid>
```

Open the URL in the browser to confirm the trace appears in the UI. If the trace isn't visible, wait ~5s and refresh — ingestion is async.

## Stopping

```bash
docker compose stop langfuse-server langfuse-db
```

Data persists in the `langfuse_db_data` Docker volume between restarts.

## Why self-hosted

- Prompts contain proprietary specs and Thai tax logic — privacy matters.
- Free with no per-event cost or rate limits.
- Unlimited retention for cost analysis across build phases.

## Container details

| Container | Image | Internal port |
|---|---|---|
| wind-acc-langfuse | langfuse/langfuse:2 | 3000 → host 3030 |
| wind-acc-langfuse-db | postgres:16-alpine | 5432 (internal only) |

The Langfuse server uses hardcoded dev-only secrets (`NEXTAUTH_SECRET`, `SALT`). These are fine for a local prototype. If this ever runs in a shared environment, regenerate them.

## Cloud fallback

If docker-based self-hosting causes port or dependency conflicts, switch to Langfuse Cloud free tier:

1. Sign up at https://cloud.langfuse.com
2. Create a project and copy API keys
3. Update `.env`: set `LANGFUSE_HOST=https://cloud.langfuse.com`
4. Run smoke test — it should pass unchanged.

The smoke test and orchestrator wiring (T-99.4) use only the standard SDK and work identically against self-hosted or cloud.

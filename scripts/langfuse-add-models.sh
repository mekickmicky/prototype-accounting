#!/usr/bin/env bash
# Idempotently insert / update model pricing rows in the local Langfuse DB
# so cost shows up on traces from claude-worker.ts (Issue 02).
#
# Usage: bash scripts/langfuse-add-models.sh
#
# Targets the docker-compose Postgres container `wind-acc-langfuse-db`.
# Uses ON CONFLICT (project_id, model_name, start_date, unit) DO UPDATE so
# re-running just refreshes prices / patterns without creating duplicates.
#
# Pricing (USD per token, source: anthropic.com/pricing as of 2026-05):
#   Claude Opus 4.x   — input $15/M, output $75/M
#   Claude Sonnet 4.x — input $3/M,  output $15/M
#
# Match patterns are deliberately broad: they catch the bare `claude-opus-4-7`
# alias as well as dated API IDs (e.g. `claude-opus-4-7-20260101`) that
# Anthropic's API may return in the `model` field.

set -euo pipefail

CONTAINER="${LANGFUSE_DB_CONTAINER:-wind-acc-langfuse-db}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "ERROR: container '$CONTAINER' is not running." >&2
  echo "       Start it with: docker compose up -d langfuse-db" >&2
  exit 1
fi

docker exec -i "$CONTAINER" psql -U langfuse -d langfuse -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO models (
  id, model_name, match_pattern, start_date,
  input_price, output_price, total_price,
  unit, tokenizer_id, tokenizer_config, project_id
) VALUES
  (
    'wind-acc-claude-opus-4-7',
    'claude-opus-4-7',
    '(?i)^claude-opus-4-7(-.*)?$',
    NULL,
    0.000015, 0.000075, NULL,
    'TOKENS', 'claude', '{}'::jsonb, NULL
  ),
  (
    'wind-acc-claude-sonnet-4-6',
    'claude-sonnet-4-6',
    '(?i)^claude-sonnet-4-6(-.*)?$',
    NULL,
    0.000003, 0.000015, NULL,
    'TOKENS', 'claude', '{}'::jsonb, NULL
  )
ON CONFLICT (id) DO UPDATE SET
  match_pattern = EXCLUDED.match_pattern,
  input_price   = EXCLUDED.input_price,
  output_price  = EXCLUDED.output_price,
  unit          = EXCLUDED.unit,
  tokenizer_id  = EXCLUDED.tokenizer_id,
  updated_at    = CURRENT_TIMESTAMP;

SELECT model_name, match_pattern, input_price, output_price, unit
FROM models
WHERE id IN ('wind-acc-claude-opus-4-7', 'wind-acc-claude-sonnet-4-6')
ORDER BY model_name;
SQL

echo
echo "Done. Model definitions installed."
echo "Next: run a worker so claude-worker.ts emits a .meta.json, then check"
echo "the trace in Langfuse UI — Total cost should appear on the generation."

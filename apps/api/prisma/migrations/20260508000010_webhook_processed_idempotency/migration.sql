-- Reshape webhooks_processed table for idempotency pattern.
-- Old shape: (source, event_id, event_type, processed_at)
-- New shape: (source, idempotency_key, result_json, created_at)
-- Unique constraint changes from (source, event_id) to (source, idempotency_key).

-- Drop old indexes
DROP INDEX IF EXISTS "webhooks_processed_source_event_id_key";
DROP INDEX IF EXISTS "webhooks_processed_source_event_type_idx";

-- Drop old columns
ALTER TABLE "webhooks_processed" DROP COLUMN IF EXISTS "event_id";
ALTER TABLE "webhooks_processed" DROP COLUMN IF EXISTS "event_type";
ALTER TABLE "webhooks_processed" DROP COLUMN IF EXISTS "processed_at";

-- Add new columns (temporary defaults allow the ALTER on non-empty tables)
ALTER TABLE "webhooks_processed" ADD COLUMN "idempotency_key" TEXT NOT NULL DEFAULT '';
ALTER TABLE "webhooks_processed" ALTER COLUMN "idempotency_key" DROP DEFAULT;

ALTER TABLE "webhooks_processed" ADD COLUMN "result_json" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "webhooks_processed" ALTER COLUMN "result_json" DROP DEFAULT;

ALTER TABLE "webhooks_processed" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- New unique constraint: (source, idempotency_key) — duplicate webhook → returns cached result
CREATE UNIQUE INDEX "webhooks_processed_source_idempotency_key_key"
    ON "webhooks_processed"("source", "idempotency_key");

-- Index on created_at for 30-day purge cron
CREATE INDEX "webhooks_processed_created_at_idx"
    ON "webhooks_processed"("created_at");

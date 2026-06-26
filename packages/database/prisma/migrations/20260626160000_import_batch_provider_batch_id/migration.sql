-- Persist the Anthropic Message Batch id so a coordinator retry reconnects to the
-- live provider batch instead of submitting a second one (§5). Additive + nullable
-- = zero-downtime expand; old rows are NULL (no in-flight provider batch).
ALTER TABLE "import_batch" ADD COLUMN "provider_batch_id" TEXT;

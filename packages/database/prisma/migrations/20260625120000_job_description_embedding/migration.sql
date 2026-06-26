-- Job-posting → candidate-match suggestions (§5). Add the req prose we embed and
-- the semantic-match vector, in the SAME 1024-dim space as candidate.embedding so a
-- job and a fitting candidate are nearest neighbours. Both columns are nullable and
-- best-effort populated on create/update, so this is additive + online-safe: existing
-- jobs simply carry NULL until re-embedded (lazily on first suggest). Mirrors the
-- candidate embedding migration.

ALTER TABLE "job" ADD COLUMN "description" text;
ALTER TABLE "job" ADD COLUMN "embedding" vector(1024);

-- HNSW with cosine distance (<=>), matching the candidate index + the match query.
CREATE INDEX "job_embedding_hnsw_idx"
  ON "job" USING hnsw ("embedding" vector_cosine_ops);

-- Semantic candidate search (search upgrade #2, CLAUDE.md §5). Adds a pgvector
-- column + an HNSW (cosine) index. Embeddings are generated locally (LM Studio) at
-- ingest, so no resume text leaves the host (§2). The column is nullable and
-- backfilled best-effort, so this is additive and online-safe: existing rows stay
-- NULL (excluded from semantic results) until re-embedded.
--
-- vector(768) must match EMBEDDING_DIM in @hiredesq/ai. Tenant isolation is
-- unchanged — semantic search still carries an explicit workspace_id predicate (§1);
-- the HNSW index only orders the similarity, it does not scope it.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "candidate" ADD COLUMN "embedding" vector(768);

-- HNSW with cosine distance (<=>) — fast approximate nearest-neighbour at query
-- time. NULL embeddings are simply not indexed.
CREATE INDEX "candidate_embedding_hnsw_idx"
  ON "candidate" USING hnsw ("embedding" vector_cosine_ops);

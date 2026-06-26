-- Switch semantic-search embeddings from the local 768-dim model to Voyage
-- (voyage-4-lite, 1024-dim). A pgvector column can't be re-typed in place when
-- existing rows hold a different width, so drop + re-add the column at the new dim
-- and recreate the HNSW index. The column is nullable and best-effort backfilled at
-- ingest, so dropping it just resets embeddings to NULL — they re-populate on the
-- next parse; keyword/fuzzy search is unaffected meanwhile. Additive + online-safe.

DROP INDEX IF EXISTS "candidate_embedding_hnsw_idx";

ALTER TABLE "candidate" DROP COLUMN IF EXISTS "embedding";
ALTER TABLE "candidate" ADD COLUMN "embedding" vector(1024);

-- HNSW with cosine distance (<=>), matching the query in candidates.service.
CREATE INDEX "candidate_embedding_hnsw_idx"
  ON "candidate" USING hnsw ("embedding" vector_cosine_ops);

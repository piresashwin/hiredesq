-- Fuzzy, typo-tolerant candidate search (search upgrade #1, CLAUDE.md §5).
-- pg_trgm ships with postgres:16-alpine (a bundled contrib extension), so no custom
-- image is needed. The GIN trigram indexes accelerate BOTH the similarity (%)
-- operator and ILIKE on the human-entered columns a recruiter searches by
-- (name / current title / current company). Tenant isolation is unchanged: the
-- search query still carries an explicit workspace_id predicate (§1) — these
-- indexes only speed the text match, they do not scope it.
--
-- Additive and online-safe: CREATE EXTENSION / CREATE INDEX add structure without
-- touching existing rows or columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "candidate_full_name_trgm_idx" ON "candidate" USING gin ("full_name" gin_trgm_ops);
CREATE INDEX "candidate_current_title_trgm_idx" ON "candidate" USING gin ("current_title" gin_trgm_ops);
CREATE INDEX "candidate_current_company_trgm_idx" ON "candidate" USING gin ("current_company" gin_trgm_ops);

-- Index coverage for list/sort hot paths (review Batch B, CLAUDE.md §1 perf).
-- Index names match Prisma's default `@@index` naming so the schema and DB don't drift.
--
-- Additive + online-safe: CREATE INDEX adds a read structure; it does not change
-- any column or break the running app. NOTE for a large production `candidate`
-- table, prefer running these as `CREATE INDEX CONCURRENTLY` out-of-band (Prisma
-- wraps a migration in a transaction, where CONCURRENTLY is not allowed) — the
-- tables are small pre-launch, so the brief lock here is acceptable.

-- Candidate list default sort: WHERE workspace_id = $1 ORDER BY created_at DESC.
CREATE INDEX "candidate_workspace_id_created_at_idx" ON "candidate" ("workspace_id", "created_at");

-- Submission job-scoped lookups (F5 job-linked submissions panel).
CREATE INDEX "submission_workspace_id_job_id_idx" ON "submission" ("workspace_id", "job_id");

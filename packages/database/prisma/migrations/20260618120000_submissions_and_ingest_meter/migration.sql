-- Client-ready submission (Wedge 2, MVP-SPEC §2D) + Model B ingest meter
-- (FEATURE-SET.md §F3). Purely ADDITIVE: a new enum, a new table, and one
-- defaulted column — safe to apply with no downtime, no backfill.

-- Model B: resume parsing is free, metered by a lifetime abuse/onboarding ceiling
-- instead of the daily credits. Existing accounts start at 0 used.
ALTER TABLE "credit_account"
  ADD COLUMN "ingest_used_lifetime" INTEGER NOT NULL DEFAULT 0;

-- Submission lifecycle. [Launch] uses `sent`; V1.1 (F5) advances the rest.
CREATE TYPE "SubmissionStatus" AS ENUM ('sent', 'viewed', 'advance', 'interview', 'reject');

CREATE TABLE "submission" (
  "id"             TEXT NOT NULL,
  "workspace_id"   TEXT NOT NULL,
  "candidate_id"   TEXT NOT NULL,
  "job_id"         TEXT,
  "status"         "SubmissionStatus" NOT NULL DEFAULT 'sent',
  "summary"        TEXT NOT NULL,
  "masked_profile" JSONB NOT NULL,
  "share_token"    TEXT NOT NULL,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "submission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "submission_share_token_key" ON "submission"("share_token");
CREATE INDEX "submission_workspace_id_created_at_idx" ON "submission"("workspace_id", "created_at");
CREATE INDEX "submission_workspace_id_candidate_id_idx" ON "submission"("workspace_id", "candidate_id");

ALTER TABLE "submission"
  ADD CONSTRAINT "submission_workspace_id_fkey" FOREIGN KEY ("workspace_id")
  REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission"
  ADD CONSTRAINT "submission_candidate_id_fkey" FOREIGN KEY ("candidate_id")
  REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "submission"
  ADD CONSTRAINT "submission_job_id_fkey" FOREIGN KEY ("job_id")
  REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

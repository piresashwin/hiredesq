-- Job spine: hard-constraint fields + per-candidate qualification trail (F4,
-- MVP-SPEC §2C). Purely ADDITIVE — new columns default to "no constraint"/unknown,
-- and a new table. No backfill, online-safe.

-- Job hard constraints (empty array / false = unconstrained).
ALTER TABLE "job"
  ADD COLUMN "required_nationalities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "residence_transferable_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "required_licenses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Candidate comparison fields (null/empty = unknown).
ALTER TABLE "candidate"
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "residence_transferable" BOOLEAN,
  ADD COLUMN "licenses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Per-candidate-per-position qualification trail.
CREATE TYPE "TrailEntryKind" AS ENUM ('note', 'qualified', 'disqualified');

CREATE TABLE "qualification_trail_entry" (
  "id"             TEXT NOT NULL,
  "workspace_id"   TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "kind"           "TrailEntryKind" NOT NULL DEFAULT 'note',
  "note"           TEXT NOT NULL,
  "author_id"      TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "qualification_trail_entry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "qualification_trail_entry_workspace_id_application_id_idx"
  ON "qualification_trail_entry"("workspace_id", "application_id");

ALTER TABLE "qualification_trail_entry"
  ADD CONSTRAINT "qualification_trail_entry_workspace_id_fkey" FOREIGN KEY ("workspace_id")
  REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qualification_trail_entry"
  ADD CONSTRAINT "qualification_trail_entry_application_id_fkey" FOREIGN KEY ("application_id")
  REFERENCES "application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

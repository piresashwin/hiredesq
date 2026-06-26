-- Placement guarantee / replacement window (F2, MVP-SPEC §2E, CLAUDE.md §3).
-- Expand-and-contract for the NOT NULL clears_at: add nullable → backfill from
-- existing data → set NOT NULL. The other columns are defaulted, so additive.

CREATE TYPE "PlacementStatus" AS ENUM ('at_risk', 'cleared', 'fell_through', 'replaced');

-- guarantee_days defaults to 30; status defaults to at_risk; replaces is nullable.
ALTER TABLE "placement"
  ADD COLUMN "guarantee_days" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "status" "PlacementStatus" NOT NULL DEFAULT 'at_risk',
  ADD COLUMN "retained_amount" DECIMAL(14,2),
  ADD COLUMN "replaces_placement_id" TEXT,
  ADD COLUMN "clears_at" TIMESTAMP(3);

-- Backfill clears_at = placed_at + guarantee window for every existing row.
UPDATE "placement"
  SET "clears_at" = "placed_at" + ("guarantee_days" || ' days')::interval
  WHERE "clears_at" IS NULL;

-- Backfill status: rows already past their window are `cleared` (truly earned);
-- the rest stay at_risk. (Read paths also derive this, so it's data hygiene.)
UPDATE "placement"
  SET "status" = 'cleared'
  WHERE "clears_at" <= CURRENT_TIMESTAMP;

-- Now enforce NOT NULL on the backfilled column.
ALTER TABLE "placement" ALTER COLUMN "clears_at" SET NOT NULL;

CREATE INDEX "placement_workspace_id_status_idx" ON "placement"("workspace_id", "status");

ALTER TABLE "placement"
  ADD CONSTRAINT "placement_replaces_placement_id_fkey" FOREIGN KEY ("replaces_placement_id")
  REFERENCES "placement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

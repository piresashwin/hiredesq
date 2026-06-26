-- AlterTable
-- Per-screen guided-tour completion. A JSON map of TourScreen -> true, written
-- once the user finishes/dismisses a screen's tour (drives the "unseen" dot on
-- the help icon). Defaults to {} and is NOT NULL, so this is a safe expand-only
-- migration (no backfill, no downtime).
ALTER TABLE "user" ADD COLUMN     "tour_progress" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
-- User-level country preference (ISO 3166-1 alpha-2), auto-detected from the
-- browser timezone at signup. Nullable with no default, so this is a safe
-- expand-only migration (no backfill, no downtime); existing users read null
-- until they next save a preference.
ALTER TABLE "user" ADD COLUMN     "country" TEXT;

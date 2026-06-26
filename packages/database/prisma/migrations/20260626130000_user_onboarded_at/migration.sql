-- First-run onboarding flag: when the user finished (or skipped) the welcome
-- takeover. Nullable and additive — backward compatible, zero-downtime. Existing
-- users have NULL and would see the onboarding once; if that's not desired for a
-- given environment, backfill NOW() for pre-existing rows after deploy.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "onboarded_at" TIMESTAMP(3);

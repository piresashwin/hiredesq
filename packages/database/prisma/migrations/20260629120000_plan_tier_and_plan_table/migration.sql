-- Add `solo_pro` to the PlanTier enum.
-- SPLIT FILE 1 OF 2: only the enum ADD VALUE lives here because Postgres does not
-- allow ALTER TYPE ... ADD VALUE inside a transaction block. Prisma marks this
-- migration as non-transactional so it runs outside the default BEGIN/COMMIT wrapper.
-- The table creation and seed inserts are in the next migration file.
--
-- This is an expand-only, non-breaking change: existing `free`/`team` rows
-- and all Workspace.plan columns are unaffected.

-- Tell Prisma to skip the transaction wrapper for this file.
-- prisma-migrate:isolation-level=none

ALTER TYPE "PlanTier" ADD VALUE IF NOT EXISTS 'solo_pro' BEFORE 'team';

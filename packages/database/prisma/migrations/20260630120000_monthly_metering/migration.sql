-- Monthly metering: rename daily→monthly submission allotment columns and
-- introduce period-aware ingest tracking.
--
-- Two architectural changes:
-- 1. SUBMISSIONS: daily reset → monthly reset. The allotment column is renamed;
--    the service now renews at the UTC calendar-month boundary (v1 simplification —
--    not billing-anchored). Existing balances are preserved losslessly.
-- 2. INGEST: gains a period dimension. "lifetime" (free tier — monotonic, never
--    resets), "monthly" (solo_pro — resets each UTC calendar month), null (team —
--    unmetered). The unified key design (ingestPeriodKey) makes the per-workspace
--    period roll-over race-safe: the worker reads+writes the key inside a FOR UPDATE
--    transaction, so it can detect a stale key and reset atomically.
--
-- §1 note: credit_account is tenant-scoped (workspace_id); the plan table is
-- global reference data (no workspace_id — intentional §1 exception).

-- ── credit_account ────────────────────────────────────────────────────────────

-- 1a. Rename the submission allotment column (daily → monthly).
ALTER TABLE "credit_account" RENAME COLUMN "daily_allotment" TO "monthly_allotment";

-- 1b. Rename the ingest usage column (removes "lifetime" from the name — the
--     column is now period-agnostic; the period is tracked in ingest_period_key).
ALTER TABLE "credit_account" RENAME COLUMN "ingest_used_lifetime" TO "ingest_used";

-- 1c. Add the period key column. Existing rows get 'lifetime' (the free-tier
--     monotonic period), so the lifetime counter is preserved losslessly — an
--     existing free workspace that has used N parses retains those N under the
--     'lifetime' key, exactly as if it were a brand-new row on the free tier.
ALTER TABLE "credit_account"
  ADD COLUMN "ingest_period_key" TEXT NOT NULL DEFAULT 'lifetime';

-- ── plan ─────────────────────────────────────────────────────────────────────

-- 2a. Rename the submission allotment column (daily → monthly).
ALTER TABLE "plan" RENAME COLUMN "daily_submission_allotment" TO "monthly_submission_allotment";

-- 2b. Add the ingest period column.
ALTER TABLE "plan"
  ADD COLUMN "ingest_period" TEXT;

-- ── Plan row updates ──────────────────────────────────────────────────────────
-- Idempotent UPDATEs — safe to re-run (values already match on a second run).

-- Free: 20 submissions/month, 500 lifetime parses, period = "lifetime".
UPDATE "plan"
SET
  "monthly_submission_allotment" = 20,
  "ingest_free_limit"             = 500,
  "ingest_period"                 = 'lifetime'
WHERE "tier" = 'free';

-- Solo Pro: 100 submissions/month, 200 parses/month (monthly reset).
UPDATE "plan"
SET
  "monthly_submission_allotment" = 100,
  "ingest_free_limit"             = 200,
  "ingest_period"                 = 'monthly'
WHERE "tier" = 'solo_pro';

-- Team: unmetered submissions (keep 10000 as before), unmetered ingest (null).
UPDATE "plan"
SET
  "ingest_free_limit" = NULL,
  "ingest_period"     = NULL
WHERE "tier" = 'team';

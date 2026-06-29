-- Create the Plan reference table and seed the three pricing tiers.
-- SPLIT FILE 2 OF 2: runs after 20260629120000 committed the solo_pro enum value,
-- so "PlanTier" already includes 'solo_pro' when this transaction starts.
--
-- §1 note: the `plan` table is GLOBAL reference/config data, NOT tenant-scoped.
-- It holds pricing limits the credit gate reads at runtime. There is deliberately
-- no workspace_id column — pricing config is public reference data shared across
-- all workspaces (intentional §1 exception, see Plan model comment in schema.prisma).
--
-- §3 note: price_monthly is DECIMAL(14,2), never FLOAT (CLAUDE.md §3).

CREATE TABLE "plan" (
    "tier"                                "PlanTier"     NOT NULL,
    "name"                                TEXT           NOT NULL,
    -- money: DECIMAL(14,2) — never FLOAT (CLAUDE.md §3)
    "price_monthly"                       DECIMAL(14, 2) NOT NULL,
    "currency"                            TEXT           NOT NULL DEFAULT 'USD',
    "per_seat"                            BOOLEAN        NOT NULL DEFAULT false,
    "daily_submission_allotment"          INTEGER        NOT NULL,
    "ingest_free_limit"                   INTEGER,
    "seat_limit"                          INTEGER,
    "ai_mode_monthly_allowance_micro_usd" BIGINT         NOT NULL DEFAULT 0,
    "created_at"                          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    "updated_at"                          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT "plan_pkey" PRIMARY KEY ("tier")
);

-- Seed the three pricing tiers so a fresh prod DB is never empty.
-- ON CONFLICT DO NOTHING makes this idempotent (safe to re-run).
-- null ingest_free_limit = unmetered ingest (paid tiers).
INSERT INTO "plan" ("tier", "name", "price_monthly", "currency", "per_seat", "daily_submission_allotment", "ingest_free_limit", "seat_limit", "ai_mode_monthly_allowance_micro_usd")
VALUES
  ('free',     'Free',     0.00,  'USD', false, 5,     1000, 1,    0),
  ('solo_pro', 'Solo Pro', 29.00, 'USD', false, 50,    NULL, 1,    0),
  ('team',     'Team',     39.00, 'USD', true,  10000, NULL, 10,   0)
ON CONFLICT ("tier") DO NOTHING;

-- Free credits are now a DAILY allotment (reset daily, no rollover) instead of
-- monthly. Rename preserves the column (and its data) rather than drop+recreate;
-- the prior monthly value (100) is reset to the new daily default (5).
ALTER TABLE "credit_account" RENAME COLUMN "monthly_allotment" TO "daily_allotment";
ALTER TABLE "credit_account" ALTER COLUMN "daily_allotment" SET DEFAULT 5;
UPDATE "credit_account" SET "daily_allotment" = 5;

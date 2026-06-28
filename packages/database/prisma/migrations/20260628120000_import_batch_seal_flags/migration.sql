-- Delayed auto-seal safety net for chunked bulk uploads. `sealed` is claimed exactly
-- once by whichever path enqueues the batch's parse work (the explicit final chunk or
-- the delayed worker safety net); `partial` is set only when the safety net wins (the
-- client died before sending the seal). Additive + NOT NULL DEFAULT false = zero-
-- downtime expand; existing rows backfill to false (already-enqueued work is unaffected).
ALTER TABLE "import_batch" ADD COLUMN "sealed" boolean NOT NULL DEFAULT false,
                           ADD COLUMN "partial" boolean NOT NULL DEFAULT false;

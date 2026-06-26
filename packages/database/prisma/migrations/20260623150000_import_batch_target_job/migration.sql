-- Job-centric inbound (F7, MVP-SPEC §2A): a bulk drop can target an open position
-- so its candidates land attached to the req. Additive — nullable column + FK,
-- SetNull on job delete. No backfill.

ALTER TABLE "import_batch" ADD COLUMN "job_id" TEXT;

ALTER TABLE "import_batch"
  ADD CONSTRAINT "import_batch_job_id_fkey" FOREIGN KEY ("job_id")
  REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

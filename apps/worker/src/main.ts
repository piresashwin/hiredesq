import PgBoss from "pg-boss";
import {
  CV_PARSE_QUEUE,
  CV_PARSE_BATCH_QUEUE,
  CV_SEAL_QUEUE,
  type ParseJobData,
  type BatchJobData,
  type SealJobData,
} from "@hiredesq/shared";
import { processParseJob } from "./parse.processor.js";
import { processBatchJob } from "./batch.processor.js";
import { processSealJob } from "./seal.processor.js";

// pg-boss runs the CV-parse queues on Postgres (no Redis). Use the DIRECT (non-
// pooled) connection — pg-boss relies on LISTEN/NOTIFY and advisory locks, which
// a transaction-mode pooler breaks. Jobs are deduped by content hash via the
// producer's singletonKey, so retries are idempotent (CLAUDE.md §5).
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

async function main() {
  const boss = new PgBoss({ connectionString });
  boss.on("error", (err) => console.error(`[cv-parse] pg-boss error: ${err.message}`));

  await boss.start();
  await boss.createQueue(CV_PARSE_QUEUE);
  await boss.createQueue(CV_PARSE_BATCH_QUEUE);
  await boss.createQueue(CV_SEAL_QUEUE);

  // Per-item live parses (the interactive reveal). Several run in parallel; the
  // credit gate reserves atomically so they can't oversell (CLAUDE.md §4).
  await boss.work<ParseJobData>(CV_PARSE_QUEUE, { batchSize: 5 }, async (jobs) => {
    for (const job of jobs) {
      // Log ids only — never PII (CLAUDE.md §2). A throw lets pg-boss retry.
      await processParseJob(job.data);
      console.warn(`[cv-parse] completed job=${job.id}`);
    }
  });

  // Bulk coordinator (the Batch API path). One batch can run for a while, so keep
  // the fetch small — these are long-lived, low-throughput coordinator jobs.
  await boss.work<BatchJobData>(CV_PARSE_BATCH_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      await processBatchJob(job.data);
      console.warn(`[cv-parse-batch] completed job=${job.id}`);
    }
  });

  // Delayed auto-seal safety net (CV_SEAL_QUEUE): seals an abandoned chunked drop as
  // `partial` and enqueues its parse work, so a client that died before sending the
  // final `?sealed=1` chunk never strands the batch + its stored bytes. Idempotent via
  // the sealed-claim + the parse/batch singletonKeys (CLAUDE.md §1/§5).
  await boss.work<SealJobData>(CV_SEAL_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      await processSealJob(boss, job.data);
      console.warn(`[cv-seal] completed job=${job.id}`);
    }
  });

  console.warn("[cv-parse] worker started (pg-boss)");
}

main().catch((err) => {
  console.error(`[cv-parse] fatal: ${err.message}`);
  process.exit(1);
});

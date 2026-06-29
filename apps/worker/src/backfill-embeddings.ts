/**
 * One-off CLI backfill: generates embeddings for every candidate that currently
 * has a NULL embedding. Safe to re-run — idempotent.
 *
 * Run:  pnpm --filter @hiredesq/worker backfill:embeddings
 *   (= dotenv -e ../../.env -- tsx src/backfill-embeddings.ts)
 */
import { backfillMissingEmbeddings } from "./embedding-backfill.processor.js";

backfillMissingEmbeddings().catch((err) => {
  console.error(`[embed-backfill] fatal: ${err instanceof Error ? err.message : "unknown"}`);
  process.exit(1);
});

import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import PgBoss from "pg-boss";
import {
  CV_PARSE_QUEUE,
  CV_PARSE_BATCH_QUEUE,
  CV_SEAL_QUEUE,
  type ParseJobData,
  type BatchJobData,
  type SealJobData,
} from "@hiredesq/shared";

// pg-boss producer for the cv-parse queue (Postgres-backed, no Redis). The worker
// (apps/worker) consumes it; the credit gate runs there, so this just enqueues.
// Uses the DIRECT (non-pooled) connection — pg-boss needs LISTEN/NOTIFY + advisory
// locks, which a transaction-mode pooler breaks.
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly boss = new PgBoss({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  });

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(CV_PARSE_QUEUE);
    await this.boss.createQueue(CV_PARSE_BATCH_QUEUE);
    await this.boss.createQueue(CV_SEAL_QUEUE);
  }

  /**
   * Enqueue a parse. singletonKey = content hash → pg-boss won't enqueue a
   * duplicate while one is active, so re-submitting the same content is
   * idempotent end to end (matches the worker's hash keying).
   */
  async enqueueParse(contentHash: string, data: ParseJobData): Promise<void> {
    await this.boss.send(CV_PARSE_QUEUE, data, {
      singletonKey: contentHash,
      retryLimit: 3,
      retryBackoff: true,
    });
  }

  /**
   * Enqueue ONE batch-coordinator message for a large bulk drop. singletonKey =
   * batchId → the same batch is never coordinated twice (idempotent enqueue).
   * The worker explodes it through the Batch API (CLAUDE.md §5).
   */
  async enqueueBatch(batchId: string, data: BatchJobData): Promise<void> {
    await this.boss.send(CV_PARSE_BATCH_QUEUE, data, {
      singletonKey: batchId,
      retryLimit: 3,
      retryBackoff: true,
    });
  }

  /**
   * Schedule the delayed auto-seal safety net for a chunked folder drop. `startAfter`
   * (seconds) delays the fire; singletonKey = batchId dedups a re-sent first chunk while
   * the timer is still pending (pg-boss only dedups not-yet-completed jobs, so this is a
   * best-effort guard, not a hard one). Correctness does NOT rely on it: the worker reads
   * `sealed` and no-ops when the explicit seal already enqueued the work. The read-gate
   * isn't atomic, so an explicit+auto race can both enqueue — but that collapses to one
   * submit downstream: live parses dedup on contentHash (the worker's markParseDone
   * idempotency), and the batch coordinator dedups on `singletonKey=batchId` while active
   * + reconnects via `ImportBatch.providerBatchId` (job-agnostic) once submitted, so a
   * second coordinator settles the existing provider batch instead of submitting again.
   */
  async enqueueSeal(
    batchId: string,
    data: SealJobData,
    delaySeconds: number,
  ): Promise<void> {
    await this.boss.send(CV_SEAL_QUEUE, data, {
      startAfter: delaySeconds,
      singletonKey: batchId,
      retryLimit: 3,
      retryBackoff: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }
}

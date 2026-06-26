import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import PgBoss from "pg-boss";
import {
  CV_PARSE_QUEUE,
  CV_PARSE_BATCH_QUEUE,
  type ParseJobData,
  type BatchJobData,
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

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop();
  }
}

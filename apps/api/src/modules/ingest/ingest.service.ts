import { createHash } from "node:crypto";
import { HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ParseJobData, IngestResponse, ParseJobStatus } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { QueueService } from "../../common/queue.service.js";
import { CreditsService } from "../credits/credits.service.js";
import type { IngestDto } from "./ingest.dto.js";

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * Accept an ingest, record an idempotent ParseJob, and enqueue the parse. The
   * credit reservation happens in the worker (the single gate) — this stays thin.
   * Idempotent by content hash: re-submitting the same content returns the
   * existing job and pg-boss dedups the enqueue (singletonKey).
   */
  async ingest(workspaceId: string, dto: IngestDto): Promise<IngestResponse> {
    // Every ingest kind here (text/pdf/docx/image) is an AI parse. Under Model B
    // (§F3) parsing is FREE — gated by the lifetime ingest quota, not the daily
    // credits — so a backlog dump never paywalls on day 1. Advisory only: the
    // worker's reserveIngestSlot is the true gate; this gives the UI a graceful 402.
    if (!(await this.credits.hasIngestQuota(workspaceId))) {
      throw new HttpException(
        {
          code: "ingest_quota_exhausted",
          message: "You've reached your free parsing limit — upgrade for more.",
        },
        402,
      );
    }

    // Job-centric inbound (§2A, F7): if a target position is given, verify it's in
    // THIS workspace (§1 — never trust a body id) before threading it to the worker.
    if (dto.jobId) {
      const targetJob = await this.prisma.job.findFirst({
        where: { id: dto.jobId, workspaceId },
        select: { id: true },
      });
      if (!targetJob) throw new NotFoundException("job not found");
    }

    const contentHash = createHash("sha256").update(dto.payload).digest("hex");

    const job = await this.prisma.parseJob.upsert({
      where: { workspaceId_contentHash: { workspaceId, contentHash } },
      update: {},
      create: { workspaceId, contentHash, status: "queued" },
    });

    const data: ParseJobData = {
      workspaceId,
      kind: dto.kind,
      payload: dto.payload,
      imageMediaType: dto.imageMediaType,
      source: dto.source,
      jobId: dto.jobId,
    };
    await this.queue.enqueueParse(contentHash, data);

    // Log ids only — never the payload (PII, CLAUDE.md §2).
    this.logger.log(`ingest queued ws=${workspaceId} job=${job.id} kind=${dto.kind}`);
    return { parseJobId: job.id, status: job.status as ParseJobStatus };
  }
}

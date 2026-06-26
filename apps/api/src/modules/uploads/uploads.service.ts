import { createHash } from "node:crypto";
import { HttpException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  BULK_BATCH_THRESHOLD,
  type BatchJobData,
  type BatchParseItem,
  type BulkIngestResponse,
  type CandidateSource,
  type ParseJobData,
  type ParseJobStatus,
  type SignedUrlDto,
  type UploadedItemDto,
} from "@hiredesq/shared";
import { Prisma } from "@hiredesq/database";
import { workspaceKey } from "@hiredesq/storage";
import { PrismaService } from "../../common/prisma.service.js";
import { QueueService } from "../../common/queue.service.js";
import { StorageService } from "../../common/storage.service.js";
import { CreditsService } from "../credits/credits.service.js";
import { detectKind, imageMediaType, type DetectedKind } from "./upload-kind.js";

/** A buffered multipart file as handed over by the controller (PII — never logged). */
export interface IncomingFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

// Per-file artefacts after storing + upserting rows, used to build the response
// and (for the multi-file branch) the enqueue payloads.
interface StoredFile {
  detected: DetectedKind;
  contentHash: string;
  storageKey: string;
  filename: string;
  fileId: string;
  parseJobId: string;
  status: ParseJobStatus;
  duplicate: boolean;
}

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    @Inject(StorageService) private readonly storage: StorageService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * Advisory ingest-quota pre-check for the AI-parse upload paths (Model B, §F3).
   * Parsing is FREE — gated by the lifetime ingest quota, not the daily credits —
   * so a backlog dump never paywalls on day 1. Throws a 402 the web branches on.
   * CSV/XLSX sheets are NOT routed through here — their clean rows are free (no AI);
   * the worker's reserveIngestSlot gates the messy rows that do need a parse.
   */
  private async requireCredits(workspaceId: string): Promise<void> {
    if (!(await this.credits.hasIngestQuota(workspaceId))) {
      throw new HttpException(
        {
          code: "ingest_quota_exhausted",
          message: "You've reached your free parsing limit — upgrade for more.",
        },
        402,
      );
    }
  }

  /**
   * INGEST PROTOCOL v2 (shared with the worker). Routes on file count + kind:
   *  - single resume (pdf/docx/image) → store, upsert, enqueue one live parse.
   *  - CSV/XLSX → store, ImportBatch{total:0}, enqueue ONE parse the worker explodes.
   *  - multi-file folder drop → ImportBatch, store/upsert each; >threshold AI items
   *    go via the Batch API coordinator, else per-item live parses.
   * The credit gate + counters live in the worker (§4); this only creates rows
   * and enqueues. Idempotent by content hash (upserts + pg-boss singletonKey).
   */
  async ingest(
    workspaceId: string,
    files: IncomingFile[],
    jobId?: string,
  ): Promise<BulkIngestResponse> {
    // Job-centric inbound (§2A, F7): verify the target position is in THIS workspace
    // (§1 — never trust a body/query id) before threading it to the worker.
    if (jobId) {
      const targetJob = await this.prisma.job.findFirst({
        where: { id: jobId, workspaceId },
        select: { id: true },
      });
      if (!targetJob) throw new NotFoundException("job not found");
    }

    // A single CSV/XLSX is its own protocol branch regardless of count.
    if (files.length === 1) {
      const only = files[0]!;
      const detected = detectKind(only.filename, only.mimetype);
      if (detected.kind === "csv" || detected.kind === "xlsx") {
        return this.ingestSheet(workspaceId, only, detected, jobId);
      }
      return this.ingestSingle(workspaceId, only, detected, jobId);
    }
    return this.ingestMulti(workspaceId, files, jobId);
  }

  // ── Single resume (pdf/docx/image) ────────────────────────────────────────
  private async ingestSingle(
    workspaceId: string,
    file: IncomingFile,
    detected: DetectedKind,
    jobId?: string,
  ): Promise<BulkIngestResponse> {
    // Single resume (pdf/docx/image) always needs an AI parse — gate it (§4).
    await this.requireCredits(workspaceId);
    const stored = await this.storeAndRecord(workspaceId, file, detected, null);

    const data: ParseJobData = {
      workspaceId,
      kind: detected.kind,
      source: "resume_upload",
      storageKey: stored.storageKey,
      fileId: stored.fileId,
      contentHash: stored.contentHash,
      filename: stored.filename,
      imageMediaType: imageMediaType(detected.ext),
      jobId,
    };
    await this.queue.enqueueParse(stored.contentHash, data);

    this.logger.log(
      `upload single ws=${workspaceId} job=${stored.parseJobId} kind=${detected.kind} dup=${stored.duplicate}`,
    );
    return { items: [this.toItemDto(stored)] };
  }

  // ── CSV / XLSX (worker reads rows + sets the real total) ──────────────────
  private async ingestSheet(
    workspaceId: string,
    file: IncomingFile,
    detected: DetectedKind,
    jobId?: string,
  ): Promise<BulkIngestResponse> {
    const batch = await this.prisma.importBatch.create({
      data: { workspaceId, source: detected.kind, status: "processing", total: 0, jobId: jobId ?? null },
    });
    const stored = await this.storeAndRecord(workspaceId, file, detected, batch.id);

    const data: ParseJobData = {
      workspaceId,
      kind: detected.kind,
      source: "bulk_import",
      storageKey: stored.storageKey,
      fileId: stored.fileId,
      batchId: batch.id,
      contentHash: stored.contentHash,
      filename: stored.filename,
      jobId,
    };
    await this.queue.enqueueParse(stored.contentHash, data);

    this.logger.log(
      `upload sheet ws=${workspaceId} batch=${batch.id} kind=${detected.kind} job=${stored.parseJobId}`,
    );
    return { batchId: batch.id, items: [this.toItemDto(stored)] };
  }

  // ── Multi-file folder drop ────────────────────────────────────────────────
  private async ingestMulti(
    workspaceId: string,
    files: IncomingFile[],
    jobId?: string,
  ): Promise<BulkIngestResponse> {
    // A multi-file folder drop is a stream of resume parses (AI) — gate it (§4).
    // Advisory: the worker reserves+refunds per file, so this just blocks the drop
    // up front when the balance is already exhausted.
    await this.requireCredits(workspaceId);
    // Detect everything up front so an unsupported file rejects before we store.
    const detected = files.map((f) => ({ file: f, detected: detectKind(f.filename, f.mimetype) }));

    const batch = await this.prisma.importBatch.create({
      data: { workspaceId, source: "folder", status: "processing", total: files.length, jobId: jobId ?? null },
    });

    const stored: StoredFile[] = [];
    for (const { file, detected: d } of detected) {
      stored.push(await this.storeAndRecord(workspaceId, file, d, batch.id));
    }

    if (files.length > BULK_BATCH_THRESHOLD) {
      // One coordinator message → the worker fans out via the Batch API (§5).
      const items: BatchParseItem[] = stored.map((s) => ({
        contentHash: s.contentHash,
        kind: s.detected.kind,
        source: "resume_upload" as CandidateSource,
        parseJobId: s.parseJobId,
        storageKey: s.storageKey,
        fileId: s.fileId,
        filename: s.filename,
        imageMediaType: imageMediaType(s.detected.ext),
      }));
      const data: BatchJobData = { workspaceId, batchId: batch.id, jobId, items };
      await this.queue.enqueueBatch(batch.id, data);
    } else {
      // Smaller drop → per-item live parses for the real-time reveal.
      for (const s of stored) {
        const data: ParseJobData = {
          workspaceId,
          kind: s.detected.kind,
          source: "resume_upload",
          storageKey: s.storageKey,
          fileId: s.fileId,
          batchId: batch.id,
          contentHash: s.contentHash,
          filename: s.filename,
          imageMediaType: imageMediaType(s.detected.ext),
          jobId,
        };
        await this.queue.enqueueParse(s.contentHash, data);
      }
    }

    this.logger.log(
      `upload multi ws=${workspaceId} batch=${batch.id} files=${files.length} batched=${files.length > BULK_BATCH_THRESHOLD}`,
    );
    return { batchId: batch.id, items: stored.map((s) => this.toItemDto(s)) };
  }

  private static readonly SIGNED_URL_TTL = 300;

  /**
   * Mint a short-lived signed GET URL for an uploaded original (§2). The
   * UploadedFile is looked up tenant-scoped; signedGetUrl additionally refuses
   * keys outside the workspace prefix (defence in depth, §1).
   */
  async signedUrl(workspaceId: string, fileId: string): Promise<SignedUrlDto> {
    const file = await this.prisma.uploadedFile.findFirst({
      where: { id: fileId, workspaceId },
      select: { storageKey: true },
    });
    if (!file) throw new NotFoundException("file not found");

    const url = await this.storage.signedGetUrl(
      workspaceId,
      file.storageKey,
      UploadsService.SIGNED_URL_TTL,
    );
    this.logger.log(`signed-url ws=${workspaceId} file=${fileId}`); // ids only (§2)
    return { url, expiresInSeconds: UploadsService.SIGNED_URL_TTL };
  }

  // ── Shared: store bytes + upsert UploadedFile + ParseJob (idempotent) ─────
  private async storeAndRecord(
    workspaceId: string,
    file: IncomingFile,
    detected: DetectedKind,
    batchId: string | null,
  ): Promise<StoredFile> {
    const contentHash = createHash("sha256").update(file.buffer).digest("hex");
    const storageKey = workspaceKey(workspaceId, "uploads", `${contentHash}.${detected.ext}`);

    // Store bytes first (overwriting the same key with identical bytes is a no-op).
    await this.storage.put(workspaceId, storageKey, file.buffer, detected.contentType);

    // Idempotent on @@unique([workspaceId, contentHash]) — re-uploading the same
    // bytes reuses the existing file/job and does NOT create a second candidate.
    // We learn whether THIS request was the one to ingest the content by attempting
    // the insert and catching the unique-constraint collision (P2002). A pre-read +
    // upsert would race: two concurrent identical uploads both read null and both
    // report duplicate:false; create-or-collide gives each request the true answer
    // (exactly one wins the insert).
    const uploaded = await this.prisma.uploadedFile.upsert({
      where: { workspaceId_contentHash: { workspaceId, contentHash } },
      update: {},
      create: { workspaceId, storageKey, kind: detected.kind, contentHash },
    });

    let jobAlreadyExisted = false;
    let job;
    try {
      job = await this.prisma.parseJob.create({
        data: {
          workspaceId,
          fileId: uploaded.id,
          contentHash,
          status: "queued",
          ...(batchId ? { batchId } : {}),
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      // Lost the race (or a genuine re-upload) — the job already exists. Reuse it,
      // re-pointing fileId/batchId to this upload, and report it as a duplicate.
      jobAlreadyExisted = true;
      job = await this.prisma.parseJob.update({
        where: { workspaceId_contentHash: { workspaceId, contentHash } },
        data: { fileId: uploaded.id, ...(batchId ? { batchId } : {}) },
      });
    }

    const duplicate = jobAlreadyExisted;

    return {
      detected,
      contentHash,
      storageKey,
      filename: file.filename,
      fileId: uploaded.id,
      parseJobId: job.id,
      status: job.status as ParseJobStatus,
      duplicate,
    };
  }

  private toItemDto(s: StoredFile): UploadedItemDto {
    return {
      fileId: s.fileId,
      filename: s.filename,
      parseJobId: s.parseJobId,
      status: s.status,
      duplicate: s.duplicate,
    };
  }
}

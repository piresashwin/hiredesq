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
  type UploadKind,
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
    // Client-chunked folder drop (transport only, store-then-seal): `grouped` opens
    // a fresh batch with `expectedTotal` (the full folder count) as its fixed total;
    // `batchId` appends a later chunk to that batch; `sealed` (the final chunk) is
    // what actually enqueues the parse work for the WHOLE batch. Chunks before the
    // seal only store bytes — so the batch can't complete before every chunk lands.
    chunk?: { batchId?: string; grouped?: boolean; expectedTotal?: number; sealed?: boolean },
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

    // A chunk of a client-split folder is always folder semantics: store into (or
    // create) the shared batch, never the single-resume/sheet branches. The parse
    // work is enqueued only on the sealed (final) chunk.
    if (chunk?.batchId || chunk?.grouped) {
      return this.ingestMulti(workspaceId, files, jobId, {
        existingBatchId: chunk.batchId,
        expectedTotal: chunk.expectedTotal,
        sealed: chunk.sealed ?? false,
      });
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
    // Non-chunked folder (fits one request): store + enqueue in one go (implicitly sealed).
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
    // Absent for a non-chunked folder (one request — store + enqueue now). Present
    // for a client-chunked drop: `existingBatchId` appends to the batch the first
    // chunk opened (tenant-verified, §1); `expectedTotal` fixes the batch total on
    // creation; `sealed` (final chunk) is what enqueues the whole batch's work.
    chunk?: { existingBatchId?: string; expectedTotal?: number; sealed?: boolean },
  ): Promise<BulkIngestResponse> {
    // A multi-file folder drop is a stream of resume parses (AI) — gate it (§4).
    // Advisory: the worker reserves+refunds per file, so this just blocks the drop
    // up front when the balance is already exhausted.
    await this.requireCredits(workspaceId);
    // Detect everything up front so an unsupported file rejects before we store.
    const detected = files.map((f) => ({ file: f, detected: detectKind(f.filename, f.mimetype) }));

    // Non-chunked callers are implicitly sealed (all files present in one request).
    const sealed = chunk ? (chunk.sealed ?? false) : true;

    let batch: { id: string };
    if (chunk?.existingBatchId) {
      // Append to the batch the first chunk opened. Verify it belongs to THIS
      // workspace (§1 — never trust a query id). The total is fixed at creation
      // from expectedTotal, so there's nothing to mutate here.
      const found = await this.prisma.importBatch.findFirst({
        where: { id: chunk.existingBatchId, workspaceId },
        select: { id: true },
      });
      if (!found) throw new NotFoundException("import batch not found");
      batch = found;
    } else {
      // Open the batch with a FIXED total: the full folder count for a chunked drop
      // (expectedTotal), else this request's file count. A fixed total is what stops
      // an early chunk's parses from flipping the batch to `done` before later chunks
      // land — the completion check (done+failed >= total) only trips at the real end.
      const total = chunk?.expectedTotal ?? files.length;
      batch = await this.prisma.importBatch.create({
        data: { workspaceId, source: "folder", status: "processing", total, jobId: jobId ?? null },
      });

      // First chunk of a CLIENT-CHUNKED drop (chunk defined): schedule the delayed
      // auto-seal safety net. If the client dies before sending the `?sealed=1` final
      // chunk, this fires (15 min later) and seals the batch as `partial`, enqueuing the
      // parse work for whatever bytes landed — so stored PII never orphans and the batch
      // never hangs. singletonKey = batchId (set in enqueueSeal) dedups a re-sent first
      // chunk. The non-chunked path (chunk undefined) seals synchronously below — no timer.
      if (chunk) {
        await this.queue.enqueueSeal(batch.id, { workspaceId, batchId: batch.id, jobId }, 900);
      }
    }

    const stored: StoredFile[] = [];
    for (const { file, detected: d } of detected) {
      stored.push(await this.storeAndRecord(workspaceId, file, d, batch.id));
    }

    if (!sealed) {
      // A pre-seal chunk only stores its bytes — the parse work is enqueued once, on
      // the sealed chunk, for the whole batch. Return the stored items for progress.
      this.logger.log(
        `upload chunk ws=${workspaceId} batch=${batch.id} stored=${stored.length} (awaiting seal)`,
      );
      return { batchId: batch.id, items: stored.map((s) => this.toItemDto(s)) };
    }

    // Sealed: enqueue the whole batch's work in one shot — one coordinator (Batch
    // API) or per-item live parses, decided on the FULL stored count (across all
    // chunks), so a chunked folder still rides a single Message Batch (§5).
    await this.enqueueBatchWork(workspaceId, batch.id, jobId);
    return { batchId: batch.id, items: stored.map((s) => this.toItemDto(s)) };
  }

  /**
   * Enqueue the parse work for every queued file in a batch — reconstructing the
   * item set from the DB so it covers all chunks, not just the sealing request's.
   * One coordinator message above the bulk threshold (Batch API, 50% cheaper, §5),
   * else per-item live parses. Idempotent: enqueueBatch's singletonKey is the
   * batchId and enqueueParse's is the content hash, so a re-sealed/retried request
   * never double-submits.
   */
  private async enqueueBatchWork(
    workspaceId: string,
    batchId: string,
    jobId?: string,
  ): Promise<void> {
    // Idempotency gate: `sealed` is flipped true only AFTER the enqueue succeeds (end of
    // this method), so a `sealed` batch is one whose work is already queued — skip it.
    // CRUCIALLY we do NOT flip `sealed` up front: if this seal crashed between the flip
    // and the enqueue, the delayed safety net (which only no-ops when `sealed` is already
    // true) could never recover it and the batch would hang forever. Setting `sealed`
    // last keeps a crashed seal reclaimable. The real double-submit backstop is the
    // per-job singletonKeys below, so a concurrent slip-through still can't double-enqueue.
    const existing = await this.prisma.importBatch.findFirst({
      where: { id: batchId, workspaceId },
      select: { sealed: true },
    });
    if (!existing || existing.sealed) {
      this.logger.log(`upload seal noop ws=${workspaceId} batch=${batchId} (already sealed)`);
      return;
    }

    // Reconcile the batch total to the count of DISTINCT files actually stored
    // (storeAndRecord dedups by content hash, so a folder with duplicate files has
    // fewer ParseJobs than the client's raw file count). Without this, `expectedTotal`
    // overshoots and `done+failed >= total` never trips — the batch hangs forever.
    // Count all stored jobs (any status) so a re-sealed/retried request sets the same
    // authoritative total even after the worker has started settling some. Done before
    // any work is enqueued (first seal), so it's set before a single parse can run.
    const total = await this.prisma.parseJob.count({
      where: { workspaceId, batchId, NOT: { fileId: null } },
    });
    await this.prisma.importBatch.updateMany({
      where: { id: batchId, workspaceId },
      data: { total },
    });

    const jobs = await this.prisma.parseJob.findMany({
      where: { workspaceId, batchId, status: "queued" },
      select: {
        id: true,
        contentHash: true,
        fileId: true,
        file: { select: { storageKey: true, kind: true } },
      },
    });

    const items: BatchParseItem[] = jobs
      .filter((j) => j.file)
      .map((j) => {
        const ext = j.file!.storageKey.split(".").pop() ?? "";
        return {
          contentHash: j.contentHash,
          kind: j.file!.kind as UploadKind,
          source: "resume_upload" as CandidateSource,
          parseJobId: j.id,
          storageKey: j.file!.storageKey,
          fileId: j.fileId ?? undefined,
          imageMediaType: imageMediaType(ext),
        };
      });

    // Mark sealed even with nothing to enqueue, so the delayed safety net no-ops rather
    // than firing on an empty batch. (Unreachable in practice — a sealed batch always
    // has ≥1 stored file — but keeps the invariant "sealed ⇒ work handled".)
    if (items.length === 0) {
      await this.prisma.importBatch.updateMany({
        where: { id: batchId, workspaceId },
        data: { sealed: true },
      });
      return;
    }

    if (items.length > BULK_BATCH_THRESHOLD) {
      const data: BatchJobData = { workspaceId, batchId, jobId, items };
      await this.queue.enqueueBatch(batchId, data);
    } else {
      for (const item of items) {
        const data: ParseJobData = {
          workspaceId,
          kind: item.kind,
          source: "resume_upload",
          storageKey: item.storageKey,
          fileId: item.fileId,
          batchId,
          contentHash: item.contentHash,
          imageMediaType: item.imageMediaType,
          jobId,
        };
        await this.queue.enqueueParse(item.contentHash, data);
      }
    }

    // Flip `sealed` LAST — only now that the work is durably enqueued. A crash before
    // this leaves `sealed: false`, so the delayed safety net reclaims the batch.
    await this.prisma.importBatch.updateMany({
      where: { id: batchId, workspaceId },
      data: { sealed: true },
    });

    this.logger.log(
      `upload sealed ws=${workspaceId} batch=${batchId} items=${items.length} batched=${items.length > BULK_BATCH_THRESHOLD}`,
    );
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

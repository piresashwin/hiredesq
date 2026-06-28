import type PgBoss from "pg-boss";
import {
  BULK_BATCH_THRESHOLD,
  CV_PARSE_QUEUE,
  CV_PARSE_BATCH_QUEUE,
  imageMediaType,
  type BatchJobData,
  type BatchParseItem,
  type CandidateSource,
  type ParseJobData,
  type SealJobData,
  type UploadKind,
} from "@hiredesq/shared";
import { prisma } from "./parse.processor.js";

/**
 * Delayed auto-seal safety net (CV_SEAL_QUEUE). Fires ~15 min after the first chunk of
 * a client-chunked folder drop. If the explicit `?sealed=1` final chunk already ran, the
 * batch is `sealed: true` and this no-ops. Otherwise the client died before sealing — we
 * win the seal claim, mark the batch `partial`, and enqueue the parse work for whatever
 * bytes landed, so stored PII never orphans and the batch never hangs.
 *
 * Mirrors the API's UploadsService.enqueueBatchWork: same total reconcile, same item
 * reconstruction from the DB, same routing (one Batch coordinator above the threshold,
 * else per-item live parses), and the SAME pg-boss singletonKeys (batchId / contentHash)
 * so a racing explicit seal that slips through dedups instead of double-submitting.
 *
 * Recovery-safe: `sealed`/`partial` are flipped only AFTER the work is enqueued (end of
 * this function), never up front. So if this job crashes mid-seal, `sealed` stays false
 * and pg-boss's retry re-runs the whole thing (the enqueue is idempotent via the
 * singletonKeys). Flipping `sealed` first would let a crashed retry no-op and strand the
 * batch forever. Every Prisma read/write carries the workspaceId predicate (§1); logs
 * ids/counts only (§2).
 */
export async function processSealJob(boss: PgBoss, data: SealJobData): Promise<void> {
  const { workspaceId, batchId, jobId } = data;

  // If the explicit `?sealed=1` seal already ran, the batch is `sealed: true` and its
  // work is queued (the API also flips `sealed` only after enqueuing) → no-op, NOT
  // partial. A non-sealed batch means the client died before sealing — recover it.
  const existing = await prisma.importBatch.findFirst({
    where: { id: batchId, workspaceId },
    select: { sealed: true },
  });
  if (!existing || existing.sealed) {
    console.warn(`[cv-seal] noop batch=${batchId} (already sealed)`);
    return;
  }
  console.warn(`[cv-seal] auto-seal (partial) ws=${workspaceId} batch=${batchId}`);

  // Reconcile the batch total to the count of files actually stored across all chunks
  // (storeAndRecord dedups by content hash). Without this the fixed `expectedTotal`
  // overshoots and `done+failed >= total` never trips — the batch hangs forever.
  const total = await prisma.parseJob.count({
    where: { workspaceId, batchId, NOT: { fileId: null } },
  });
  await prisma.importBatch.updateMany({
    where: { id: batchId, workspaceId },
    data: { total },
  });

  const jobs = await prisma.parseJob.findMany({
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

  // Nothing stored (the client died before any chunk landed bytes). Mark the batch
  // sealed+partial so this safety net doesn't re-fire, and stop.
  if (items.length === 0) {
    await prisma.importBatch.updateMany({
      where: { id: batchId, workspaceId },
      data: { sealed: true, partial: true },
    });
    console.warn(`[cv-seal] empty batch=${batchId} (no stored files)`);
    return;
  }

  if (items.length > BULK_BATCH_THRESHOLD) {
    // singletonKey = batchId → matches the API's enqueueBatch, so a racing explicit seal
    // never coordinates the same batch twice.
    const batchData: BatchJobData = { workspaceId, batchId, jobId, items };
    await boss.send(CV_PARSE_BATCH_QUEUE, batchData, {
      singletonKey: batchId,
      retryLimit: 3,
      retryBackoff: true,
    });
  } else {
    for (const item of items) {
      // singletonKey = contentHash → matches the API's enqueueParse, so re-enqueuing the
      // same content is idempotent end to end.
      const parseData: ParseJobData = {
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
      await boss.send(CV_PARSE_QUEUE, parseData, {
        singletonKey: item.contentHash,
        retryLimit: 3,
        retryBackoff: true,
      });
    }
  }

  // Flip sealed+partial LAST — only now that the work is durably enqueued. A crash
  // before this leaves `sealed: false`, so a pg-boss retry re-runs and recovers (the
  // enqueue above is idempotent via the singletonKeys).
  // NOTE: `partial` here means "the explicit seal didn't complete." If the explicit seal
  // actually enqueued everything but crashed just before its own flip, this safety net
  // re-drives (idempotent) and still marks partial — a cosmetic false-positive on the
  // completion copy only (no data loss, no double work). Accepted over a hang.
  await prisma.importBatch.updateMany({
    where: { id: batchId, workspaceId },
    data: { sealed: true, partial: true },
  });

  console.warn(
    `[cv-seal] sealed ws=${workspaceId} batch=${batchId} items=${items.length} batched=${items.length > BULK_BATCH_THRESHOLD}`,
  );
}

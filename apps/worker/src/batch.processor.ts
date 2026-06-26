import { parseCandidatesBatch, type BatchParseInput } from "@hiredesq/ai";
import type { BatchJobData, BatchParseItem, ParseJobData } from "@hiredesq/shared";
import {
  reserveIngestSlot,
  releaseIngestSlot,
  buildSource,
  bumpBatch,
  embedCandidatesBestEffort,
  markParseDone,
  setParseStatus,
  upsertCandidate,
  type EmbedPair,
} from "./parse.processor.js";
import { toSafeParseError } from "./errors.js";

/**
 * Bulk coordinator (CV_PARSE_BATCH_QUEUE, CLAUDE.md §5 / doc §4). One large drop:
 *   1. Store prebuilt (smart-mapped) items directly — no AI, never metered.
 *   2. RESERVE each AI item's ingest slot UP FRONT (Model B — parsing is free, §F3);
 *      a gated-out item (quota exhausted) is failed and excluded. Reserving atomically
 *      at the gate means no overshoot under concurrency.
 *   3. Submit the gated items as ONE Anthropic Message Batch (50% cheaper).
 *   4. Per result: dedup/store + finalize on success; otherwise fail AND release the
 *      reserved slot — a failed item never consumes quota (§4).
 *   5. Update each item's ParseJob row + the ImportBatch counters; the batch flips
 *      to `done` once done+failed >= total (handled in bumpBatch).
 */
export async function processBatchJob(data: BatchJobData): Promise<void> {
  const { workspaceId, batchId } = data;
  console.warn(`[cv-parse-batch] start batch=${batchId} items=${data.items.length}`);

  const aiItems: BatchParseItem[] = [];
  // Candidates stored this batch, embedded in one batched pass at the end (§5).
  const toEmbed: EmbedPair[] = [];

  // 1. Prebuilt (clean CSV/Excel rows) — store directly, no credit.
  for (const item of data.items) {
    if (item.prebuiltProfile) {
      const candidateId = await storePrebuilt(workspaceId, batchId, item, data.jobId);
      if (candidateId) toEmbed.push({ candidateId, profile: item.prebuiltProfile });
    } else {
      aiItems.push(item);
    }
  }

  // 2. Reserve each AI item's ingest slot up front. A gated-out item (quota
  //    exhausted) is failed now and excluded from the batch submission.
  const inputs: BatchParseInput[] = [];
  const gated = new Map<string, BatchParseItem>(); // customId → item
  const metered = new Set<string>(); // contentHash that actually reserved a slot
  for (const item of aiItems) {
    try {
      if (await reserveIngestSlot(workspaceId, item.contentHash)) metered.add(item.contentHash);
    } catch (err) {
      await setParseStatus(workspaceId, item.contentHash, {
        status: "failed",
        error: toSafeParseError(err, "ingest quota exhausted"),
      });
      await bumpBatch(workspaceId, batchId, { failed: true });
      continue;
    }
    try {
      const source = await buildSource(toParseJobData(workspaceId, batchId, item));
      inputs.push({ customId: item.contentHash, source });
      gated.set(item.contentHash, item);
    } catch (err) {
      // Couldn't even build the source (e.g. fetch/extract failed) — fail it and
      // release the slot reserved just above.
      if (metered.has(item.contentHash)) await releaseIngestSlot(workspaceId);
      await setParseStatus(workspaceId, item.contentHash, {
        status: "failed",
        error: toSafeParseError(err, "source build failed"),
      });
      await bumpBatch(workspaceId, batchId, { failed: true });
    }
  }

  if (inputs.length === 0) {
    // Still embed any prebuilt candidates stored above, then we're done.
    await embedCandidatesBestEffort(workspaceId, toEmbed);
    console.warn(`[cv-parse-batch] done batch=${batchId} (no AI items)`);
    return;
  }

  // 3. Submit → poll → retrieve via packages/ai (§4: AI only through that package).
  const results = await parseCandidatesBatch(inputs);
  const byId = new Map(results.map((r) => [r.customId, r]));

  // 4. Settle per item. Anything missing from the results is treated as failed.
  for (const [contentHash, item] of gated) {
    const result = byId.get(contentHash);
    if (result?.profile) {
      try {
        const { candidateId, outcome } = await upsertCandidate(
          workspaceId,
          result.profile,
          item.source,
          { embed: false, jobId: data.jobId },
        );
        toEmbed.push({ candidateId, profile: result.profile });
        await markParseDone(workspaceId, contentHash, candidateId);
        await bumpBatch(workspaceId, batchId, { done: true, merged: outcome === "merged" });
      } catch (err) {
        if (metered.has(contentHash)) await releaseIngestSlot(workspaceId);
        await setParseStatus(workspaceId, contentHash, {
          status: "failed",
          error: toSafeParseError(err, "store failed"),
        });
        await bumpBatch(workspaceId, batchId, { failed: true });
      }
    } else {
      // Errored / expired / missing — fail it and release its reserved slot (§4).
      if (metered.has(contentHash)) await releaseIngestSlot(workspaceId);
      await setParseStatus(workspaceId, contentHash, {
        status: "failed",
        error: result?.error ?? "no batch result",
      });
      await bumpBatch(workspaceId, batchId, { failed: true });
    }
  }

  // 5. One batched embedding pass for the whole drop (§5) — best-effort.
  await embedCandidatesBestEffort(workspaceId, toEmbed);

  console.warn(`[cv-parse-batch] done batch=${batchId} parsed=${inputs.length}`);
}

/** Store a smart-mapped clean item directly — no reserve/commit, no credit.
 * Returns the candidateId (for the batched embedding pass) or null on failure. */
async function storePrebuilt(
  workspaceId: string,
  batchId: string,
  item: BatchParseItem,
  jobId?: string,
): Promise<string | null> {
  await setParseStatus(workspaceId, item.contentHash, { status: "processing" });
  try {
    const { candidateId, outcome } = await upsertCandidate(
      workspaceId,
      item.prebuiltProfile!,
      item.source,
      { embed: false, jobId },
    );
    await setParseStatus(workspaceId, item.contentHash, { status: "done", candidateId });
    await bumpBatch(workspaceId, batchId, { done: true, merged: outcome === "merged" });
    return candidateId;
  } catch (err) {
    await setParseStatus(workspaceId, item.contentHash, {
      status: "failed",
      error: toSafeParseError(err, "store failed"),
    });
    await bumpBatch(workspaceId, batchId, { failed: true });
    return null;
  }
}

/** Adapt a BatchParseItem to the ParseJobData shape buildSource consumes. */
function toParseJobData(
  workspaceId: string,
  batchId: string,
  item: BatchParseItem,
): ParseJobData {
  return {
    workspaceId,
    batchId,
    kind: item.kind,
    source: item.source,
    payload: item.payload,
    imageMediaType: item.imageMediaType,
    storageKey: item.storageKey,
    fileId: item.fileId,
    filename: item.filename,
    contentHash: item.contentHash,
  };
}

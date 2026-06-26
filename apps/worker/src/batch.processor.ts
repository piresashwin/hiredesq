import {
  submitBatch,
  pollBatch,
  retrieveBatch,
  type BatchParseInput,
  type BatchParseResult,
} from "@hiredesq/ai";
import type { BatchJobData, BatchParseItem, ParseJobData } from "@hiredesq/shared";
import {
  prisma,
  reserveIngestSlot,
  failParseAndReleaseSlot,
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
 *   3. Submit the gated items as ONE Anthropic Message Batch (50% cheaper) and PERSIST
 *      its provider id on the ImportBatch row before polling.
 *   4. Per result: dedup/store + finalize on success; otherwise fail AND release the
 *      reserved slot — a failed item never consumes quota (§4).
 *   5. Update each item's ParseJob row + the ImportBatch counters; the batch flips
 *      to `done` once done+failed >= total (handled in bumpBatch).
 *
 * Retry-safe (§5): the coordinator runs under pg-boss retryLimit:3, so a batch-level
 * throw (Anthropic submit / 24h poll timeout / worker restart) re-runs the whole
 * function. Two durable anchors keep that idempotent:
 *   • providerBatchId on the ImportBatch row — if a batch was already submitted, the
 *     retry RECONNECTS and settles it instead of submitting a second batch for the
 *     same resumes (which would strand the first + re-pay the Batch API).
 *   • ParseJob status — items already `done`/`failed` are skipped; the submitted,
 *     not-yet-settled set is exactly those left `processing`. So a retry never
 *     re-stores, re-submits, or re-bumps the ImportBatch counters for counted work.
 */
export async function processBatchJob(data: BatchJobData): Promise<void> {
  const { workspaceId, batchId } = data;
  console.warn(`[cv-parse-batch] start batch=${batchId} items=${data.items.length}`);

  // Candidates stored this batch, embedded in one batched pass at the end (§5).
  const toEmbed: EmbedPair[] = [];
  const itemByHash = new Map(data.items.map((i) => [i.contentHash, i]));

  // RESUME: a provider batch was already submitted on a prior attempt. Never
  // re-submit — reconnect and settle it. Its AI items are still `processing`.
  const batchRow = await prisma.importBatch.findFirst({
    where: { id: batchId, workspaceId },
    select: { providerBatchId: true },
  });
  if (batchRow?.providerBatchId) {
    console.warn(`[cv-parse-batch] resume batch=${batchId} provider=${batchRow.providerBatchId}`);
    await settleSubmitted(workspaceId, batchId, data.jobId, batchRow.providerBatchId, itemByHash, toEmbed);
    await embedCandidatesBestEffort(workspaceId, toEmbed);
    console.warn(`[cv-parse-batch] done (resumed) batch=${batchId}`);
    return;
  }

  const aiItems: BatchParseItem[] = [];

  // Items that already settled on a PRIOR attempt — `done` (parsed + stored) or
  // `failed` (terminally; a per-item parse failure is not retried by re-running the
  // batch). Skipping them keeps a pre-submit retry idempotent.
  const settled = new Set(
    (
      await prisma.parseJob.findMany({
        where: { workspaceId, batchId, status: { in: ["done", "failed"] } },
        select: { contentHash: true },
      })
    ).map((r) => r.contentHash),
  );

  // 1. Prebuilt (clean CSV/Excel rows) — store directly, no credit.
  for (const item of data.items) {
    if (settled.has(item.contentHash)) continue;
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
  for (const item of aiItems) {
    try {
      // Reserve atomically (claims the pending→processing transition + meters on the
      // free plan). Idempotent on retry; the slot is freed by failParseAndReleaseSlot,
      // which decides release from durable state — not an in-memory "did I reserve" flag.
      await reserveIngestSlot(workspaceId, item.contentHash);
    } catch (err) {
      // Quota exhausted — reserve's transaction rolled back, so no slot is held.
      await failParseAndReleaseSlot(
        workspaceId,
        item.contentHash,
        toSafeParseError(err, "ingest quota exhausted"),
      );
      await bumpBatch(workspaceId, batchId, { failed: true });
      continue;
    }
    try {
      const source = await buildSource(toParseJobData(workspaceId, batchId, item));
      inputs.push({ customId: item.contentHash, source });
    } catch (err) {
      // Couldn't even build the source (fetch/extract failed) — fail it and release
      // the slot reserved just above (durably, from DB state, §4).
      await failParseAndReleaseSlot(
        workspaceId,
        item.contentHash,
        toSafeParseError(err, "source build failed"),
      );
      await bumpBatch(workspaceId, batchId, { failed: true });
    }
  }

  if (inputs.length === 0) {
    // Still embed any prebuilt candidates stored above, then we're done.
    await embedCandidatesBestEffort(workspaceId, toEmbed);
    console.warn(`[cv-parse-batch] done batch=${batchId} (no AI items)`);
    return;
  }

  // 3. Submit ONE Anthropic Message Batch and PERSIST its id BEFORE polling (§4: AI
  //    only through packages/ai). Persisting first is what lets a crash / 24h poll
  //    timeout reconnect on retry instead of submitting a second batch.
  const providerBatchId = await submitBatch(inputs);
  await prisma.importBatch.updateMany({
    where: { id: batchId, workspaceId },
    data: { providerBatchId },
  });
  console.warn(
    `[cv-parse-batch] submitted batch=${batchId} provider=${providerBatchId} items=${inputs.length}`,
  );

  // 4 + 5. Poll → retrieve → settle the submitted items, then one embedding pass.
  await settleSubmitted(workspaceId, batchId, data.jobId, providerBatchId, itemByHash, toEmbed);
  await embedCandidatesBestEffort(workspaceId, toEmbed);

  console.warn(`[cv-parse-batch] done batch=${batchId} parsed=${inputs.length}`);
}

/**
 * Poll the provider batch to completion, then settle every AI item still `processing`
 * for this drop — the submitted-but-unsettled set, derived from durable ParseJob
 * state so a fresh run and a resumed run behave identically (the in-memory gated map
 * doesn't survive a retry). The coordinator is the sole writer of this batch's rows
 * (batchSize:1 + singletonKey), so `processing` == submitted-and-pending.
 *
 * Per result: dedup/store + mark done, or fail + release the slot durably. An item
 * missing from the results is treated as failed. Successes are pushed to `toEmbed`
 * for the caller's single embedding pass.
 */
async function settleSubmitted(
  workspaceId: string,
  batchId: string,
  jobId: string | undefined,
  providerBatchId: string,
  itemByHash: Map<string, BatchParseItem>,
  toEmbed: EmbedPair[],
): Promise<void> {
  await pollBatch(providerBatchId);
  const results = await retrieveBatch(providerBatchId);
  await settleResults(workspaceId, batchId, jobId, results, itemByHash, toEmbed);
}

/**
 * Settle a finished batch's results against the durable `processing` set (§5). Split
 * out from the poll/retrieve so it can be tested without the Anthropic API. Exported
 * for the integration suite.
 */
export async function settleResults(
  workspaceId: string,
  batchId: string,
  jobId: string | undefined,
  results: BatchParseResult[],
  itemByHash: Map<string, BatchParseItem>,
  toEmbed: EmbedPair[],
): Promise<void> {
  const byId = new Map<string, BatchParseResult>(results.map((r) => [r.customId, r]));

  const processing = await prisma.parseJob.findMany({
    where: { workspaceId, batchId, status: "processing" },
    select: { contentHash: true },
  });

  for (const { contentHash } of processing) {
    const item = itemByHash.get(contentHash);
    if (!item) continue; // not an AI item of this drop — leave it untouched
    const result = byId.get(contentHash);
    if (result?.profile) {
      try {
        const { candidateId, outcome } = await upsertCandidate(workspaceId, result.profile, item.source, {
          embed: false,
          jobId,
        });
        toEmbed.push({ candidateId, profile: result.profile });
        await markParseDone(workspaceId, contentHash, candidateId);
        await bumpBatch(workspaceId, batchId, { done: true, merged: outcome === "merged" });
      } catch (err) {
        await failParseAndReleaseSlot(workspaceId, contentHash, toSafeParseError(err, "store failed"));
        await bumpBatch(workspaceId, batchId, { failed: true });
      }
    } else {
      // Errored / expired / missing — fail it and release its reserved slot (§4).
      // result.error is already an enumerated, PII-free constant (retrieveBatch); the
      // helper persists it and frees the slot durably across retries.
      await failParseAndReleaseSlot(workspaceId, contentHash, result?.error ?? "no batch result");
      await bumpBatch(workspaceId, batchId, { failed: true });
    }
  }
}

/** Store a smart-mapped clean item directly — no reserve/commit, no credit.
 * Returns the candidateId (for the batched embedding pass) or null on failure. */
async function storePrebuilt(
  workspaceId: string,
  batchId: string,
  item: BatchParseItem,
  jobId?: string,
): Promise<string | null> {
  // Idempotency (§5): a coordinator retry must not re-store / re-count an item that
  // already settled `done` on a prior attempt. Mirrors storeAndSettlePrebuilt and the
  // single-item path. The step-1 caller also skips settled items; this is the
  // belt-and-braces guard for any direct caller.
  const prior = await prisma.parseJob.findUnique({
    where: { workspaceId_contentHash: { workspaceId, contentHash: item.contentHash } },
    select: { status: true, candidateId: true },
  });
  if (prior?.status === "done" && prior.candidateId) return prior.candidateId;

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

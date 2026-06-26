import type { CandidateProfile } from "@hiredesq/shared";
import { anthropic } from "./client.js";
import {
  buildParseParams,
  profileFromMessage,
  type MessageResponse,
  type ParseSource,
} from "./parse-candidate.js";

/**
 * Bulk parsing via the Anthropic Message Batches API (CLAUDE.md §5, doc §4).
 * 50% cheaper, async — one request per resume, same schema + structured output as
 * the live path (we reuse buildParseParams so extraction is identical). Reserve
 * credits up front, refund the ones that error (the caller / batch coordinator).
 *
 * Caching caveat: the schema/prompt is under Haiku's 4096-token cache minimum, so
 * batched requests don't gain prompt-cache savings either — the win here is the
 * 50% batch discount, not caching.
 */

/** One item to parse in a batch. `customId` ties the result back to the caller. */
export interface BatchParseInput {
  customId: string;
  source: ParseSource;
}

/** Per-item outcome — exactly one of `profile` / `error` is set. */
export interface BatchParseResult {
  customId: string;
  profile?: CandidateProfile;
  error?: string;
}

/** Anthropic's `messages.batches` typed loosely (output_config not in SDK types). */
type Batches = {
  create: (body: {
    requests: Array<{ custom_id: string; params: Record<string, unknown> }>;
  }) => Promise<{ id: string; processing_status: string }>;
  retrieve: (id: string) => Promise<{ processing_status: string }>;
  results: (id: string) => Promise<
    AsyncIterable<{
      custom_id: string;
      result:
        | { type: "succeeded"; message: MessageResponse }
        | { type: "errored"; error: { error?: { message?: string } } }
        | { type: "canceled" }
        | { type: "expired" };
    }>
  >;
};

function batches(): Batches {
  return (anthropic.messages as unknown as { batches: Batches }).batches;
}

/** Submit N parse requests as one batch; returns the batch id to poll. */
export async function submitBatch(items: readonly BatchParseInput[]): Promise<string> {
  const batch = await batches().create({
    requests: items.map((item) => ({
      custom_id: item.customId,
      params: buildParseParams(item.source),
    })),
  });
  return batch.id;
}

/** Poll a batch until processing ends. Resolves once `ended`. */
export async function pollBatch(
  batchId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 30_000;
  const timeoutMs = opts.timeoutMs ?? 24 * 60 * 60 * 1000; // batches expire at 24h
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const batch = await batches().retrieve(batchId);
    if (batch.processing_status === "ended") return;
    if (Date.now() > deadline) throw new Error("batch poll timed out");
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** Retrieve and map a finished batch's results to per-item profile/error. */
export async function retrieveBatch(batchId: string): Promise<BatchParseResult[]> {
  const out: BatchParseResult[] = [];
  const stream = await batches().results(batchId);
  for await (const entry of stream) {
    if (entry.result.type === "succeeded") {
      try {
        out.push({ customId: entry.custom_id, profile: profileFromMessage(entry.result.message) });
      } catch {
        // Safe constant only — profileFromMessage failures (truncation / invalid
        // JSON) would otherwise carry the model's candidate fields (PII, §2).
        out.push({ customId: entry.custom_id, error: "invalid parse output" });
      }
    } else if (entry.result.type === "errored") {
      // The provider error message can echo request content — don't propagate it.
      out.push({ customId: entry.custom_id, error: "batch request errored" });
    } else {
      out.push({ customId: entry.custom_id, error: `batch request ${entry.result.type}` });
    }
  }
  return out;
}

/**
 * Submit → poll → retrieve in one call. The batch coordinator uses this; it has
 * already reserved a credit per item, so it commits/refunds per result.
 */
export async function parseCandidatesBatch(
  items: readonly BatchParseInput[],
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<BatchParseResult[]> {
  if (items.length === 0) return [];
  const batchId = await submitBatch(items);
  await pollBatch(batchId, opts);
  return retrieveBatch(batchId);
}

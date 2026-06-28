import { createHash } from "node:crypto";
import { PrismaClient } from "@hiredesq/database";
import {
  parseCandidate,
  parseCandidatesBatch,
  embedText,
  embedTexts,
  candidateEmbeddingText,
  toVectorLiteral,
  type BatchParseInput,
  type ParseSource,
} from "@hiredesq/ai";
import {
  INGEST_FREE_LIMIT,
  encryptField,
  findDuplicate,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  type ExistingCandidate,
} from "@hiredesq/core";
import {
  BULK_BATCH_THRESHOLD,
  buildNotification,
  type CandidateProfile,
  type ParseJobData,
  type UploadKind,
} from "@hiredesq/shared";
import { Storage, workspaceKey } from "@hiredesq/storage";
import { extractPdf, extractDocx, hasTextLayer, readCsv, readXlsx } from "./extract.js";
import { extractHeadshot } from "./photo.js";
import { mapRow } from "./csv-map.js";
import { toSafeParseError } from "./errors.js";

export const prisma = new PrismaClient();
let storage: Storage | undefined;
function getStorage(): Storage {
  return (storage ??= Storage.fromEnv());
}

/** Outcome of storing one candidate — drives batch counters (§5 dedup rules). */
export type StoreOutcome = "created" | "merged";

/** A stored candidate awaiting its embedding (bulk paths batch these, §5). */
export interface EmbedPair {
  candidateId: string;
  profile: CandidateProfile;
}

// Inputs per Voyage embeddings request for the bulk path — well under Voyage's
// 1000-input / per-request token caps for candidate-sized summaries.
const EMBED_BATCH_SIZE = 128;

/**
 * Process one parse job (CV_PARSE_QUEUE). Routes by kind per INGEST PROTOCOL v2:
 *   pdf  → fetch bytes → text layer? text path : vision
 *   docx → fetch bytes → mammoth → text path
 *   image→ fetch bytes → Haiku vision
 *   text → inline payload → text path (paste)
 *   csv/xlsx → fetch bytes → set batch total → per row smart-map (no AI/credit)
 *              or AI-parse the messy ones; update batch counters per row.
 *
 * Model B (FEATURE-SET §F3): an AI parse is FREE — not drawn from the daily
 * credits (those gate submission generation). Each parse passes the ingest-quota
 * gate (§4) before any AI call and is metered once on success, idempotent on
 * contentHash. A prebuilt profile (clean CSV row) stores directly — never metered.
 */
export async function processParseJob(data: ParseJobData): Promise<{ candidateId?: string }> {
  if (data.kind === "csv" || data.kind === "xlsx") {
    await processSpreadsheet(data);
    return {};
  }

  // A pre-structured row (smart-map) stores directly — no AI, no credit charge.
  if (data.prebuiltProfile) {
    const contentHash = resolveHash(data);
    return storeAndSettlePrebuilt(data, contentHash);
  }

  const contentHash = resolveHash(data);

  // Idempotency (§4/§5): if this content already settled `done` on a prior run,
  // return it — never re-invoke the provider (or re-meter) for an already-parsed
  // job on a pg-boss retry. Mirrors the prebuilt + CSV-row paths.
  const prior = await prisma.parseJob.findUnique({
    where: { workspaceId_contentHash: { workspaceId: data.workspaceId, contentHash } },
    select: { status: true, candidateId: true },
  });
  if (prior?.status === "done" && prior.candidateId) {
    // Backfill the photo if a prior attempt settled `done` but crashed before the
    // photo step (it self-guards on photoKey=null, so this is a safe no-op when the
    // photo already exists). Keeps the idempotent replay from silently dropping it.
    await saveCandidatePhotoBestEffort(data.workspaceId, prior.candidateId, data.kind, data.storageKey);
    return { candidateId: prior.candidateId };
  }

  // 1. Ingest-quota gate (§4 / Model B) — runs BEFORE any AI call. Parsing is free;
  //    this only enforces the free-tier abuse/onboarding ceiling. Atomically reserves
  //    the slot + claims the `processing` transition; throws IngestQuotaError (job
  //    stays queued) when exhausted. `metered` says whether to release on failure.
  const metered = await reserveIngestSlot(data.workspaceId, contentHash);

  try {
    // 2. Build the parse source (route + fetch bytes / extract as needed).
    const src = await buildSource(data);

    // 3. Extract (structured output — already schema-shaped & typed).
    const profile = await parseCandidate(src);

    // 4. Dedup + store.
    const { candidateId, outcome } = await upsertCandidate(data.workspaceId, profile, data.source, {
      jobId: data.jobId,
    });

    // 4b. Pull an embedded headshot from the CV and save it as the candidate photo
    //     (best-effort — never fails the parse).
    await saveCandidatePhotoBestEffort(data.workspaceId, candidateId, data.kind, data.storageKey);

    // 5. Finalize done (idempotent on the done transition; the slot was reserved above).
    await markParseDone(data.workspaceId, contentHash, candidateId);
    await bumpBatch(data.workspaceId, data.batchId, { done: true, merged: outcome === "merged" });
    return { candidateId };
  } catch (err) {
    // Release the reserved slot — never consume quota for work that produced no
    // candidate (§4). The stored error is always a safe, enumerated string
    // (toSafeParseError) — never err.message, which embeds model output / extracted
    // resume fragments (PII, CLAUDE.md §2).
    if (metered) await releaseIngestSlot(data.workspaceId);
    await setParseStatus(data.workspaceId, contentHash, {
      status: "failed",
      error: toSafeParseError(err, "parse failed"),
    });
    await bumpBatch(data.workspaceId, data.batchId, { failed: true });
    throw err;
  }
}

/** Store a smart-mapped clean row directly — no reserve/commit, no credit (§4). */
async function storeAndSettlePrebuilt(
  data: ParseJobData,
  contentHash: string,
): Promise<{ candidateId: string }> {
  // Idempotency by content hash (§5): the prebuilt path has no credit reservation
  // to back-stop a replay, so a clean row imported twice (e.g. a name with no
  // email/phone) would otherwise create a 2nd candidate + a DuplicateSuggestion.
  // If this (workspaceId, contentHash) already settled `done`, no-op and return it.
  const prior = await prisma.parseJob.findUnique({
    where: { workspaceId_contentHash: { workspaceId: data.workspaceId, contentHash } },
    select: { status: true, candidateId: true },
  });
  if (prior?.status === "done" && prior.candidateId) {
    return { candidateId: prior.candidateId };
  }

  await setParseStatus(data.workspaceId, contentHash, { status: "processing" });
  try {
    const { candidateId, outcome } = await upsertCandidate(
      data.workspaceId,
      data.prebuiltProfile!,
      data.source,
      { jobId: data.jobId },
    );
    await setParseStatus(data.workspaceId, contentHash, { status: "done", candidateId });
    await bumpBatch(data.workspaceId, data.batchId, { done: true, merged: outcome === "merged" });
    return { candidateId };
  } catch (err) {
    await setParseStatus(data.workspaceId, contentHash, {
      status: "failed",
      error: toSafeParseError(err, "store failed"),
    });
    await bumpBatch(data.workspaceId, data.batchId, { failed: true });
    throw err;
  }
}

/** Route one file/text job to a ParseSource, fetching + extracting as needed. */
export async function buildSource(data: ParseJobData): Promise<ParseSource> {
  switch (data.kind) {
    case "text":
      return { kind: "text", text: data.payload ?? "" };

    case "image": {
      // Inline base64 (paste) or fetched bytes (upload) → Haiku vision.
      const dataB64 = data.storageKey
        ? (await fetchBytes(data)).toString("base64")
        : (data.payload ?? "");
      console.warn(`[cv-parse] route=vision kind=image hash=${shortHash(resolveHash(data))}`);
      return { kind: "image", data: dataB64, mediaType: data.imageMediaType ?? "image/jpeg" };
    }

    case "docx": {
      const bytes = await fetchBytes(data);
      const text = await extractDocx(bytes);
      console.warn(`[cv-parse] route=text kind=docx hash=${shortHash(resolveHash(data))}`);
      return { kind: "text", text };
    }

    case "pdf": {
      const bytes = await fetchBytes(data);
      const { text, pages } = await extractPdf(bytes);
      if (hasTextLayer(text, pages)) {
        console.warn(`[cv-parse] route=text kind=pdf pages=${pages} hash=${shortHash(resolveHash(data))}`);
        return { kind: "text", text };
      }
      // Image-only / scanned PDF — send the raw PDF as a `document` block. PDF
      // bytes are not a valid image block, so this must NOT use image/png (§5).
      console.warn(`[cv-parse] route=vision kind=pdf pages=${pages} hash=${shortHash(resolveHash(data))}`);
      return { kind: "document", data: bytes.toString("base64"), mediaType: "application/pdf" };
    }

    default:
      throw new Error(`unroutable kind ${String(data.kind)}`);
  }
}

/** A messy (non-mappable) row collected for AI parsing. */
interface MessyRow {
  rowHash: string;
  text: string;
}

/** CSV/XLSX: set the batch total, then smart-map or AI-parse each row. */
async function processSpreadsheet(data: ParseJobData): Promise<void> {
  const bytes = await fetchBytes(data);
  const rows = data.kind === "csv" ? readCsv(bytes) : readXlsx(bytes);
  console.warn(`[cv-parse] route=spreadsheet kind=${data.kind} rows=${rows.length}`);

  if (data.batchId) {
    await prisma.importBatch.updateMany({
      where: { id: data.batchId, workspaceId: data.workspaceId },
      data: { total: rows.length },
    });
  }

  const messy: MessyRow[] = [];
  // Candidates stored this sheet, embedded in one batched pass at the end (§5).
  const toEmbed: EmbedPair[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const profile = mapRow(row);
    // Per-row content hash so re-running the same sheet is idempotent. We create a
    // ParseJob row keyed by rowHash so the existing setParseStatus/idempotency
    // applies — a row that already settled `done` is skipped (§5).
    const rowHash = createHash("sha256")
      .update(`${resolveHash(data)}:${i}:${JSON.stringify(row)}`)
      .digest("hex");

    const prior = await ensureRowParseJob(data, rowHash);
    if (prior === "done") continue; // already ingested on a previous run — no-op.

    if (profile) {
      // Clean row — store directly, no AI, no credit (§4). Best-effort: one bad
      // row must not abort the whole sheet. Embedding is deferred to the batch pass.
      try {
        const { candidateId, outcome } = await upsertCandidate(
          data.workspaceId,
          profile,
          data.source,
          { embed: false, jobId: data.jobId },
        );
        toEmbed.push({ candidateId, profile });
        await setParseStatus(data.workspaceId, rowHash, { status: "done", candidateId });
        await bumpBatch(data.workspaceId, data.batchId, {
          done: true,
          merged: outcome === "merged",
        });
      } catch (err) {
        await setParseStatus(data.workspaceId, rowHash, {
          status: "failed",
          error: toSafeParseError(err, "store failed"),
        });
        await bumpBatch(data.workspaceId, data.batchId, { failed: true });
      }
    } else {
      // Messy row — collect for AI parsing; routed below (Batch API vs live).
      const text = Object.entries(row)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      messy.push({ rowHash, text });
    }
  }

  // Route the messy rows: a big unmappable sheet (>threshold) goes through the
  // Batch API (50% cost, async) rather than N serial full-price calls (§5/cost).
  if (messy.length > BULK_BATCH_THRESHOLD) {
    toEmbed.push(...(await parseMessyRowsBatched(data, messy)));
  } else {
    toEmbed.push(...(await parseMessyRowsLive(data, messy)));
  }

  // One batched embedding pass for the whole sheet (§5) — best-effort.
  await embedCandidatesBestEffort(data.workspaceId, toEmbed);
}

/**
 * Upsert a per-row ParseJob keyed by rowHash so status/idempotency tracking works
 * for CSV rows (which share one sheet-level ParseJob otherwise). Returns "done"
 * when this row already settled on a previous run (caller skips it).
 */
async function ensureRowParseJob(data: ParseJobData, rowHash: string): Promise<"done" | "pending"> {
  const job = await prisma.parseJob.upsert({
    where: { workspaceId_contentHash: { workspaceId: data.workspaceId, contentHash: rowHash } },
    create: {
      workspaceId: data.workspaceId,
      contentHash: rowHash,
      status: "queued",
      ...(data.batchId ? { batchId: data.batchId } : {}),
    },
    update: {},
    select: { status: true },
  });
  return job.status === "done" ? "done" : "pending";
}

/** Messy rows below the bulk threshold — AI-parse each live behind the ingest gate.
 * Returns the stored candidates for the caller's batched embedding pass (§5). */
async function parseMessyRowsLive(data: ParseJobData, messy: MessyRow[]): Promise<EmbedPair[]> {
  const embedded: EmbedPair[] = [];
  for (const { rowHash, text } of messy) {
    let metered = false;
    try {
      metered = await reserveIngestSlot(data.workspaceId, rowHash);
      const parsed = await parseCandidate({ kind: "text", text });
      const { candidateId, outcome } = await upsertCandidate(data.workspaceId, parsed, data.source, {
        embed: false,
        jobId: data.jobId,
      });
      embedded.push({ candidateId, profile: parsed });
      await markParseDone(data.workspaceId, rowHash, candidateId);
      await bumpBatch(data.workspaceId, data.batchId, { done: true, merged: outcome === "merged" });
    } catch (err) {
      if (metered) await releaseIngestSlot(data.workspaceId);
      await setParseStatus(data.workspaceId, rowHash, {
        status: "failed",
        error: toSafeParseError(err, "parse failed"),
      });
      await bumpBatch(data.workspaceId, data.batchId, { failed: true });
    }
  }
  return embedded;
}

/**
 * Messy rows above the bulk threshold — route through the Batch API (mirrors
 * batch.processor): RESERVE each row's ingest slot up front (Model B — parsing is
 * free, §F3), submit one batch, then store-dedup/finalize per result. The slot is
 * reserved atomically at the gate (no overshoot); any reserved row that does NOT
 * reach `done` (store failure / no batch result) RELEASES its slot, so a failed item
 * never consumes quota (§4).
 */
async function parseMessyRowsBatched(data: ParseJobData, messy: MessyRow[]): Promise<EmbedPair[]> {
  const embedded: EmbedPair[] = [];
  const inputs: BatchParseInput[] = [];
  const gated = new Set<string>(); // rowHash of rows that passed the gate → in the batch
  const metered = new Set<string>(); // rowHash that actually reserved a slot → release if not done

  for (const { rowHash, text } of messy) {
    try {
      if (await reserveIngestSlot(data.workspaceId, rowHash)) metered.add(rowHash);
    } catch (err) {
      await setParseStatus(data.workspaceId, rowHash, {
        status: "failed",
        error: toSafeParseError(err, "ingest quota exhausted"),
      });
      await bumpBatch(data.workspaceId, data.batchId, { failed: true });
      continue;
    }
    inputs.push({ customId: rowHash, source: { kind: "text", text } });
    gated.add(rowHash);
  }

  if (inputs.length === 0) return embedded;

  const results = await parseCandidatesBatch(inputs);
  const byId = new Map(results.map((r) => [r.customId, r]));

  for (const rowHash of gated) {
    const result = byId.get(rowHash);
    if (result?.profile) {
      try {
        const { candidateId, outcome } = await upsertCandidate(
          data.workspaceId,
          result.profile,
          data.source,
          { embed: false, jobId: data.jobId },
        );
        embedded.push({ candidateId, profile: result.profile });
        await markParseDone(data.workspaceId, rowHash, candidateId);
        await bumpBatch(data.workspaceId, data.batchId, {
          done: true,
          merged: outcome === "merged",
        });
      } catch (err) {
        if (metered.has(rowHash)) await releaseIngestSlot(data.workspaceId);
        await setParseStatus(data.workspaceId, rowHash, {
          status: "failed",
          error: toSafeParseError(err, "store failed"),
        });
        await bumpBatch(data.workspaceId, data.batchId, { failed: true });
      }
    } else {
      if (metered.has(rowHash)) await releaseIngestSlot(data.workspaceId);
      await setParseStatus(data.workspaceId, rowHash, {
        status: "failed",
        error: result?.error ?? "no batch result",
      });
      await bumpBatch(data.workspaceId, data.batchId, { failed: true });
    }
  }
  return embedded;
}

// ─── Helpers ───

function resolveHash(data: ParseJobData): string {
  return data.contentHash ?? createHash("sha256").update(data.payload ?? "").digest("hex");
}

function shortHash(hash: string): string {
  return hash.slice(0, 8);
}

async function fetchBytes(data: ParseJobData): Promise<Buffer> {
  if (!data.storageKey) throw new Error("no storageKey to fetch bytes from");
  return getStorage().getBytes(data.workspaceId, data.storageKey);
}

/**
 * Best-effort: pull an embedded headshot from the CV and save it as the candidate's
 * photo. A candidate photo is PII (§2) — stored workspace-namespaced under the same
 * `candidate-photos/<id>.<ext>` key the manual-upload path uses (so candidate delete
 * already removes it), bytes never logged. Only DOCX / PDF carry embedded images;
 * other kinds no-op. We never overwrite an existing photo (a manual upload or an
 * earlier parse wins). Failures here are swallowed — extraction is an enhancement,
 * never a reason to fail an otherwise-successful parse.
 */
export async function saveCandidatePhotoBestEffort(
  workspaceId: string,
  candidateId: string,
  kind: UploadKind,
  storageKey: string | undefined,
): Promise<void> {
  if (!storageKey || (kind !== "pdf" && kind !== "docx")) return;
  try {
    const existing = await prisma.candidate.findFirst({
      where: { id: candidateId, workspaceId },
      select: { photoKey: true },
    });
    if (existing?.photoKey) return; // already has a photo — don't clobber it

    const bytes = await getStorage().getBytes(workspaceId, storageKey);
    const photo = await extractHeadshot(kind, bytes);
    if (!photo) return; // no plausible headshot embedded

    const key = workspaceKey(workspaceId, "candidate-photos", `${candidateId}.jpg`);
    await getStorage().put(workspaceId, key, photo.buffer, photo.contentType);
    // updateMany so the workspaceId predicate is enforced (§1); `photoKey: null`
    // makes the set idempotent and races safely with a concurrent manual upload.
    await prisma.candidate.updateMany({
      where: { id: candidateId, workspaceId, photoKey: null },
      data: { photoKey: key },
    });
    console.warn(`[cv-parse] photo saved ws=${workspaceId} candidate=${candidateId} kind=${kind}`);
  } catch {
    // No PII in logs (§2) — ids only. The parse itself already succeeded.
    console.warn(`[cv-parse] photo extract skipped ws=${workspaceId} candidate=${candidateId}`);
  }
}

/** Drive the ParseJob row's status so the ingest UI can poll it (no PII written). */
export async function setParseStatus(
  workspaceId: string,
  contentHash: string,
  patch: { status: "processing" | "done" | "failed"; candidateId?: string; error?: string },
): Promise<void> {
  await prisma.parseJob.updateMany({
    where: { workspaceId, contentHash },
    data: {
      status: patch.status,
      ...(patch.candidateId !== undefined ? { candidateId: patch.candidateId } : {}),
      ...(patch.error !== undefined ? { error: patch.error } : {}),
    },
  });
}

/**
 * Atomically advance an ImportBatch's counters (prisma increment), and flip the
 * batch to `done` once every item has settled. No-op when batchId is absent.
 */
export async function bumpBatch(
  workspaceId: string,
  batchId: string | undefined,
  delta: { done?: boolean; failed?: boolean; merged?: boolean },
): Promise<void> {
  if (!batchId) return;
  // Increment + read-back + completion-flip in ONE transaction so concurrent workers
  // finishing rows of the same batch can't interleave between the bump and the read
  // (the increments themselves are atomic; the read-then-flip is what needs the
  // barrier). Scope every write by workspaceId (§1) — `update` ignores non-unique
  // where fields, so use `updateMany` to keep the tenant predicate enforced.
  await prisma.$transaction(async (tx) => {
    await tx.importBatch.updateMany({
      where: { id: batchId, workspaceId },
      data: {
        ...(delta.done ? { done: { increment: 1 } } : {}),
        ...(delta.failed ? { failed: { increment: 1 } } : {}),
        ...(delta.merged ? { duplicates: { increment: 1 } } : {}),
      },
    });
    const batch = await tx.importBatch.findFirst({
      where: { id: batchId, workspaceId },
      select: {
        total: true,
        done: true,
        failed: true,
        duplicates: true,
        jobId: true,
        status: true,
        // True when the delayed safety net sealed this drop (the client died before the
        // final chunk) — surfaced as a flag in the completion notification (§2, no PII).
        partial: true,
      },
    });
    if (batch && batch.status === "processing" && batch.done + batch.failed >= batch.total) {
      // Guard on status:"processing" so the completion transition fires exactly once.
      const flipped = await tx.importBatch.updateMany({
        where: { id: batchId, workspaceId, status: "processing" },
        data: { status: "done" },
      });
      // Phase 1 trigger: the EXACTLY-ONCE winner (the only call whose conditional flip
      // matched a still-`processing` row) raises the bulk-complete notification IN the
      // same transaction, so it's idempotent and fires once per batch. Same shape as the
      // API's NotificationsService.emit — both go through the shared buildNotification.
      // Counts/ids only, never PII (§2). Notifications are workspace-level (userId null).
      if (flipped.count > 0) {
        const built = buildNotification("bulk_import_complete", {
          batchId,
          total: batch.total,
          done: batch.done,
          duplicates: batch.duplicates,
          failed: batch.failed,
          partial: batch.partial,
        });
        await tx.notification.create({
          data: {
            workspaceId,
            userId: null,
            type: built.type,
            title: built.title,
            body: built.body,
            data: built.data,
          },
        });
      }
    }
  });
}

// ─── Ingest quota gate (Model B, FEATURE-SET §F3 / CLAUDE.md §4) ───
//
// Parsing is FREE — it does NOT touch the daily credit balance (that meter gates
// submission generation). The free tier is instead protected by a lifetime quota:
// a generous onboarding/abuse ceiling so a backlog dump never paywalls on day 1.
// Paid (team) plans are unmetered.

/** Thrown by the gate when a free workspace has exhausted its ingest quota. */
export class IngestQuotaError extends Error {
  constructor() {
    super("ingest quota exhausted");
    this.name = "IngestQuotaError";
  }
}

/**
 * Atomically RESERVE one ingest slot for a free workspace AND claim this job's
 * `processing` transition, in ONE transaction (§4). Runs BEFORE any provider call.
 * Replaces the old read-only gate + separate setParseStatus(processing): the lifetime
 * counter is incremented in the SAME conditional UPDATE that enforces the ceiling, so
 * concurrent in-flight parses can no longer all read the same pre-increment count and
 * overshoot the cap — each call either claims a slot or is rejected.
 *
 * Idempotent per content: only the transition INTO `processing` (from a
 * non-processing/non-done state) reserves, so a pg-boss retry of an already-claimed
 * job reuses the slot it holds instead of double-counting. Returns whether THIS call
 * metered a slot; the caller passes that to `releaseIngestSlot` on failure so a slot
 * is held only for live or successful work (a failed parse no longer consumes quota —
 * a deliberate behaviour change from the old "metered on done only" damper).
 *
 * Throws IngestQuotaError when a free workspace is already at its ceiling; the whole
 * transaction rolls back, so the job stays unclaimed (mirrors the old gate). Paid
 * plans are unmetered. Tenant-scoped (§1).
 */
export async function reserveIngestSlot(workspaceId: string, contentHash: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.findUnique({
      where: { workspaceId },
      select: { ingestUsedLifetime: true, workspace: { select: { plan: true } } },
    });
    if (!account) throw new Error("no credit account for workspace");

    // Claim the processing transition. A retry of an already processing/done job
    // matches zero rows → it reuses the slot it already holds (no re-meter below).
    const claimed = await tx.parseJob.updateMany({
      where: { workspaceId, contentHash, status: { notIn: ["processing", "done"] } },
      data: { status: "processing" },
    });

    if (account.workspace.plan !== "free") return false; // paid: unmetered
    if (claimed.count === 0) return false; // already reserved on a prior attempt

    // Enforce the ceiling IN the increment: zero rows updated ⇒ at/over the cap.
    const metered = await tx.creditAccount.updateMany({
      where: { workspaceId, ingestUsedLifetime: { lt: INGEST_FREE_LIMIT } },
      data: { ingestUsedLifetime: { increment: 1 } },
    });
    if (metered.count === 0) throw new IngestQuotaError();
    return true;
  });
}

/**
 * Release a slot reserved by `reserveIngestSlot` when the parse later fails (§4).
 * Only call it with the `metered` flag `reserveIngestSlot` returned, so paid/reused
 * calls never decrement; the `gt: 0` guard keeps the counter from going negative.
 */
export async function releaseIngestSlot(workspaceId: string): Promise<void> {
  await prisma.creditAccount.updateMany({
    where: { workspaceId, ingestUsedLifetime: { gt: 0 } },
    data: { ingestUsedLifetime: { decrement: 1 } },
  });
}

/**
 * Fail a parse and release any ingest slot it holds — durably, from DB state, so it
 * stays correct across a coordinator retry where the in-memory "did I reserve" flag
 * is lost (§4). The bulk coordinator can throw at the batch level (Anthropic submit /
 * poll-timeout) AFTER items were reserved, leaving them `processing` with a slot held;
 * on the pg-boss retry the `metered` Set is empty, so the old `if (metered) release`
 * never freed those slots — a quota leak. This releases iff THIS call wins the
 * `processing → failed` transition AND the workspace is on the metered (free) plan,
 * so a slot is freed exactly once and never for a paid (unmetered) item.
 *
 * Idempotent: a re-run finds the row already `failed`/`done`, records the error
 * without touching the counter, and never double-releases. Never overwrites a `done`
 * row. The error string must already be safe (toSafeParseError) — never PII (§2).
 * Tenant-scoped (§1).
 */
export async function failParseAndReleaseSlot(
  workspaceId: string,
  contentHash: string,
  error: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Win the processing→failed transition. count>0 ⇒ a slot was held (reserve
    // increments only on the pending→processing claim), so THIS call releases it.
    const flipped = await tx.parseJob.updateMany({
      where: { workspaceId, contentHash, status: "processing" },
      data: { status: "failed", error },
    });
    if (flipped.count === 0) {
      // Not currently processing (quota-rejected → rolled back, already failed, or
      // done): record the error without releasing. Never clobber a `done` row.
      await tx.parseJob.updateMany({
        where: { workspaceId, contentHash, status: { not: "done" } },
        data: { status: "failed", error },
      });
      return;
    }
    const account = await tx.creditAccount.findUnique({
      where: { workspaceId },
      select: { workspace: { select: { plan: true } } },
    });
    if (account?.workspace.plan === "free") {
      await tx.creditAccount.updateMany({
        where: { workspaceId, ingestUsedLifetime: { gt: 0 } },
        data: { ingestUsedLifetime: { decrement: 1 } },
      });
    }
  });
}

/**
 * Finalize a parse as `done` — idempotent on the done transition, keyed by
 * contentHash (a re-enqueue/replay of already-done content is a no-op). The quota was
 * reserved up front at the gate (`reserveIngestSlot`), so this no longer touches the
 * counter; it only flips the job done and attaches the candidate. Tenant-scoped (§1).
 */
export async function markParseDone(
  workspaceId: string,
  contentHash: string,
  candidateId: string,
): Promise<void> {
  await prisma.parseJob.updateMany({
    where: { workspaceId, contentHash, status: { not: "done" } },
    data: { status: "done", candidateId },
  });
}

/**
 * Dedup + store one candidate (§5). Email/phone match → auto-merge into the
 * existing record (resume + chat = one person), counted as a duplicate. A
 * NAME-ONLY match is NOT proof of the same person: create the new candidate AND
 * a pending DuplicateSuggestion linking it to the existing one for review.
 */
export async function upsertCandidate(
  workspaceId: string,
  profile: CandidateProfile,
  source: string,
  // Bulk callers pass { embed: false } and batch-embed the whole drop in one go
  // (embedCandidatesBestEffort) instead of one Voyage call per candidate. `jobId`
  // (F7) attaches the stored candidate to a target position.
  opts: { embed?: boolean; jobId?: string } = {},
): Promise<{ candidateId: string; outcome: StoreOutcome }> {
  const normalizedEmail = normalizeEmail(profile.email);
  const normalizedPhone = normalizePhone(profile.phone);
  const normalizedName = normalizeName(profile.fullName);

  const result = await prisma.$transaction(async (tx) => {
    // Serialize concurrent ingests of the SAME person so the find-then-create dedup
    // below can't race two inserts past each other (the normalized columns are only
    // @@index, not @@unique — there's no DB backstop). The xact-scoped advisory lock
    // auto-releases at commit/rollback; keyed per (workspace, match key). Acquire the
    // keys in a deterministic sorted order so an email-lock and a phone-lock can never
    // deadlock against a concurrent ingest taking them in the other order. Name-only
    // matches stay unlocked — they create + raise a DuplicateSuggestion, never merge.
    const lockKeys = [
      normalizedEmail ? `email:${normalizedEmail}` : null,
      normalizedPhone ? `phone:${normalizedPhone}` : null,
    ]
      .filter((k): k is string => k !== null)
      .sort();
    for (const k of lockKeys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ws:${workspaceId}`}), hashtext(${k}))`;
    }

    const existingRows = await tx.candidate.findMany({
      where: {
        workspaceId,
        OR: [
          ...(normalizedEmail ? [{ normalizedEmail }] : []),
          ...(normalizedPhone ? [{ normalizedPhone }] : []),
          { normalizedName },
        ],
      },
      select: { id: true, normalizedEmail: true, normalizedPhone: true, normalizedName: true },
    });
    const existing: ExistingCandidate[] = existingRows;
    const match = findDuplicate(profile, existing);

    const data = {
      workspaceId,
      fullName: profile.fullName,
      // Encrypted at rest with ENCRYPTION_KEY (CLAUDE.md §2). Normalized columns
      // (below) carry the match keys; the raw values never persist in plaintext.
      emailEncrypted: encryptField(profile.email),
      phoneEncrypted: encryptField(profile.phone),
      normalizedEmail,
      normalizedPhone,
      normalizedName,
      location: profile.location ?? null,
      currentTitle: profile.currentTitle ?? null,
      currentCompany: profile.currentCompany ?? null,
      skills: profile.skills,
      experience: profile.experience as unknown as object,
      education: profile.education as unknown as object,
      // Hard-constraint fields (§2C, F4) — null/empty when the CV didn't state them.
      nationality: profile.nationality ?? null,
      residenceTransferable: profile.residenceTransferable ?? null,
      licenses: profile.licenses ?? [],
      source,
    };

    if (match && match.matchedOn !== "name") {
      // Strong match (email/phone) — merge into the existing candidate. updateMany so
      // the workspaceId predicate is ENFORCED in the WHERE (a bare `update` keys on
      // the unique id and silently ignores the non-unique workspaceId sibling, §1).
      await tx.candidate.updateMany({ where: { id: match.candidateId, workspaceId }, data });
      return { candidateId: match.candidateId, outcome: "merged" as const };
    }

    // No match, or a weak name-only match: always create the NEW candidate.
    const created = await tx.candidate.create({ data });

    if (match && match.matchedOn === "name") {
      // Name collision is not proof — record a pending suggestion for the
      // recruiter to confirm/dismiss; never silently merge (§5).
      await tx.duplicateSuggestion.upsert({
        where: {
          workspaceId_candidateId_duplicateOfId: {
            workspaceId,
            candidateId: created.id,
            duplicateOfId: match.candidateId,
          },
        },
        create: {
          workspaceId,
          candidateId: created.id,
          duplicateOfId: match.candidateId,
          matchedOn: "name",
        },
        update: {},
      });
    }

    return { candidateId: created.id, outcome: "created" as const };
  });

  // Job-centric inbound (§2A, F7): attach the stored candidate to the target
  // position so CVs sourced for a req land on its pipeline. Idempotent + best-effort
  // (a since-deleted job must not fail the parse — the candidate is already in the pool).
  if (opts.jobId) {
    await attachToJobBestEffort(workspaceId, result.candidateId, opts.jobId);
  }

  // Semantic-search embedding (§5) — AFTER the transaction (it's a network call to
  // the Voyage embeddings API; never hold a DB tx open across it). Best-effort:
  // semantic search is an enhancement, so a missing key/slow embedder must NOT fail
  // the parse. Bulk callers pass { embed: false } and batch the whole drop instead.
  if (opts.embed !== false) {
    await embedCandidateBestEffort(workspaceId, result.candidateId, profile);
  }
  return result;
}

/**
 * Attach a candidate to a target job (F7), idempotent on the
 * @@unique([workspaceId, candidateId, jobId]) — a re-parse/merge re-attaches as a
 * no-op. Best-effort + tenant-scoped (§1); swallows errors (e.g. the job was
 * deleted between ingest and parse) so the candidate still lands in the pool.
 */
async function attachToJobBestEffort(
  workspaceId: string,
  candidateId: string,
  jobId: string,
): Promise<void> {
  try {
    await prisma.application.upsert({
      where: { workspaceId_candidateId_jobId: { workspaceId, candidateId, jobId } },
      create: { workspaceId, candidateId, jobId, stage: "sourced" },
      update: {},
    });
  } catch (err) {
    console.warn(
      `[cv-parse] attach skipped candidate=${candidateId} job=${jobId} err=${
        err instanceof Error ? err.name : "unknown"
      }`,
    );
  }
}

/** Write one candidate's embedding via $executeRaw (Prisma has no vector type),
 * workspace-scoped (§1). Never logs the vector or PII (§2). */
async function writeEmbedding(
  workspaceId: string,
  candidateId: string,
  vector: number[],
): Promise<void> {
  const literal = toVectorLiteral(vector);
  await prisma.$executeRaw`
    UPDATE "candidate" SET "embedding" = ${literal}::vector
    WHERE "id" = ${candidateId} AND "workspace_id" = ${workspaceId}
  `;
}

/**
 * Generate and store ONE candidate's embedding, swallowing any error (§5) — used by
 * the live single-resume path. Logs ids only — never PII or the vector (§2).
 */
async function embedCandidateBestEffort(
  workspaceId: string,
  candidateId: string,
  profile: CandidateProfile,
): Promise<void> {
  try {
    await writeEmbedding(workspaceId, candidateId, await embedText(candidateEmbeddingText(profile)));
  } catch (err) {
    console.warn(
      `[cv-parse] embed skipped candidate=${candidateId} err=${
        err instanceof Error ? err.name : "unknown"
      }`,
    );
  }
}

/**
 * Batch-embed a whole bulk drop in ONE Voyage call per chunk (§5 cost/throughput) —
 * instead of one call per candidate. Best-effort per chunk: a failed/absent embedder
 * leaves those candidates' embeddings NULL (re-embedded on a later parse), never
 * failing the ingest. Logs ids/counts only (§2).
 */
export async function embedCandidatesBestEffort(
  workspaceId: string,
  pairs: EmbedPair[],
): Promise<void> {
  for (let i = 0; i < pairs.length; i += EMBED_BATCH_SIZE) {
    const chunk = pairs.slice(i, i + EMBED_BATCH_SIZE);
    try {
      const vectors = await embedTexts(chunk.map((p) => candidateEmbeddingText(p.profile)));
      // Sequential writes keep the §1 workspace predicate on each row update.
      for (let j = 0; j < chunk.length; j += 1) {
        await writeEmbedding(workspaceId, chunk[j]!.candidateId, vectors[j]!);
      }
    } catch (err) {
      console.warn(
        `[cv-parse] embed batch skipped ws=${workspaceId} n=${chunk.length} err=${
          err instanceof Error ? err.name : "unknown"
        }`,
      );
    }
  }
}

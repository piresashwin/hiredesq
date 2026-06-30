// Concurrency / race-condition integration tests for the worker parse pipeline.
// These hit a REAL Postgres (the local dev DB on :5434 by default) — the fixes they
// prove live in SQL (advisory locks, conditional/atomic UPDATEs), so a pure unit test
// can't exercise them. Run via `pnpm test:integration` (loads .env for DATABASE_URL).
// The whole suite skips cleanly when no DB is reachable, so the pure-unit run is safe.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { BatchParseItem, CandidateProfile } from "@hiredesq/shared";
import type { BatchParseResult } from "@hiredesq/ai";
import { Prisma } from "@hiredesq/database";

// The free-tier ingest limit seeded in the before() block below — must match the
// value passed to ingestFreeLimit in the free plan upsert. The old FREE_INGEST_LIMIT
// constant from @hiredesq/core was 1000 (the old seed default); the new target is
// 500 (lifetime, free tier). Keep this in sync with the seed upsert above.
const FREE_INGEST_LIMIT = 500;
// Reuse the processor's OWN PrismaClient so seeds + asserts share its connection/DB.
import {
  prisma,
  upsertCandidate,
  reserveIngestSlot,
  releaseIngestSlot,
  failParseAndReleaseSlot,
  type EmbedPair,
} from "../src/parse.processor.js";
import { settleResults } from "../src/batch.processor.js";

let dbUp = false;
before(async () => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    dbUp = false;
    console.warn("[race.itest] no Postgres reachable — skipping integration suite");
    return;
  }

  // Ensure the Plan reference rows exist before any metered test runs.
  // reserveIngestSlot reads Plan.ingestFreeLimit and Plan.ingestPeriod to decide
  // whether/how to meter; without these rows planRow = null → ingestFreeLimit = null
  // → every tier looks unmetered, so the quota race assertions would pass for the
  // wrong reason. Upsert is idempotent. Values match the locked target config:
  //   free:     500 parses / lifetime, 20 submissions / month
  //   solo_pro: 200 parses / monthly,  100 submissions / month
  //   team:     null (unmetered)
  await prisma.plan.upsert({
    where: { tier: "free" },
    update: { monthlySubmissionAllotment: 20, ingestFreeLimit: 500, ingestPeriod: "lifetime" },
    create: { tier: "free", name: "Free", priceMonthly: new Prisma.Decimal("0.00"), currency: "USD", perSeat: false, monthlySubmissionAllotment: 20, ingestFreeLimit: 500, ingestPeriod: "lifetime", seatLimit: 1 },
  });
  await prisma.plan.upsert({
    where: { tier: "solo_pro" },
    update: { monthlySubmissionAllotment: 100, ingestFreeLimit: 200, ingestPeriod: "monthly" },
    create: { tier: "solo_pro", name: "Solo Pro", priceMonthly: new Prisma.Decimal("29.00"), currency: "USD", perSeat: false, monthlySubmissionAllotment: 100, ingestFreeLimit: 200, ingestPeriod: "monthly", seatLimit: 1 },
  });
  await prisma.plan.upsert({
    where: { tier: "team" },
    update: { monthlySubmissionAllotment: 10000, ingestFreeLimit: null, ingestPeriod: null },
    create: { tier: "team", name: "Team", priceMonthly: new Prisma.Decimal("39.00"), currency: "USD", perSeat: true, monthlySubmissionAllotment: 10000, ingestFreeLimit: null, ingestPeriod: null, seatLimit: 10 },
  });
});
after(async () => {
  await prisma.$disconnect();
});

async function mkWorkspace(opts: { plan?: "free" | "team"; used?: number; periodKey?: string } = {}): Promise<string> {
  const ws = await prisma.workspace.create({ data: { name: "itest-ws", plan: opts.plan ?? "free" } });
  await prisma.creditAccount.create({
    data: {
      workspaceId: ws.id,
      balance: 100,
      monthlyAllotment: 20,
      ingestUsed: opts.used ?? 0,
      // Default to "lifetime" period key (free tier) — tests that exercise monthly
      // rollover can pass a current "YYYY-MM" key via opts.periodKey.
      ingestPeriodKey: opts.periodKey ?? "lifetime",
    },
  });
  return ws.id;
}
// Workspace cascade-deletes candidates / parse jobs / credit account.
async function dropWorkspace(id: string): Promise<void> {
  await prisma.workspace.delete({ where: { id } }).catch(() => {});
}

function profile(email: string, name = "Jane Doe"): CandidateProfile {
  return { fullName: name, email, skills: [], experience: [], education: [] };
}

describe("worker race conditions (integration)", () => {
  it("dedup advisory lock: concurrent ingests of the same email create ONE candidate", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace();
    try {
      // Two ingests of the same person, fired together. Without the advisory lock both
      // find no match and both insert; the lock serializes them so one merges.
      await Promise.allSettled([
        upsertCandidate(ws, profile("jane@example.com"), "itest", { embed: false }),
        upsertCandidate(ws, profile("jane@example.com"), "itest", { embed: false }),
      ]);
      const count = await prisma.candidate.count({
        where: { workspaceId: ws, normalizedEmail: "jane@example.com" },
      });
      assert.equal(count, 1, "exactly one candidate for the shared email");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("dedup advisory lock: concurrent ingests matching on phone create ONE candidate", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace();
    try {
      const p: CandidateProfile = { fullName: "Sam Lee", phone: "+1 (555) 123-4567", skills: [], experience: [], education: [] };
      await Promise.allSettled([
        upsertCandidate(ws, p, "itest", { embed: false }),
        upsertCandidate(ws, { ...p }, "itest", { embed: false }),
      ]);
      const count = await prisma.candidate.count({ where: { workspaceId: ws, normalizedName: "sam lee" } });
      assert.equal(count, 1, "exactly one candidate for the shared phone");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("ingest reserve: concurrent reservations never overshoot the free cap", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // Two slots left. Fire five concurrent reservations — only two may pass.
    const ws = await mkWorkspace({ plan: "free", used: FREE_INGEST_LIMIT - 2 });
    try {
      const hashes = Array.from({ length: 5 }, (_, i) => `hash-${i}`);
      await prisma.parseJob.createMany({
        data: hashes.map((h) => ({ workspaceId: ws, contentHash: h, status: "queued" as const })),
      });
      const results = await Promise.allSettled(hashes.map((h) => reserveIngestSlot(ws, h)));
      const passed = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
      const rejected = results.filter((r) => r.status === "rejected").length;
      assert.equal(passed, 2, "exactly two reservations succeed");
      assert.equal(rejected, 3, "the other three hit IngestQuotaError");
      const acct = await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } });
      assert.equal(acct.ingestUsed, FREE_INGEST_LIMIT, "counter fills to the cap, never past it");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("ingest reserve: a failed parse releases its slot (no quota consumed)", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace({ plan: "free", used: 10 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      const metered = await reserveIngestSlot(ws, "h");
      assert.equal(metered, true);
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 11);
      await releaseIngestSlot(ws);
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 10, "release restores the slot");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("ingest reserve: re-reserving an already-claimed job does not double-count", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace({ plan: "free", used: 0 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "h"), true, "first claim meters");
      assert.equal(await reserveIngestSlot(ws, "h"), false, "retry of a processing job reuses its slot");
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 1, "metered exactly once");
    } finally {
      await dropWorkspace(ws);
    }
  });

  // ── Approaching-ingest-limit upgrade nudge (CLAUDE.md §4/§5) ──
  // The banner threshold for the free (500) ceiling is ceil(500*0.9) = 450. The FIRST
  // parse to bring ingestUsed to/over 450 raises ONE notification; never again this
  // period (guarded by ingestNudgeKey).
  const NUDGE_COUNT = (ws: string) =>
    prisma.notification.count({ where: { workspaceId: ws, type: "ingest_limit_approaching" } });

  it("ingest nudge: concurrent reservations crossing the threshold emit EXACTLY ONE notification", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // Start at 448 (below 450) with 4 free slots; fire four concurrent reservations.
    // They land on 449/450/451/452 — several are ≥450, but only the first to cross
    // sets the marker, so exactly one notification is written.
    const ws = await mkWorkspace({ plan: "free", used: 448 });
    try {
      const hashes = Array.from({ length: 4 }, (_, i) => `n-${i}`);
      await prisma.parseJob.createMany({
        data: hashes.map((h) => ({ workspaceId: ws, contentHash: h, status: "queued" as const })),
      });
      await Promise.allSettled(hashes.map((h) => reserveIngestSlot(ws, h)));
      assert.equal(await NUDGE_COUNT(ws), 1, "exactly one approaching-limit notification");
      const acct = await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } });
      assert.equal(acct.ingestNudgeKey, "lifetime", "marker stamped for this period");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("ingest nudge: a failed parse releasing its slot does NOT re-fire on the next cross", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // 449 → reserve "a" crosses to 450 (notify). It fails and releases back to 449.
    // reserve "b" crosses to 450 AGAIN — but the marker is already set, so silent.
    const ws = await mkWorkspace({ plan: "free", used: 449 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "a", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "a"), true);
      assert.equal(await NUDGE_COUNT(ws), 1, "first cross notifies");
      await releaseIngestSlot(ws);
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "b", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "b"), true);
      assert.equal(await NUDGE_COUNT(ws), 1, "re-crossing the same threshold does not double-fire");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("ingest nudge: a paid (unmetered) workspace is never nudged", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace({ plan: "team", used: 9999 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "h"), false, "paid plan is unmetered");
      assert.equal(await NUDGE_COUNT(ws), 0, "no nudge for an unmetered tier");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("failParseAndReleaseSlot: frees the slot durably even when the in-memory flag is lost", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // The bulk-coordinator retry leak: an item is reserved (slot held, status
    // `processing`) on attempt 1, the coordinator throws at the batch level, and the
    // retry's `metered` Set is empty — so the OLD `if (metered) release` never freed it.
    // The durable helper releases from DB state instead.
    const ws = await mkWorkspace({ plan: "free", used: 10 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "h"), true);
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 11);

      await failParseAndReleaseSlot(ws, "h", "source build failed");
      const job = await prisma.parseJob.findUniqueOrThrow({ where: { workspaceId_contentHash: { workspaceId: ws, contentHash: "h" } } });
      assert.equal(job.status, "failed");
      assert.equal(job.error, "source build failed");
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 10, "slot released exactly once");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("failParseAndReleaseSlot: idempotent — a second call never double-releases", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace({ plan: "free", used: 10 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      await reserveIngestSlot(ws, "h");
      await failParseAndReleaseSlot(ws, "h", "store failed");
      await failParseAndReleaseSlot(ws, "h", "store failed"); // coordinator re-runs
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 10, "released once, not twice");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("failParseAndReleaseSlot: never touches the counter for a paid (unmetered) item", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace({ plan: "team", used: 10 });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      assert.equal(await reserveIngestSlot(ws, "h"), false, "paid plan is unmetered (no slot held)");
      await failParseAndReleaseSlot(ws, "h", "store failed");
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, 10, "paid counter untouched");
      assert.equal((await prisma.parseJob.findUniqueOrThrow({ where: { workspaceId_contentHash: { workspaceId: ws, contentHash: "h" } } })).status, "failed");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("failParseAndReleaseSlot: a quota-rejected item (never processing) is failed without release", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // reserve's transaction rolls back on quota exhaustion, leaving the row in its
    // prior status — the helper must record the failure but NOT decrement the counter.
    const ws = await mkWorkspace({ plan: "free", used: FREE_INGEST_LIMIT });
    try {
      await prisma.parseJob.create({ data: { workspaceId: ws, contentHash: "h", status: "queued" } });
      await assert.rejects(reserveIngestSlot(ws, "h"), /quota/i);
      await failParseAndReleaseSlot(ws, "h", "Free ingest limit reached — upgrade to keep parsing.");
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsed, FREE_INGEST_LIMIT, "counter stays at the cap (nothing was reserved)");
      assert.equal((await prisma.parseJob.findUniqueOrThrow({ where: { workspaceId_contentHash: { workspaceId: ws, contentHash: "h" } } })).status, "failed");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("settleResults: settles only `processing` items and is idempotent on a resume re-run", async (t) => {
    if (!dbUp) return t.skip("no DB");
    // Simulates the HIGH-2 resume path: a provider batch was submitted (id persisted),
    // the coordinator died before settling, and the retry reconnects + settles from
    // durable state. Driven by settleResults so it needs no live Anthropic batch.
    const ws = await mkWorkspace({ plan: "free", used: 10 });
    const acct = () => prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } });
    try {
      const batch = await prisma.importBatch.create({
        data: { workspaceId: ws, source: "bulk_import", total: 2, status: "processing", providerBatchId: "msgbatch_test" },
      });
      await prisma.parseJob.createMany({
        data: [
          { workspaceId: ws, contentHash: "ok", batchId: batch.id, status: "queued" },
          { workspaceId: ws, contentHash: "bad", batchId: batch.id, status: "queued" },
        ],
      });
      // Both AI items reserved on attempt 1 (slot held, status → processing).
      await reserveIngestSlot(ws, "ok");
      await reserveIngestSlot(ws, "bad");
      assert.equal((await acct()).ingestUsed, 12, "two slots reserved");

      const item = (h: string): BatchParseItem => ({ contentHash: h, kind: "text", source: "bulk_import", parseJobId: h });
      const itemByHash = new Map<string, BatchParseItem>([["ok", item("ok")], ["bad", item("bad")]]);
      const results: BatchParseResult[] = [
        { customId: "ok", profile: profile("resume@example.com") },
        { customId: "bad", error: "batch request errored" },
      ];
      const toEmbed: EmbedPair[] = [];
      await settleResults(ws, batch.id, undefined, results, itemByHash, toEmbed);

      const jobs = new Map((await prisma.parseJob.findMany({ where: { workspaceId: ws, batchId: batch.id } })).map((j) => [j.contentHash, j]));
      assert.equal(jobs.get("ok")!.status, "done");
      assert.ok(jobs.get("ok")!.candidateId, "candidate attached on success");
      assert.equal(jobs.get("bad")!.status, "failed");
      assert.equal((await acct()).ingestUsed, 11, "failed item's slot released; the success keeps its slot");
      let b = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
      assert.deepEqual([b.done, b.failed, b.status], [1, 1, "done"], "done+failed == total flips the batch to done");
      assert.equal(toEmbed.length, 1, "only the success is queued for embedding");

      // Resume re-run (e.g. the embedding pass crashed, pg-boss retries): nothing is
      // `processing` now → a complete no-op. No double-count, no double-release.
      await settleResults(ws, batch.id, undefined, results, itemByHash, []);
      b = await prisma.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
      assert.deepEqual([b.done, b.failed], [1, 1], "counters unchanged on resume re-run");
      assert.equal((await acct()).ingestUsed, 11, "no double release on resume");
    } finally {
      await dropWorkspace(ws);
    }
  });
});

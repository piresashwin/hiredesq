// Concurrency / race-condition integration tests for the worker parse pipeline.
// These hit a REAL Postgres (the local dev DB on :5434 by default) — the fixes they
// prove live in SQL (advisory locks, conditional/atomic UPDATEs), so a pure unit test
// can't exercise them. Run via `pnpm test:integration` (loads .env for DATABASE_URL).
// The whole suite skips cleanly when no DB is reachable, so the pure-unit run is safe.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { CandidateProfile } from "@hiredesq/shared";
import { INGEST_FREE_LIMIT } from "@hiredesq/core";
// Reuse the processor's OWN PrismaClient so seeds + asserts share its connection/DB.
import {
  prisma,
  upsertCandidate,
  reserveIngestSlot,
  releaseIngestSlot,
} from "../src/parse.processor.js";

let dbUp = false;
before(async () => {
  try {
    await prisma.$queryRaw`select 1`;
    dbUp = true;
  } catch {
    dbUp = false;
    console.warn("[race.itest] no Postgres reachable — skipping integration suite");
  }
});
after(async () => {
  await prisma.$disconnect();
});

async function mkWorkspace(opts: { plan?: "free" | "team"; used?: number } = {}): Promise<string> {
  const ws = await prisma.workspace.create({ data: { name: "itest-ws", plan: opts.plan ?? "free" } });
  await prisma.creditAccount.create({
    data: {
      workspaceId: ws.id,
      balance: 100,
      dailyAllotment: 5,
      ingestUsedLifetime: opts.used ?? 0,
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
    const ws = await mkWorkspace({ plan: "free", used: INGEST_FREE_LIMIT - 2 });
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
      assert.equal(acct.ingestUsedLifetime, INGEST_FREE_LIMIT, "counter fills to the cap, never past it");
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
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsedLifetime, 11);
      await releaseIngestSlot(ws);
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsedLifetime, 10, "release restores the slot");
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
      assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { workspaceId: ws } })).ingestUsedLifetime, 1, "metered exactly once");
    } finally {
      await dropWorkspace(ws);
    }
  });
});

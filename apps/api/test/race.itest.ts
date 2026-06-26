// Concurrency / race-condition integration tests for the API services. These hit a
// REAL Postgres (the local dev DB on :5434 by default) — the fixes they prove live in
// SQL (conditional/atomic UPDATEs), so a pure unit test can't exercise them. Run via
// `pnpm test:integration` (loads .env for DATABASE_URL / JWT_SECRET / ENCRYPTION_KEY).
// The whole suite skips cleanly when no DB is reachable.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { PrismaClient } from "@hiredesq/database";
import { PlacementsService } from "../src/modules/placements/placements.service.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { InboundEmailService } from "../src/modules/inbound-email/inbound-email.service.js";
import { SubmissionsService } from "../src/modules/submissions/submissions.service.js";
import { hash, verify } from "../src/common/password.js";

const prisma = new PrismaClient();
// Services depend only on `this.prisma` for the methods under test; other ctor deps
// are never reached on these paths, so light stubs suffice.
const placements = new PlacementsService(prisma as never);
const auth = new AuthService(prisma as never, {} as never, {} as never);
const inbound = new InboundEmailService(prisma as never, {} as never, {} as never);
const submissions = new SubmissionsService(prisma as never, {} as never);

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

async function mkWorkspace(): Promise<string> {
  const ws = await prisma.workspace.create({ data: { name: "itest-ws", plan: "free" } });
  return ws.id;
}
async function dropWorkspace(id: string): Promise<void> {
  await prisma.workspace.delete({ where: { id } }).catch(() => {});
}

describe("API race conditions (integration)", () => {
  it("placement fall-through: concurrent reversals reverse the fee exactly once", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace();
    try {
      const cand = await prisma.candidate.create({
        data: { workspaceId: ws, fullName: "C", normalizedName: "c", skills: [], licenses: [], source: "itest" },
      });
      const job = await prisma.job.create({
        data: { workspaceId: ws, title: "Role", requiredNationalities: [], requiredLicenses: [] },
      });
      const placement = await prisma.placement.create({
        data: {
          workspaceId: ws,
          candidateId: cand.id,
          jobId: job.id,
          feeAmount: "1000.00",
          currency: "USD",
          placedAt: new Date(),
          clearsAt: new Date(Date.now() + 30 * 86400_000),
          status: "at_risk",
        },
      });

      const results = await Promise.allSettled([
        placements.fallThrough(ws, placement.id, {} as never),
        placements.fallThrough(ws, placement.id, {} as never),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const rejected = results.filter((r) => r.status === "rejected").length;
      assert.equal(ok, 1, "exactly one reversal succeeds");
      assert.equal(rejected, 1, "the other is rejected as already-reversed");

      const after = await prisma.placement.findUniqueOrThrow({ where: { id: placement.id } });
      assert.equal(after.status, "fell_through");
      assert.equal(after.retainedAmount?.toString(), "0", "full reversal — nothing retained, applied once");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("password reset: concurrent use of one token succeeds once and burns the token", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const email = `reset-${Date.now()}@itest.local`;
    const token = "raw-reset-token";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.create({
      data: {
        email,
        fullName: "R",
        passwordHash: hash("OldPassword1"),
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    try {
      const results = await Promise.allSettled([
        auth.resetPassword({ token, newPassword: "PasswordAlpha1" }),
        auth.resetPassword({ token, newPassword: "PasswordBeta2" }),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "one reset wins");
      assert.equal(results.filter((r) => r.status === "rejected").length, 1, "the racing reuse is rejected");

      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(after.passwordResetTokenHash, null, "token is cleared");
      const winnerAlpha = verify("PasswordAlpha1", after.passwordHash);
      const winnerBeta = verify("PasswordBeta2", after.passwordHash);
      assert.ok(winnerAlpha !== winnerBeta, "password is exactly one of the two, not a mix");
      assert.equal(verify("OldPassword1", after.passwordHash), false, "old password no longer valid");
    } finally {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  });

  it("signup: concurrent signups with the same email yield one user, no orphans", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const email = `signup-${Date.now()}@itest.local`;
    const dto = { email, password: "SignupPass1", fullName: "S", workspaceName: "WS" };
    let createdWsId: string | undefined;
    try {
      const results = await Promise.allSettled([auth.signup({ ...dto }), auth.signup({ ...dto })]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "one signup succeeds");
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      assert.equal(rejected.reason?.status, 409, "the loser gets a 409 Conflict, not a 500");

      const users = await prisma.user.findMany({ where: { email }, include: { memberships: true } });
      assert.equal(users.length, 1, "exactly one user row");
      assert.equal(users[0].memberships.length, 1, "exactly one membership — no orphan workspace");
      createdWsId = users[0].memberships[0].workspaceId;
    } finally {
      if (createdWsId) await dropWorkspace(createdWsId);
      await prisma.user.deleteMany({ where: { email } }).catch(() => {});
    }
  });

  it("inbox token: concurrent first-calls mint one token and both return it", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace();
    try {
      const [a, b] = await Promise.all([inbound.getOrCreateAddress(ws), inbound.getOrCreateAddress(ws)]);
      assert.equal(a.address, b.address, "both callers see the same persisted address");
      const row = await prisma.workspace.findUniqueOrThrow({ where: { id: ws } });
      assert.ok(row.inboxToken, "token persisted");
      assert.ok(a.address.startsWith(row.inboxToken + "@"), "address is built from the persisted token");
    } finally {
      await dropWorkspace(ws);
    }
  });

  it("submission view: concurrent first-opens settle on viewed without error", async (t) => {
    if (!dbUp) return t.skip("no DB");
    const ws = await mkWorkspace();
    try {
      const cand = await prisma.candidate.create({
        data: { workspaceId: ws, fullName: "C", normalizedName: "c", skills: [], licenses: [], source: "itest" },
      });
      const shareToken = `tok-${Date.now()}`;
      await prisma.submission.create({
        data: {
          workspaceId: ws,
          candidateId: cand.id,
          status: "sent",
          summary: "s",
          maskedProfile: {},
          shareToken,
        },
      });
      const [a, b] = await Promise.all([
        submissions.getByToken(shareToken),
        submissions.getByToken(shareToken),
      ]);
      assert.equal(a.status, "viewed");
      assert.equal(b.status, "viewed");
      const row = await prisma.submission.findFirstOrThrow({ where: { shareToken } });
      assert.equal(row.status, "viewed", "the row transitioned to viewed");
    } finally {
      await dropWorkspace(ws);
    }
  });
});

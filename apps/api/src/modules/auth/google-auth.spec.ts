/* eslint-disable @typescript-eslint/no-explicit-any -- the in-memory Prisma double
   below mirrors Prisma's loosely-typed query args; `any` keeps the test fake compact. */
import "reflect-metadata";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import type { AuthResponse, LoginResultDto } from "@hiredesq/shared";
import { AuthService } from "./auth.service.js";
import type { PrismaService } from "../../common/prisma.service.js";
import type { StorageService } from "../../common/storage.service.js";
import type { MailService } from "../../common/mail.service.js";
import type { GoogleIdentity } from "../../common/google.js";

// Google sign-in find-or-create logic. The interesting branches are: reject an
// unverified Google email (account-takeover guard), reject an unverifiable token,
// create a fresh user+workspace+credits, and LINK (never duplicate) when an
// existing email/password account shares the email.

before(() => {
  process.env.JWT_SECRET = "test-secret-not-prod";
});

// These fixtures all have 2FA off, so login always returns tokens (never a
// challenge). Narrow the LoginResultDto union for the assertions below.
function asAuth(res: LoginResultDto): AuthResponse {
  assert.ok("user" in res, "expected an authenticated response, not a 2FA challenge");
  return res;
}

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string | null;
  googleId: string | null;
  fullName: string;
  avatarKey: string | null;
  theme: string;
  onboardedAt?: Date | null;
  workspaceId?: string;
  workspaceName?: string;
}

/** In-memory Prisma double covering only what authenticateGoogle/loadAuthUser touch. */
function fakePrisma(seed: FakeUser[] = []) {
  const users = [...seed];
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;

  const findUnique = async ({ where, include }: any) => {
    const u = users.find(
      (x) =>
        (where.id && x.id === where.id) ||
        (where.email && x.email === where.email) ||
        (where.googleId && x.googleId === where.googleId),
    );
    if (!u) return null;
    if (include?.memberships) {
      return {
        ...u,
        memberships: [
          { id: "m_1", role: "owner", workspaceId: u.workspaceId, workspace: { name: u.workspaceName } },
        ],
      };
    }
    return u;
  };

  const tx = {
    user: {
      create: async ({ data }: any) => {
        const u: FakeUser = {
          id: nextId("user"),
          avatarKey: null,
          theme: "system",
          passwordHash: data.passwordHash ?? null,
          googleId: data.googleId ?? null,
          email: data.email,
          fullName: data.fullName,
        };
        users.push(u);
        return u;
      },
    },
    workspace: {
      create: async ({ data }: any) => ({ id: nextId("ws"), name: data.name }),
    },
    membership: {
      create: async ({ data }: any) => {
        const u = users.find((x) => x.id === data.userId)!;
        u.workspaceId = data.workspaceId;
        return { id: nextId("m"), ...data };
      },
    },
    creditAccount: { create: async () => ({}) },
    // Signup seeds the monthly allotment from the Plan reference row (DB-driven).
    plan: { findUnique: async () => ({ monthlySubmissionAllotment: 20 }) },
  };

  const prisma = {
    user: {
      findUnique,
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    workspace: {
      // workspace name is needed by loadAuthUser; patch it in after create runs
      create: tx.workspace.create,
    },
    $transaction: async (cb: any) => {
      // Capture the created workspace name so loadAuthUser can echo it back.
      const origWsCreate = tx.workspace.create;
      let wsName = "";
      tx.workspace.create = async (args: any) => {
        wsName = args.data.name;
        const ws = await origWsCreate(args);
        return ws;
      };
      const result = await cb(tx);
      tx.workspace.create = origWsCreate;
      // Attach name to whichever user this transaction just created.
      const u = users.find((x) => x.id === result.user.id)!;
      u.workspaceName = wsName;
      return result;
    },
  } as unknown as PrismaService;

  return { prisma, users };
}

function makeService(prisma: PrismaService, identity: GoogleIdentity | Error) {
  const svc = new AuthService(prisma, {} as StorageService, {} as MailService);
  // Stub the external Google auth-code → identity exchange seam.
  (svc as unknown as { resolveGoogleIdentity: (c: string) => Promise<GoogleIdentity> }).resolveGoogleIdentity =
    async () => {
      if (identity instanceof Error) throw identity;
      return identity;
    };
  return svc;
}

const VERIFIED: GoogleIdentity = {
  googleId: "g_123",
  email: "Recruiter@Example.com",
  emailVerified: true,
  name: "Priya Sharma",
};

describe("authenticateGoogle", () => {
  it("rejects an unverified Google email", async () => {
    const { prisma } = fakePrisma();
    const svc = makeService(prisma, { ...VERIFIED, emailVerified: false });
    await assert.rejects(svc.authenticateGoogle({ code: "x" }), UnauthorizedException);
  });

  it("rejects an unexchangeable code", async () => {
    const { prisma } = fakePrisma();
    const svc = makeService(prisma, new Error("bad code"));
    await assert.rejects(svc.authenticateGoogle({ code: "x" }), /invalid Google authorization code/);
  });

  it("creates a new user + workspace for a first-time Google sign-in", async () => {
    const { prisma, users } = fakePrisma();
    const svc = makeService(prisma, VERIFIED);
    const res = asAuth(await svc.authenticateGoogle({ code: "x" }));

    assert.equal(users.length, 1);
    assert.equal(users[0]!.googleId, "g_123");
    assert.equal(users[0]!.passwordHash, null); // Google-only account
    assert.equal(users[0]!.email, "recruiter@example.com"); // normalized
    assert.equal(res.user.workspaceName, "Priya's Workspace"); // derived from name
    assert.ok(res.tokens.accessToken && res.tokens.refreshToken);
  });

  it("links an existing email/password account instead of duplicating it", async () => {
    const { prisma, users } = fakePrisma([
      {
        id: "user_existing",
        email: "recruiter@example.com",
        passwordHash: "scrypt$salt$hash",
        googleId: null,
        fullName: "Priya Sharma",
        avatarKey: null,
        theme: "system",
        workspaceId: "ws_existing",
        workspaceName: "Sharma Talent",
      },
    ]);
    const svc = makeService(prisma, VERIFIED);
    const res = asAuth(await svc.authenticateGoogle({ code: "x" }));

    assert.equal(users.length, 1); // no new user
    assert.equal(res.user.id, "user_existing");
    assert.equal(users[0]!.googleId, "g_123"); // linked
    assert.equal(users[0]!.passwordHash, "scrypt$salt$hash"); // password preserved
    assert.equal(res.user.workspaceName, "Sharma Talent"); // existing workspace kept
  });
});

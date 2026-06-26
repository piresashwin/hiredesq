/* eslint-disable @typescript-eslint/no-explicit-any -- the in-memory Prisma double
   below mirrors Prisma's loosely-typed query args; `any` keeps the test fake compact. */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import type { AuthResponse, LoginResultDto } from "@hiredesq/shared";
import { AuthService } from "./auth.service.js";
import type { PrismaService } from "../../common/prisma.service.js";
import type { StorageService } from "../../common/storage.service.js";
import type { MailService } from "../../common/mail.service.js";

// Passwordless (magic-link) login. The branches that matter: request is a silent
// no-op for an unknown email (no enumeration, no token written); a known email gets
// a hashed token + future expiry. Verify redeems a valid token to tokens and clears
// the columns (single-use); an expired/invalid/reused token is rejected; and a 2FA
// account gets a challenge instead of tokens (2FA still enforced).

before(() => {
  process.env.JWT_SECRET = "test-secret-not-prod";
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function asAuth(res: LoginResultDto): AuthResponse {
  assert.ok("user" in res, "expected an authenticated response, not a 2FA challenge");
  return res;
}

interface FakeUser {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string | null;
  googleId: string | null;
  avatarKey: string | null;
  theme: string;
  timezone: string;
  country: string | null;
  currency: string;
  twoFactorEnabled: boolean;
  tourProgress: Record<string, boolean>;
  onboardedAt: Date | null;
  workspaceId: string;
  workspaceName: string;
  loginTokenHash: string | null;
  loginTokenExpiresAt: Date | null;
}

function seedUser(over: Partial<FakeUser> = {}): FakeUser {
  return {
    id: "user_1",
    email: "recruiter@example.com",
    fullName: "Priya Sharma",
    passwordHash: "scrypt$salt$hash",
    googleId: null,
    avatarKey: null,
    theme: "system",
    timezone: "UTC",
    country: null,
    currency: "USD",
    twoFactorEnabled: false,
    tourProgress: {},
    onboardedAt: null,
    workspaceId: "ws_1",
    workspaceName: "Sharma Talent",
    loginTokenHash: null,
    loginTokenExpiresAt: null,
    ...over,
  };
}

function fakePrisma(seed: FakeUser[]) {
  const users = [...seed];
  const prisma = {
    user: {
      findUnique: async ({ where, include }: any) => {
        const u = users.find(
          (x) => (where.id && x.id === where.id) || (where.email && x.email === where.email),
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
      },
      findFirst: async ({ where }: any) => {
        const now = Date.now();
        return (
          users.find(
            (x) =>
              x.loginTokenHash === where.loginTokenHash &&
              x.loginTokenExpiresAt != null &&
              x.loginTokenExpiresAt.getTime() > now,
          ) ?? null
        );
      },
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
      updateMany: async ({ where, data }: any) => {
        const u = users.find(
          (x) => x.id === where.id && x.loginTokenHash === where.loginTokenHash,
        );
        if (!u) return { count: 0 };
        Object.assign(u, data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaService;
  return { prisma, users };
}

function fakeMail() {
  const calls: Array<{ to: string; firstName?: string; magicUrl: string }> = [];
  const mail = {
    sendMagicLinkEmail: async (email: any) => {
      calls.push(email);
      return { sent: false }; // inert (dev) — the service logs the link instead
    },
  } as unknown as MailService;
  return { mail, calls };
}

function makeService(prisma: PrismaService, mail: MailService) {
  return new AuthService(prisma, {} as StorageService, mail);
}

describe("requestMagicLink", () => {
  it("is a silent no-op for an unknown email (no enumeration, no token written)", async () => {
    const { prisma, users } = fakePrisma([seedUser()]);
    const { mail, calls } = fakeMail();
    const svc = makeService(prisma, mail);

    await svc.requestMagicLink({ email: "stranger@example.com" });

    assert.equal(calls.length, 0, "no email sent for an unknown address");
    assert.equal(users[0]!.loginTokenHash, null, "no token written");
  });

  it("writes a hashed token + future expiry and emails the link for a known email", async () => {
    const { prisma, users } = fakePrisma([seedUser()]);
    const { mail, calls } = fakeMail();
    const svc = makeService(prisma, mail);

    await svc.requestMagicLink({ email: "Recruiter@Example.com" }); // mixed case → normalized

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.to, "recruiter@example.com");
    assert.equal(calls[0]!.firstName, "Priya"); // personal greeting
    assert.match(calls[0]!.magicUrl, /\/magic-link\?token=[a-f0-9]{64}$/);
    // Only the HASH is persisted — never the raw token (§6).
    assert.ok(users[0]!.loginTokenHash && users[0]!.loginTokenHash.length === 64);
    assert.notEqual(users[0]!.loginTokenHash, users[0]!.loginTokenExpiresAt);
    assert.ok(users[0]!.loginTokenExpiresAt!.getTime() > Date.now());
  });
});

describe("verifyMagicLink", () => {
  const RAW = "a".repeat(64);

  it("redeems a valid token: returns tokens and clears the columns (single-use)", async () => {
    const { prisma, users } = fakePrisma([
      seedUser({ loginTokenHash: sha256(RAW), loginTokenExpiresAt: new Date(Date.now() + 60_000) }),
    ]);
    const svc = makeService(prisma, fakeMail().mail);

    const res = asAuth(await svc.verifyMagicLink({ token: RAW }));

    assert.ok(res.tokens.accessToken && res.tokens.refreshToken);
    assert.equal(res.user.id, "user_1");
    assert.equal(users[0]!.loginTokenHash, null, "token cleared on use");
    assert.equal(users[0]!.loginTokenExpiresAt, null);
  });

  it("rejects a reused token (the second redeem matches nothing)", async () => {
    const { prisma } = fakePrisma([
      seedUser({ loginTokenHash: sha256(RAW), loginTokenExpiresAt: new Date(Date.now() + 60_000) }),
    ]);
    const svc = makeService(prisma, fakeMail().mail);

    await svc.verifyMagicLink({ token: RAW }); // first use clears it
    await assert.rejects(svc.verifyMagicLink({ token: RAW }), BadRequestException);
  });

  it("rejects an expired token", async () => {
    const { prisma } = fakePrisma([
      seedUser({ loginTokenHash: sha256(RAW), loginTokenExpiresAt: new Date(Date.now() - 1_000) }),
    ]);
    const svc = makeService(prisma, fakeMail().mail);

    await assert.rejects(svc.verifyMagicLink({ token: RAW }), /invalid or expired login link/);
  });

  it("rejects an unknown token", async () => {
    const { prisma } = fakePrisma([seedUser()]);
    const svc = makeService(prisma, fakeMail().mail);

    await assert.rejects(svc.verifyMagicLink({ token: "nope" }), BadRequestException);
  });

  it("returns a 2FA challenge (not tokens) when the account has 2FA enabled", async () => {
    const { prisma, users } = fakePrisma([
      seedUser({
        twoFactorEnabled: true,
        loginTokenHash: sha256(RAW),
        loginTokenExpiresAt: new Date(Date.now() + 60_000),
      }),
    ]);
    const svc = makeService(prisma, fakeMail().mail);

    const res = await svc.verifyMagicLink({ token: RAW });

    assert.ok("twoFactorRequired" in res, "2FA account gets a challenge, not tokens");
    assert.equal(users[0]!.loginTokenHash, null, "token still consumed before the 2FA step");
  });
});

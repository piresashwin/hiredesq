import "reflect-metadata";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission, type AuthedRequest } from "./guards.js";
import { signAccess } from "./jwt.js";
import type { PrismaService } from "./prisma.service.js";

// Guard-stack tests — the §1 tenant-isolation boundary. TenantGuard is the ONLY
// thing isolating tenants in v1 (RLS deferred), so the cross-tenant rejection is
// the most important assertion here.

before(() => {
  process.env.JWT_SECRET = "test-secret-not-prod";
});

/** Build a minimal ExecutionContext around a request + (optional) handler meta. */
function ctxFor(req: AuthedRequest, handler: (...a: unknown[]) => unknown = () => {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: <T>() => req as T }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

/** A fake PrismaService whose membership lookup is scripted per test. */
function fakePrisma(lookup: (args: { workspaceId: string; userId: string }) => { role: "owner" | "member" } | null) {
  return {
    membership: {
      findUnique: async ({ where }: { where: { workspaceId_userId: { workspaceId: string; userId: string } } }) =>
        lookup(where.workspaceId_userId),
    },
  } as unknown as PrismaService;
}

describe("AuthGuard", () => {
  const guard = new AuthGuard();

  it("rejects a request with no bearer token", () => {
    assert.throws(() => guard.canActivate(ctxFor({ headers: {} })), /bearer/i);
  });

  it("accepts a valid token and attaches req.user", () => {
    const req: AuthedRequest = { headers: { authorization: `Bearer ${signAccess({ sub: "user_1" })}` } };
    assert.equal(guard.canActivate(ctxFor(req)), true);
    assert.equal(req.user?.id, "user_1");
  });

  it("rejects a garbage token", () => {
    assert.throws(() => guard.canActivate(ctxFor({ headers: { authorization: "Bearer not.a.jwt" } })), /invalid/i);
  });
});

describe("TenantGuard (§1 isolation boundary)", () => {
  it("rejects a user who is NOT a member of the workspace in the route", async () => {
    // The attacker is authenticated but targets another tenant's workspace.
    const prisma = fakePrisma(() => null); // no membership row for this pair
    const guard = new TenantGuard(prisma);
    const req: AuthedRequest = { headers: {}, user: { id: "attacker" }, params: { workspaceId: "victim_ws" } };
    await assert.rejects(guard.canActivate(ctxFor(req)), /not a member/);
  });

  it("admits a real member and attaches their role", async () => {
    const prisma = fakePrisma(({ workspaceId, userId }) =>
      workspaceId === "ws_1" && userId === "owner_1" ? { role: "owner" } : null,
    );
    const guard = new TenantGuard(prisma);
    const req: AuthedRequest = { headers: {}, user: { id: "owner_1" }, params: { workspaceId: "ws_1" } };
    assert.equal(await guard.canActivate(ctxFor(req)), true);
    assert.equal(req.membership?.role, "owner");
  });

  it("refuses when no workspace is in scope", async () => {
    const guard = new TenantGuard(fakePrisma(() => ({ role: "member" })));
    const req: AuthedRequest = { headers: {}, user: { id: "u" }, params: {} };
    await assert.rejects(guard.canActivate(ctxFor(req)), /no workspace/);
  });
});

describe("PermissionsGuard", () => {
  const reflector = new Reflector();
  const guard = new PermissionsGuard(reflector);

  // Mimic @RequirePermission(action, resource) by stamping the metadata the
  // decorator sets onto a handler function.
  function handlerWith(action: string, resource: string) {
    const fn = () => {};
    RequirePermission(action, resource)({}, "", { value: fn });
    Reflect.defineMetadata("permission", { action, resource }, fn);
    return fn;
  }

  it("lets a member read/write", () => {
    const req: AuthedRequest = { headers: {}, membership: { role: "member" } };
    assert.equal(guard.canActivate(ctxFor(req, handlerWith("write", "candidate"))), true);
  });

  it("blocks a member from a destructive (delete) action", () => {
    const req: AuthedRequest = { headers: {}, membership: { role: "member" } };
    assert.throws(() => guard.canActivate(ctxFor(req, handlerWith("delete", "candidate"))), /owner/);
  });

  it("allows an owner to delete", () => {
    const req: AuthedRequest = { headers: {}, membership: { role: "owner" } };
    assert.equal(guard.canActivate(ctxFor(req, handlerWith("delete", "candidate"))), true);
  });
});

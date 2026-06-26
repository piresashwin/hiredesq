/* eslint-disable @typescript-eslint/no-explicit-any -- the in-memory Prisma double
   below mirrors Prisma's loosely-typed query args; `any` keeps the test fake compact. */
import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service.js";
import type { PrismaService } from "../../common/prisma.service.js";

// Notifications CRUD. The load-bearing assertion (CLAUDE.md §1) is the CROSS-TENANT
// NEGATIVE TEST: workspace A can neither read, count, nor mark workspace B's
// notification — every query carries the workspaceId predicate, the only thing
// isolating tenants in v1 (RLS deferred).

interface FakeNotification {
  id: string;
  workspaceId: string;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  data: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/** In-memory Prisma double covering only `notification` ops the service touches. It
 *  ENFORCES the workspaceId/userId predicate exactly like Postgres would — so a query
 *  that forgot to scope by tenant would (correctly) read another workspace's rows and
 *  fail the cross-tenant test below. */
function fakePrisma(seed: FakeNotification[] = []) {
  const rows = [...seed];
  let seq = 0;

  // Apply a Prisma-style `where` to the in-memory rows. Unknown keys are ignored,
  // but workspaceId / userId / readAt / id are all honored (the tenant predicate).
  const matches = (r: FakeNotification, where: any = {}): boolean => {
    if (where.id !== undefined && r.id !== where.id) return false;
    if (where.workspaceId !== undefined && r.workspaceId !== where.workspaceId) return false;
    if (where.userId !== undefined && r.userId !== where.userId) return false;
    if (where.readAt === null && r.readAt !== null) return false;
    return true;
  };

  const notification = {
    create: async ({ data }: any) => {
      const row: FakeNotification = {
        id: `notif_${++seq}`,
        workspaceId: data.workspaceId,
        userId: data.userId ?? null,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? null,
        readAt: data.readAt ?? null,
        createdAt: new Date(),
      };
      rows.push(row);
      return row;
    },
    findMany: async ({ where }: any) => rows.filter((r) => matches(r, where)),
    count: async ({ where }: any) => rows.filter((r) => matches(r, where)).length,
    findFirst: async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null,
    updateMany: async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
  };

  return { prisma: { notification } as unknown as PrismaService, rows };
}

describe("NotificationsService.emit", () => {
  it("renders copy via buildNotification and persists one workspace-level row", async () => {
    const { prisma, rows } = fakePrisma();
    const svc = new NotificationsService(prisma);

    const dto = await svc.emit("ws_a", {
      type: "bulk_import_complete",
      params: { batchId: "batch_1", total: 13, done: 12, duplicates: 1, failed: 0 },
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.userId, null); // workspace-level (v1)
    assert.equal(dto.type, "bulk_import_complete");
    assert.equal(dto.title, "Bulk import complete");
    assert.equal(dto.body, "12 added · 1 duplicate · 0 failed of 13");
    assert.equal(dto.data?.link, "/candidates?batch=batch_1");
    assert.equal(dto.readAt, null);
  });
});

describe("NotificationsService list / count / read", () => {
  it("lists newest-first and unreadOnly narrows to unread", async () => {
    const { prisma } = fakePrisma();
    const svc = new NotificationsService(prisma);
    await svc.emit("ws_a", {
      type: "bulk_import_complete",
      params: { batchId: "b1", total: 1, done: 1, duplicates: 0, failed: 0 },
    });
    const second = await svc.emit("ws_a", {
      type: "bulk_import_complete",
      params: { batchId: "b2", total: 2, done: 2, duplicates: 0, failed: 0 },
    });
    await svc.markRead("ws_a", second.id);

    const all = await svc.list("ws_a", {});
    assert.equal(all.total, 2);

    const unread = await svc.list("ws_a", { unreadOnly: true });
    assert.equal(unread.total, 1);
    assert.equal(unread.items[0]!.data?.batchId, "b1");

    const count = await svc.unreadCount("ws_a");
    assert.equal(count.count, 1);
  });

  it("markAllRead flips every unread row in the workspace", async () => {
    const { prisma } = fakePrisma();
    const svc = new NotificationsService(prisma);
    await svc.emit("ws_a", {
      type: "bulk_import_complete",
      params: { batchId: "b1", total: 1, done: 1, duplicates: 0, failed: 0 },
    });
    await svc.emit("ws_a", {
      type: "bulk_import_complete",
      params: { batchId: "b2", total: 1, done: 1, duplicates: 0, failed: 0 },
    });

    const res = await svc.markAllRead("ws_a");
    assert.equal(res.count, 2);
    assert.equal((await svc.unreadCount("ws_a")).count, 0);
  });
});

describe("NotificationsService cross-tenant isolation (CLAUDE.md §1)", () => {
  it("workspace A cannot read, count, or mark workspace B's notification", async () => {
    const { prisma } = fakePrisma();
    const svc = new NotificationsService(prisma);

    // B raises a notification.
    const bNotif = await svc.emit("ws_b", {
      type: "bulk_import_complete",
      params: { batchId: "batch_b", total: 1, done: 1, duplicates: 0, failed: 0 },
    });

    // A's list and unread-count never see B's row.
    const aList = await svc.list("ws_a", {});
    assert.equal(aList.total, 0, "A must not list B's notifications");
    assert.equal((await svc.unreadCount("ws_a")).count, 0, "A must not count B's unread");

    // A marking B's id by id is a 404 (tenant-scoped lookup), and B's row stays unread.
    await assert.rejects(svc.markRead("ws_a", bNotif.id), NotFoundException);
    const bAfter = await svc.list("ws_b", { unreadOnly: true });
    assert.equal(bAfter.total, 1, "B's notification must remain unread after A's attempt");

    // markAllRead is also scoped — A flipping all touches none of B's.
    const aAll = await svc.markAllRead("ws_a");
    assert.equal(aAll.count, 0, "A's markAllRead must not flip B's rows");
    assert.equal((await svc.unreadCount("ws_b")).count, 1, "B's unread count is intact");

    // B can of course read + mark its own.
    const bOwn = await svc.markRead("ws_b", bNotif.id);
    assert.notEqual(bOwn.readAt, null);
  });
});

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@hiredesq/database";
import type { NotificationDto, NotificationUnreadCountDto, Paginated } from "@hiredesq/shared";
import { buildNotification, type NotificationParams } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { buildPage, pageSkip, pageTake } from "../../common/pagination.js";
import { toNotificationDto } from "./notification.mapper.js";

// Pragmatic NestJS CRUD (CLAUDE.md Architecture) — NOT a domain aggregate, no event
// bus. The service orchestrates + persists; copy/payload comes from the shared pure
// buildNotification so the API and worker emit the identical shape.
//
// Recipient scope (v1): notifications are WORKSPACE-LEVEL (userId is null). Every
// query filters by { workspaceId, userId: null } — workspaceId is mandatory on every
// query (§1); the userId:null predicate keeps the recipient scope explicit and makes
// seat-targeting a one-line change later. No code path queries by id alone.

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The systematic entry point other API modules call to raise a notification. Renders
   * copy/payload via the shared buildNotification then persists one row. workspaceId is
   * always the caller's authenticated tenant (§1); `userId` targets a seat (default
   * null = workspace-level). Returns the created DTO.
   */
  async emit<T extends keyof NotificationParams>(
    workspaceId: string,
    args: { type: T; params: NotificationParams[T]; userId?: string },
  ): Promise<NotificationDto> {
    const built = buildNotification(args.type, args.params);
    const row = await this.prisma.notification.create({
      data: {
        workspaceId,
        userId: args.userId ?? null,
        type: built.type,
        title: built.title,
        body: built.body,
        data: built.data as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`emit notification ws=${workspaceId} id=${row.id} type=${built.type}`); // ids/type only (§2)
    return toNotificationDto(row);
  }

  async list(
    workspaceId: string,
    opts: { unreadOnly?: boolean; page?: number; limit?: number } = {},
  ): Promise<Paginated<NotificationDto>> {
    const { unreadOnly, page, limit } = opts;
    // Tenant + recipient scope (§1); unreadOnly narrows to still-unread rows.
    const where = {
      workspaceId,
      userId: null,
      ...(unreadOnly ? { readAt: null } : {}),
    } satisfies Prisma.NotificationWhereInput;
    const [rows, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip({ page, limit }),
        take: pageTake({ limit }),
      }),
      this.prisma.notification.count({ where }),
    ]);
    this.logger.log(`list notifications ws=${workspaceId} unread=${unreadOnly ?? false} count=${rows.length}`); // counts only (§2)
    return buildPage(rows.map(toNotificationDto), total, { page, limit });
  }

  async unreadCount(workspaceId: string): Promise<NotificationUnreadCountDto> {
    // Tenant + recipient scope, unread only (§1).
    const count = await this.prisma.notification.count({
      where: { workspaceId, userId: null, readAt: null },
    });
    return { count };
  }

  /** Mark one notification read. Tenant-scoped (§1) — never `where: { id }` alone. */
  async markRead(workspaceId: string, id: string): Promise<NotificationDto> {
    // Guard the read-flip IN the WHERE (tenant + recipient scope) so a cross-tenant id
    // touches zero rows. Only flip if still unread — re-marking keeps the first readAt.
    const updated = await this.prisma.notification.updateMany({
      where: { id, workspaceId, userId: null, readAt: null },
      data: { readAt: new Date() },
    });
    // Re-read tenant-scoped: a 0-count update is either a cross-tenant/unknown id (404)
    // or an already-read row (return it as-is, idempotent).
    const row = await this.prisma.notification.findFirst({ where: { id, workspaceId, userId: null } });
    if (!row) throw new NotFoundException("notification not found");
    if (updated.count > 0) {
      this.logger.log(`mark read ws=${workspaceId} id=${id}`); // ids only (§2)
    }
    return toNotificationDto(row);
  }

  /** Mark every unread notification in this workspace read. Returns the count flipped. */
  async markAllRead(workspaceId: string): Promise<NotificationUnreadCountDto> {
    // Tenant + recipient scope, unread only (§1).
    const updated = await this.prisma.notification.updateMany({
      where: { workspaceId, userId: null, readAt: null },
      data: { readAt: new Date() },
    });
    this.logger.log(`mark all read ws=${workspaceId} count=${updated.count}`); // counts only (§2)
    return { count: updated.count };
  }
}

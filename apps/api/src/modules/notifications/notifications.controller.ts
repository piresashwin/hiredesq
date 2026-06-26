import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { NotificationDto, NotificationUnreadCountDto, Paginated } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { NotificationsService } from "./notifications.service.js";
import { ListNotificationsQuery } from "./notifications.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/notifications")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission("read", "notification")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListNotificationsQuery,
  ): Promise<Paginated<NotificationDto>> {
    return this.notifications.list(workspaceId, {
      unreadOnly: query.unreadOnly,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get("unread-count")
  @RequirePermission("read", "notification")
  unreadCount(@Param("workspaceId") workspaceId: string): Promise<NotificationUnreadCountDto> {
    return this.notifications.unreadCount(workspaceId);
  }

  @Post(":id/read")
  @RequirePermission("write", "notification")
  markRead(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<NotificationDto> {
    return this.notifications.markRead(workspaceId, id);
  }

  @Post("read-all")
  @RequirePermission("write", "notification")
  @HttpCode(200)
  markAllRead(@Param("workspaceId") workspaceId: string): Promise<NotificationUnreadCountDto> {
    return this.notifications.markAllRead(workspaceId);
  }
}

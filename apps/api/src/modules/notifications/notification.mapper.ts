import type { Notification } from "@hiredesq/database";
import type { NotificationData, NotificationDto, NotificationType } from "@hiredesq/shared";

// A Notification row → its API DTO. `type` is stored as a free string column but is
// always a NotificationType (written through buildNotification); `data` is the JSON
// payload (ids/counts + link target — no PII, §2). Dates serialize to ISO strings.
export function toNotificationDto(row: Notification): NotificationDto {
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data: (row.data as NotificationData | null) ?? null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

# Notifications

The notification system is a **cross-cutting primitive**: a single, reusable,
workspace-scoped in-app feed that every module emits into — *not* a per-feature
bolt-on, and *not* a domain aggregate. It is pragmatic NestJS CRUD (CLAUDE.md →
Architecture); tactical DDD stays the three invariant-rich areas (credit ledger,
`Money`, candidate identity). There is no event bus and no `packages/core` model.

> **Delivery is in-app only for v1.** No email/push. A `userId` column exists so
> notifications can be targeted at one seat later (the team tier), but today every
> notification is **workspace-level** (`userId = null`). Channel expansion and
> preferences wait until the team tier justifies them (PLAN.md R7).

## The shape (one contract, both sides)

A notification is `{ workspaceId, userId?, type, title, body, data?, readAt?, createdAt }`
(`Notification` model in [schema.prisma](../packages/database/prisma/schema.prisma)).
The **copy and payload** are rendered by one pure function so the API and the worker
produce a **byte-identical** shape:

- [`buildNotification(type, params)`](../packages/shared/src/notifications.ts) — pure,
  no Prisma / Nest / I/O. Returns `{ type, title, body, data }`. The `switch` is
  **exhaustive over `NotificationType`** with no `default`, so adding a type without a
  case is a compile error. Copy renders **ids/counts only — never PII (§2)**.
- Types + the persisted/DTO shapes live in
  [`contracts.ts`](../packages/shared/src/contracts.ts): `NotificationType`,
  `NotificationParams`, `NotificationData`, `NotificationDto`,
  `ListNotificationsInput`, `NotificationUnreadCountDto`.

## How to raise a notification

**From the API** — inject `NotificationsService` and call the systematic entry point:

```ts
await this.notifications.emit(workspaceId, {
  type: "bulk_import_complete",
  params: { batchId, total, done, duplicates, failed },
  // userId?: string  // omit = workspace-level (v1 default)
});
```

`emit` is generic over the type, so `params` is type-checked against that type's
`NotificationParams` entry. `workspaceId` is **always the caller's authenticated
tenant** (§1) — never from the body.

**From the worker** — the worker can't inject a Nest service, so it calls the same
pure `buildNotification` and does the `prisma.notification.create` itself. Keep the
shape identical to `emit`. The bulk-complete trigger
([parse.processor.ts](../apps/worker/src/parse.processor.ts) `bumpBatch`) is the
reference: it emits **inside the exactly-once `processing → done` transaction**
(guarded on `status: "processing"`), so it fires once per batch and is idempotent for
free. Wire any worker-side trigger to a genuine exactly-once transition the same way.

## Adding a new notification type

1. Add the type to the `NotificationType` union and a `NotificationParams[type]`
   entry in [`contracts.ts`](../packages/shared/src/contracts.ts) /
   [`notifications.ts`](../packages/shared/src/notifications.ts).
2. Add its `case` to `buildNotification` (title/body/`data` with a `link` target).
   The exhaustive `switch` forces this — it won't compile otherwise.
3. Call `emit` (API) or `buildNotification` + `create` (worker) from the trigger.
4. **No PII** in title/body/data — counts, ids, and system copy only (§2).

## Invariants this system must keep

- **Tenant scope (§1).** Every query filters `{ workspaceId, userId: null }`; reads
  are never keyed on a bare `{ id }`. `markRead` guards the flip in the `WHERE`
  (`updateMany` with `{ id, workspaceId, userId: null }`) so a cross-tenant id touches
  zero rows. The controller (`workspaces/:workspaceId/notifications`) carries the full
  guard stack + `@RequirePermission(_, "notification")`.
- **No PII (§2).** Notifications carry counts/ids and system-rendered copy only.
  Logs are ids/counts/type only. The `NotificationData` type is intentionally
  permissive (an open index signature), so the no-PII guarantee rests on the reviewed
  `buildNotification` body and the `pii-privacy-auditor` — do not pass candidate
  names/emails/phones into params.
- **Idempotency.** Worker triggers emit inside the exactly-once state transition they
  key off; re-running the job must not double-emit.

## Endpoints (web → API)

Mounted at `workspaces/:workspaceId/notifications`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Paginated feed; `?unreadOnly=true` narrows to unread |
| `GET` | `/unread-count` | `{ count }` for the bell badge |
| `POST` | `/:id/read` | Mark one read (idempotent) |
| `POST` | `/read-all` | Mark all read; returns the count flipped |

Web client methods (`listNotifications`, `notificationUnreadCount`,
`markNotificationRead`, `markAllNotificationsRead`) live in
[api.ts](../apps/web/src/lib/api.ts) and use the shared types. The
[`NotificationBell`](../apps/web/src/components/shell/NotificationBell.tsx) in the top
bar polls unread-count every 60s and refetches on window focus.

## Triggers

| Trigger | Status | Notes |
|---|---|---|
| `bulk_import_complete` | **Shipped** (PLAN Phase 6) | Worker, exactly-once at batch `done` flip. Serves the §2A "200 resumes" activation moment. |
| At-risk placement nearing the guarantee window | **Planned — PLAN R7**, gated on R2 | Needs a **daily pg-boss scheduled sweep** (the one new piece of infra — pg-boss is event-triggered only today), deduped per threshold. Highest money value (§2E). |
| Low-balance / cap-hit nudge | **Planned — PLAN R7**, gated on billing | *Not* "credits expiring" — daily credits don't accrue, nothing expires. Emits on a low-balance threshold or a `no_credits` block, wired to the upgrade prompt. Routes through the credit aggregate (§4). |

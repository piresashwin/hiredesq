---
name: nestjs-module
description: Scaffold a new NestJS feature module in apps/api matching hiredesq conventions — workspace-scoped controller with the full guard stack, service with workspaceId-scoped Prisma queries, class-validator DTOs, and a spec with a cross-tenant negative test. Use when adding an API feature that touches workspace data.
---

# NestJS module scaffold

Generate a feature module consistent with existing ones (study an existing module
under `apps/api/src/modules/` as the reference). Read `CLAUDE.md` §1.

## Steps

1. **Controller** (`<feature>.controller.ts`):
   - Mounted under `workspaces/:workspaceId/...`.
   - `@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)` on the class.
   - Each handler: `@RequirePermission(action, resource)` (`read`/`write` +
     resource name), takes `@Param('workspaceId') workspaceId: string` and
     `@Request() req` for `req.user.id`. **Never read `workspaceId` from the body.**

2. **Service** (`<feature>.service.ts`):
   - Methods take `workspaceId` as the first argument.
   - **Every** Prisma query filters by it: prefer `findFirst` / `updateMany` /
     `deleteMany` with `{ id, workspaceId }` over `findUnique`/`update`/`delete`
     keyed on a bare `{ id }` (the predicate must live in the WHERE, not be a cosmetic
     sibling Prisma ignores). Lists use `where: { workspaceId }` (`CLAUDE.md` §1).
   - App-layer scoping is the only isolation in v1 (RLS deferred) — the predicate
     is mandatory, with no backstop.
   - **Lists are bounded.** Every list endpoint takes a `PaginationQuery` (limit +
     cursor/offset, `@IsInt @Min(1) @Max(100)`) and passes a `take` to `findMany`.
     No unbounded `findMany` returning a collection — it's a latency and memory
     bomb the moment a workspace bulk-imports.
   - **Project with `select`.** Reads on large/PII tables (candidates especially)
     use an explicit `select` for the projection the caller needs — don't pull every
     column + JSON blob, and don't decrypt contact fields on list/search paths
     (decrypt only on single-record/export). Over-fetch is both a perf cost and a
     PII surface (`CLAUDE.md` §2).
   - **≥2 dependent writes ⇒ one `$transaction`.** Any operation that does two or
     more writes that must succeed together (merge + status flip, create + ledger
     entry) wraps them in a single transaction. A best-effort external side effect
     (storage delete) can stay outside, but the DB writes are one unit.
   - **Type partial updates as `Prisma.<Model>UpdateManyMutationInput`**, never
     `Record<string, unknown>` — the loose type defeats Prisma's compile-time field
     checking on a tenant table.
   - **Domain logic doesn't live here.** Credit, money, and candidate-identity
     rules belong in `packages/core` (credit-ledger aggregate, `Money` value
     object, candidate-identity service). The service orchestrates and persists;
     it calls into `core` for the invariants (`CLAUDE.md` → Architecture).
   - Use a `Logger`; never log candidate PII (`CLAUDE.md` §2). Money is `Decimal`.

3. **DTOs** (`<feature>.dto.ts`): class-validator decorators; no `workspaceId`
   field (it comes from the route). **Enums and currencies are `@IsIn(...)`, not
   free `@IsString`** — an unvalidated `currency`/`status` string silently corrupts
   the revenue dashboard and the data model. List DTOs extend the shared
   `PaginationQuery`.
   - **Each request DTO `implements` a shared `*Input` type from `packages/shared`**
     (define the `*Input` there first — it's the single source of truth, and the web
     client imports that *same* type, never a local copy). This parity makes a
     renamed/retyped field a **compile error on both sides** instead of a silent
     runtime failure: the global `ValidationPipe({ whitelist: true })` *strips*
     unknown body fields without erroring, so a client field the DTO doesn't declare
     just vanishes and the real field arrives `undefined` — exactly how the ingest
     box shipped sending `text` when the DTO wanted `payload`. Responses are shared
     `*Dto` types the same way. Add/rename a body field ⇒ edit the shared type first.

4. **Module + wiring**: declare controller/service, import into the parent module.
   Add the request/response types to `packages/shared/src/contracts.ts` and wire the
   matching `api.*` method into `apps/web/src/lib/api.ts` using those shared types.

5. **Spec** (`<feature>.spec.ts`): happy path **plus** a cross-tenant negative test
   — a request for another workspace's `id` must return nothing / 404, never data.

## If the feature calls the AI provider

Route the call through the credit gate (`/credit-gate`) and the parse pipeline
(`/cv-parse-pipeline`) — don't call `packages/ai` directly without reserving credits.

## Verify

Run the `tenant-security-auditor` agent on the new module and `pnpm typecheck`.
`typecheck` is what enforces contract parity — if the DTO `implements` the shared
`*Input` and the web imports it, a field-name/type mismatch fails the build. A green
typecheck across `api` **and** `web` is the proof the contract lines up end to end.

## Output

The controller/service/dto/module/spec files, and the parent-module import edit.

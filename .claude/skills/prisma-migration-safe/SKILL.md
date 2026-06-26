---
name: prisma-migration-safe
description: Create a safe, zero-downtime Prisma migration for hiredesq's multi-tenant Postgres+RLS database — tenant-scoped tables with RLS, workspace-scoped uniqueness, index coverage, Decimal money columns, and expand-and-contract for breaking changes. Use when changing packages/database/prisma/schema.prisma.
---

# Safe Prisma migration

Read `CLAUDE.md` §1–§3. Migrations hit a shared production DB serving many firms.

## Steps

1. **Edit the schema** (`packages/database/prisma/schema.prisma`):
   - New tenant-scoped models get a `workspaceId` column, an FK to `Workspace`,
     and **workspace-scoped uniqueness** (`@@unique([workspaceId, …])`, never a
     bare global `@unique`).
   - Index `workspaceId` and hot lookup columns — but **derive the index from the
     real query, not a guess.** Open the service that reads the table and match the
     index to its `where` + `orderBy`. A list endpoint sorting `orderBy {createdAt
     desc}` needs `@@index([workspaceId, createdAt])` (a `(workspaceId,
     normalizedEmail)` index will *not* satisfy it — the home-screen candidate list
     learned this by seq-scanning). Cover: list-default-sort, job-scoped child
     lookups `(workspaceId, jobId)`, and dedup-on-write lookups.
   - **Vector columns:** an ANN/HNSW index on a tenant table that ignores
     `workspace_id` returns cross-tenant rows in the top-K and/or seq-scans. Use a
     partial/partitioned index and `EXPLAIN`-verify the `workspace_id` filter applies
     before the ANN limit — it's a §1 isolation issue, not just perf.
   - Money columns: `Decimal @db.Decimal(14, 2)`. PII contact fields follow the
     encryption convention (`CLAUDE.md` §2).
   - `@map`/`@@map` snake_case to match existing tables.

2. **Generate the migration:** `pnpm db:migrate -- --name <change>` (creates SQL,
   does **not** deploy to prod).

3. **RLS is deferred** (v1 is app-layer isolation). Don't add RLS policies now;
   instead ensure the table is workspace-scoped so every query can filter by
   `workspaceId`. (When RLS is later enabled, this step adds the policy, mirroring
   the shape used by existing tenant tables.)

4. **Make breaking changes zero-downtime (expand-and-contract):**
   - New required column → add nullable, backfill (batched, idempotent,
     workspace-aware), then tighten to `NOT NULL` in a later migration. An `ADD
     COLUMN … NOT NULL` with no `DEFAULT` aborts on a populated table.
   - Rename/drop → add-new + dual-write + backfill, then drop the old later. **A
     `DROP COLUMN` is always a two-deploy contract change** (running instances still
     reference it during rollout) — never single-step, regardless of nullability.
   - Big-table index → create `CONCURRENTLY`.
   - **Don't label a destructive change "additive / online-safe."** That comment has
     been wrong here before. The schema migration must trail the code that stopped
     using the old shape, never lead it.

5. **Regenerate the client:** `pnpm db:generate`.

## Guardrails

- `prisma migrate reset` and prod-targeted `migrate deploy`/`db push` are
  hook-blocked. Production migrations run via `deploy/remote/migrate.sh` on the
  droplet, never from a laptop.

## Verify

Run the `db-migration-reviewer` agent on the schema + migration before shipping.

## Output

The schema edit, the generated migration SQL (with RLS policy), and the deploy
ordering note if the change isn't single-step safe.

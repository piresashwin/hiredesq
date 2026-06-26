---
name: deploy-release
description: Build and deploy hiredesq to the production droplet via the Docker + SSH/rsync pipeline (deploy/build.sh → deploy/deploy.sh → migrate.sh), modeled on the tradex deployment. Use when releasing api/web/worker changes or running production migrations.
---

# Release to production

hiredesq deploys by building locally, rsyncing a `release/` folder to the droplet,
and bringing the stack up with `docker compose`. It is a **sibling stack on the
tradex droplet**, sharing tradex's **nginx, certbot, and Postgres** (a separate
`hiredesq` database inside `tradex-postgres`, reached over the `edge` net). There
is no postgres/nginx/certbot in hiredesq's own compose. For the full pipeline
detail and the shared-host gotchas, use the `deployment-engineer` agent. Read
`CLAUDE.md` §6.

## One-time setup

1. `cp deploy/.env.deploy.example deploy/.env.deploy` and fill in `DEPLOY_USER`,
   `DEPLOY_HOST`, `DEPLOY_PATH`, `PUBLIC_APP_URL` (baked into the Next.js client
   bundle at build time — runtime env won't reach the browser), and the shared-infra
   vars (`SHARED_NET`, `VHOST_DIR`, `PROXY_CONTAINER`, `SHARED_PG_CONTAINER`).
2. Provision the shared DB once: on the droplet,
   `HIREDESQ_DB_PASSWORD='…' deploy/remote/provision-shared-db.sh` creates the
   `hiredesq` database + role inside `tradex-postgres` (does not touch tradex data).
3. On the droplet, populate `$DEPLOY_PATH/.env.production` from the example
   (secrets: `DATABASE_URL*` → `tradex-postgres`, password matching step 2;
   `JWT_SECRET`, `ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, S3/R2 keys). Never commit
   it; never overwrite it via rsync (the deploy script excludes it).

## Release steps

1. **Build:** `./deploy/build.sh` — installs frozen deps, generates the Prisma
   client (with the linux-musl engine), turbo-builds api/web/worker, and assembles
   `release/{api,web,worker}` via `pnpm deploy --prod`.
2. **Deploy:** `./deploy/deploy.sh` — snapshots the previous release for rollback,
   rsyncs `release/` and `deploy/remote/` to the droplet (preserving
   `.env.production`, certbot, and the previous release), then
   `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
3. **Migrate (only if the schema changed):** SSH to the droplet and run
   `cd $DEPLOY_PATH && ./migrate.sh` — applies `prisma migrate deploy` over the
   direct connection inside the api image. Review the migration first with
   `/prisma-migration-safe` and the `db-migration-reviewer` agent.

## Guardrails

- The `guard-secrets-prod` hook blocks ad-hoc prod `migrate deploy`/`db push` and
  committing `.env*`. Migrations go through `migrate.sh`, not a laptop shell.
- Tail logs: `ssh $TARGET 'cd $DEPLOY_PATH && docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200'`.
- Rollback: the previous release is in `release.prev/` on the droplet; point the
  compose build context back and re-up.

## Output

Run the build, run the deploy, report what changed, and call out whether a
migration is required (and that it was reviewed before running).

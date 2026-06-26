# Deploy — hiredesq.com

Rsync-based deploy to the **shared droplet** (the same host as tradex). The local
machine builds the dist artifacts; rsync ships them; thin Docker images on the
droplet COPY the artifacts and run them. TLS + reverse proxy are **not** part of
this stack — the **tradex nginx is the shared proxy** and fronts `hiredesq.com`.

## Architecture

- `hiredesq-api`, `hiredesq-worker`, `hiredesq-web` run in this compose stack
  (`docker-compose.prod.yml`). The **service keys are hiredesq-prefixed on purpose**
  — a bare `api`/`web`/`worker` service name leaks that alias onto the shared `edge`
  net and hijacks sibling stacks' upstreams (Gotcha 1). `hiredesq-worker` is
  internal-only. **There is no postgres container here** — see below.
- **Shared Postgres.** api + worker connect to tradex's **`tradex-postgres`**
  container over the `edge` net, to a **separate `hiredesq` database + role**
  inside that instance (created once by `remote/provision-shared-db.sh`). The DB
  also backs the pg-boss queue (no Redis). The `DATABASE_URL` host is the
  **container name `tradex-postgres`**, never the service alias `postgres` (which
  collides with tradex's own on the shared net).
- **Shared nginx / certbot.** The tradex nginx owns `:80/:443`. hiredesq registers
  a vhost by dropping `nginx-vhosts/hiredesq.com.conf` into **`/srv/nginx-vhosts`**
  on the host (tradex mounts that at `/etc/nginx/vhosts` and `include`s it). The
  cert is issued/renewed by the **shared tradex certbot**.
- `hiredesq-web` + `hiredesq-api` join the external **`edge`** docker network so the
  tradex nginx can reach them by container name (`hiredesq-web:3000`,
  `hiredesq-api:3001`); api + worker also use `edge` to reach `tradex-postgres`.
  Internal `web→api` calls use the private `hiredesq` net via
  `INTERNAL_API_URL=http://hiredesq-api:3001` — a unique name, so it can't collide
  with a sibling's `api` on the shared net.
- The shared nginx serves the API under **`/api`** on the same origin (it strips
  the prefix before `api`, which has no global prefix). The web bundle is built to
  call `<PUBLIC_APP_URL>/api` (see `build.sh`).

## Prerequisites (one-time, on the droplet)

1. **tradex must be deployed with the shared-proxy changes** — its nginx mounts
   `/srv/nginx-vhosts` and `include`s `/etc/nginx/vhosts/*.conf`, its nginx + web/api
   join the `edge` network, and `tradex-postgres` is up. Deploy tradex first.
2. **Create the shared network** (idempotent; `deploy.sh` also does this):
   ```bash
   docker network create edge 2>/dev/null || true
   ```
3. **Provision the shared DB** — **`bootstrap.sh` does this for you** (it creates the
   `hiredesq` database + role inside `tradex-postgres`, parsing the password from
   `.env.production`'s `DATABASE_URL` so they can't drift, and pre-creates the
   pgvector/pg_trgm extensions). `deploy.sh` attaches `tradex-postgres` to `edge`
   automatically. Manual fallback (idempotent), if ever needed:
   ```bash
   cd /opt/hiredesq   # after the first rsync; or run remote/provision-shared-db.sh directly
   HIREDESQ_DB_PASSWORD='<strong-secret>' ./provision-shared-db.sh
   ```
4. **DNS**: `hiredesq.com` (and `www`) A records → the droplet IP, **DNS-only
   (grey-cloud)** if behind Cloudflare, resolving before the cert is requested
   (`bootstrap.sh` refuses to issue until DNS points at the droplet).

## Local config

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
$EDITOR deploy/.env.deploy
```
Keys in `deploy/.env.deploy` (sourced by `build.sh`/`deploy.sh`/`bootstrap.sh`/`verify.sh`):
- `DEPLOY_USER`/`DEPLOY_HOST`/`DEPLOY_PATH` — SSH target + remote path.
- `PUBLIC_APP_URL` — public origin; baked into the web bundle as `<url>/api` at build time.
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — **build-time** Google client ID (the Sign-in button
  only renders if it's baked in; runtime env can't reach the browser bundle).
- `SHARED_NET`/`VHOST_DIR`/`PROXY_CONTAINER`/`SHARED_PG_CONTAINER` — match the tradex proxy.
- `TRADEX_DEPLOY_PATH`/`CERT_EMAIL` — used by `bootstrap.sh` to issue the cert via the
  shared certbot.
- `APP_MARKER`/`SIBLING_PROXY_DOMAINS` — used by `verify.sh`; `SIBLING_PROXY_DOMAINS`
  (e.g. `"tradex.inflxr.com"`) enables the cross-domain bleed guard.

## Scripts (what the deploy agent runs)

| Script | When | What it does |
|---|---|---|
| `deploy/build.sh` | every deploy | Assembles `release/{api,worker,web}`. Bakes `NEXT_PUBLIC_*` into the web bundle; repairs the prisma-generate symlink/engine damage (see gotchas). |
| `deploy/deploy.sh` | every deploy | Preflight guards → rsync → vhost reload → `compose up --remove-orphans` → `verify.sh`. Idempotent. |
| `deploy/verify.sh` | after every deploy (auto + standalone) | Container health, **alias-collision guard**, per-domain app correctness, **cross-domain bleed guard**, cert check. Exits non-zero on failure. |
| `deploy/bootstrap.sh` | **first deploy only** | One-time: shared net → provision DB + extensions → first deploy → cert bootstrap → re-deploy → migrate → verify. Idempotent/re-runnable. |
| `deploy/remote/provision-shared-db.sh` | first deploy (called by bootstrap) | Creates the `hiredesq` role+DB inside `tradex-postgres` **and pre-creates pgvector/pg_trgm as superuser**. |
| `deploy/remote/migrate.sh` | after schema changes | `prisma migrate deploy` via the `hiredesq-api` service over `DIRECT_URL`. |

## First deploy (one command, after secrets are in place)

```bash
# 1. create + fill the prod secrets ON THE DROPLET (this is the only manual step —
#    bootstrap.sh never invents secrets):
ssh $DEPLOY_USER@$DEPLOY_HOST 'cd /opt/hiredesq && cp .env.production.example .env.production'
ssh $DEPLOY_USER@$DEPLOY_HOST '$EDITOR /opt/hiredesq/.env.production'
#    DATABASE_URL/DIRECT_URL → host tradex-postgres (pick a strong password — it is
#    the single source of truth; bootstrap parses it to provision the role),
#    generate JWT_SECRET (openssl rand -hex 32) + ENCRYPTION_KEY (openssl rand -base64 32),
#    set ANTHROPIC_API_KEY / VOYAGER_API_KEY / S3_* / RESEND_* / GOOGLE_* / EMAIL_LOGO_URL.
#    Also set NEXT_PUBLIC_GOOGLE_CLIENT_ID in deploy/.env.deploy (build-time).
#    DNS: point hiredesq.com + www at the droplet (A records, DNS-only/grey-cloud).

# 2. run the bootstrap — provisions, deploys, issues the cert, migrates, verifies:
./deploy/bootstrap.sh
```

The full vhost references a TLS cert that doesn't exist on a first run, so the tradex
nginx won't load it (deploy.sh copies the vhost, skips the reload, warns — tradex
stays up). `bootstrap.sh` handles the cert dance: it checks DNS points here, installs
a temporary HTTP-only ACME vhost, issues via the **shared tradex certbot**, then
re-deploys so the full TLS vhost loads. Renewal is automatic (the shared certbot
renews every 12h).

## Subsequent deploys

```bash
./deploy/build.sh && ./deploy/deploy.sh
# after a Prisma schema change:
ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/hiredesq && ./migrate.sh"
```

`deploy.sh` runs its preflight guards, rsyncs `release/` + `remote/`, drops the vhost
into `/srv/nginx-vhosts`, hot-reloads the tradex nginx (a bad vhost aborts the reload —
it can never take the proxy down), `compose up -d --build --remove-orphans`, then runs
`verify.sh`. Re-run any time; it's idempotent.

### Running the build (agents/CI)
`compose up --build` on the droplet can take **> 2 minutes** (image build). If you
invoke `deploy.sh` from an agent or CI with a command timeout, run it in the
**background** and poll, or it will be killed mid-`up` and leave the stack down
(a `down`-then-`up` window). `verify.sh` is safe to run repeatedly to confirm recovery.

## Gotchas the scripts now guard against (deploy learnings)

1. **Shared-net alias collision (caused a real outage).** A bare `api`/`web`/`worker`
   compose *service* name registers that name as an alias on the shared `edge` net;
   tradex-nginx then resolved its own `web`/`api` upstreams to **hiredesq** containers
   and served the hiredesq app at `tradex.inflxr.com`. Fix: service keys are
   `hiredesq-*` (only the unique container name lands on edge). `deploy.sh` refuses a
   bare service name; `verify.sh` asserts no bare alias + that siblings still serve
   their own app.
2. **pgvector is non-trusted.** The `hiredesq` role cannot `CREATE EXTENSION vector`,
   so migrations would fail. `provision-shared-db.sh` pre-creates `vector` + `pg_trgm`
   as the Postgres superuser (idempotent no-op for the migrations).
3. **prisma generate corrupts the release tree.** prisma 6.19 rewrites
   `release/api`'s node_modules symlinks to escape the release dir (dangling in the
   container) and self-installs the CLI from the repo root (`ERR_PNPM_ADDING_TO_ROOT`).
   `build.sh` runs generate with cwd=`release/api`, copies the linux-musl engine into
   the local store, and repairs every escaping symlink (failing loudly if any remain).
4. **`NEXT_PUBLIC_*` is build-time only.** `NEXT_PUBLIC_API_URL` and
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` are baked by `build.sh` from `deploy/.env.deploy`;
   setting them at runtime does nothing for the browser bundle.
5. **`.env.production` must be complete.** `deploy.sh` fails if a required key is empty
   or a `CHANGE_ME` placeholder remains. `PORT` is set by compose — don't put it here.
6. **Service rename leaves orphans.** `up --remove-orphans` clears containers from the
   old (bare-named) service layout so they don't linger with stale edge aliases.

## Rollback

`deploy.sh` keeps the previous release under `release.prev/`:
```bash
ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/hiredesq && mv release release.bad && mv release.prev release && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans \
  hiredesq-api hiredesq-worker hiredesq-web"
```

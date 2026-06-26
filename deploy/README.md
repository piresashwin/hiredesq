# Deploy — hiredesq.com

Rsync-based deploy to the **shared droplet** (the same host as tradex). The local
machine builds the dist artifacts; rsync ships them; thin Docker images on the
droplet COPY the artifacts and run them. TLS + reverse proxy are **not** part of
this stack — the **tradex nginx is the shared proxy** and fronts `hiredesq.com`.

## Architecture

- `api`, `worker`, `web` run in this compose stack (`docker-compose.prod.yml`).
  `worker` is internal-only. **There is no postgres container here** — see below.
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
- `web` + `api` join the external **`edge`** docker network so the tradex nginx can
  reach them by container name (`hiredesq-web:3000`, `hiredesq-api:3001`); api +
  worker also use `edge` to reach `tradex-postgres`. Internal `web→api` calls use
  the private `hiredesq` net (service alias `api`) to avoid the `edge` collision.
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
3. **Provision the shared DB** — create the `hiredesq` database + role inside
   `tradex-postgres` (idempotent). Use the SAME password you'll put in
   `.env.production`:
   ```bash
   cd /opt/hiredesq   # after the first rsync; or run remote/provision-shared-db.sh directly
   HIREDESQ_DB_PASSWORD='<strong-secret>' ./provision-shared-db.sh
   ```
   `deploy.sh` attaches `tradex-postgres` to the `edge` net automatically.
4. **DNS**: `hiredesq.com` (and `www`) A records → the droplet IP, resolving before
   you request the cert.

## Local config

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
$EDITOR deploy/.env.deploy   # DEPLOY_HOST/USER/PATH, PUBLIC_APP_URL=https://hiredesq.com,
                             # SHARED_NET/VHOST_DIR/PROXY_CONTAINER (match the tradex proxy)
```

## First deploy + cert bootstrap

The full vhost references a TLS cert that doesn't exist yet, so the tradex nginx
won't load it until the cert is present (`deploy.sh` detects this: it copies the
vhost but skips the reload and warns — tradex stays up). Bootstrap the cert once:

```bash
# 1. ship the app stack (containers come up; vhost copied but not yet reloaded)
./deploy/build.sh && ./deploy/deploy.sh

# 2. on the droplet, fill in prod secrets for THIS stack
ssh $DEPLOY_USER@$DEPLOY_HOST
cd /opt/hiredesq
cp .env.production.example .env.production
$EDITOR .env.production       # DATABASE_URL/DIRECT_URL (→ tradex-postgres, password
                             # must match provision-shared-db.sh), JWT_SECRET,
                             # ENCRYPTION_KEY, ANTHROPIC_API_KEY, S3_*, SMTP_*

# 3. serve the ACME challenge for hiredesq.com with a temporary HTTP-only vhost
cat >/srv/nginx-vhosts/hiredesq.com.conf <<'EOF'
server {
  listen 80;
  server_name hiredesq.com www.hiredesq.com;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 404; }
}
EOF
docker exec tradex-nginx nginx -t && docker exec tradex-nginx nginx -s reload

# 4. issue the cert via the SHARED certbot (run from tradex's deploy path)
cd /opt/tradex   # tradex's DEPLOY_PATH
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  --entrypoint "" certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d hiredesq.com -d www.hiredesq.com \
  --email admin@hiredesq.com --agree-tos --no-eff-email
```

```bash
# 5. now re-run the real deploy — installs the full TLS vhost and reloads nginx
./deploy/build.sh && ./deploy/deploy.sh

# 6. first-time DB migrate (and after every schema change)
ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/hiredesq && ./migrate.sh"
```

Renewal is automatic — the shared tradex certbot renews every 12h; reload the proxy
out-of-band (`docker exec tradex-nginx nginx -s reload`) or via tradex's renewal hook.

## Subsequent deploys

```bash
./deploy/build.sh && ./deploy/deploy.sh
```

`deploy.sh` rsyncs `release/` + `remote/`, drops the vhost into `/srv/nginx-vhosts`,
validates (`nginx -t`) and hot-reloads the tradex nginx (a bad vhost aborts the
reload — it can never take the proxy down), then `docker compose up -d --build`.

After a Prisma schema change:
```bash
ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/hiredesq && ./migrate.sh"
```

## Rollback

`deploy.sh` keeps the previous release under `release.prev/`:
```bash
ssh $DEPLOY_USER@$DEPLOY_HOST "cd /opt/hiredesq && mv release release.bad && mv release.prev release && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api worker web"
```

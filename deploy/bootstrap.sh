#!/usr/bin/env bash
# FIRST-DEPLOY orchestrator for a never-deployed host. Idempotent — each phase
# checks whether it's already done, so it's safe to re-run after a failure.
# For subsequent deploys use ./deploy/deploy.sh directly.
#
# Sequences the one-time steps that used to be scattered manual README commands,
# encoding the deploy learnings:
#   0. preflight: .env.production must already exist on the droplet and be
#      complete (secrets are filled by a human/operator — this script never
#      generates or echoes secrets; the guard hook blocks that anyway).
#   1. ensure the shared `edge` net + deploy paths exist
#   2. ship the remote/ scaffolding (provision + compose + migrate scripts)
#   3. provision the hiredesq DB/role INSIDE tradex-postgres AND pre-create the
#      pgvector/pg_trgm extensions (vector is non-trusted → must be superuser)
#   4. build + first deploy (containers come up; vhost copied, reload skipped —
#      the TLS cert doesn't exist yet)
#   5. cert bootstrap: verify DNS → temp ACME vhost → issue via the SHARED certbot
#   6. re-deploy so the full TLS vhost loads + reloads the proxy
#   7. migrate the schema
#   8. verify
#
# The DB password is parsed FROM .env.production's DATABASE_URL so provisioning
# and the runtime connection can never drift apart (one source of truth).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HERE="$ROOT/deploy"
# shellcheck disable=SC1091
source deploy/.env.deploy
: "${DEPLOY_USER:?}" "${DEPLOY_HOST:?}" "${DEPLOY_PATH:?}"
SSH_OPTS="${SSH_OPTS:-}"
SHARED_NET="${SHARED_NET:-edge}"
VHOST_DIR="${VHOST_DIR:-/srv/nginx-vhosts}"
PROXY_CONTAINER="${PROXY_CONTAINER:-tradex-nginx}"
SHARED_PG_CONTAINER="${SHARED_PG_CONTAINER:-tradex-postgres}"
# Cert bootstrap settings (shared tradex certbot).
TRADEX_DEPLOY_PATH="${TRADEX_DEPLOY_PATH:-/opt/tradex}"
CERT_EMAIL="${CERT_EMAIL:-admin@hiredesq.com}"

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
APP_HOST="$(printf '%s' "${PUBLIC_APP_URL:-https://hiredesq.com}" | sed -E 's#^https?://##; s#/.*$##')"
WWW_HOST="www.$APP_HOST"
ENVFILE=".env.production"
sshq() { # shellcheck disable=SC2086
  ssh $SSH_OPTS "$TARGET" "$@"
}

echo "######## hiredesq first-deploy bootstrap → $TARGET ($APP_HOST) ########"

# ── 0. env preflight ─────────────────────────────────────────────────────────
echo "==> [0/8] checking $ENVFILE on the droplet"
sshq "mkdir -p '$DEPLOY_PATH'"
if ! sshq "test -f '$DEPLOY_PATH/$ENVFILE'"; then
  cat >&2 <<EOF
ERROR: $DEPLOY_PATH/$ENVFILE does not exist.
  This script never invents secrets. Create it first (on the droplet):
    cp $DEPLOY_PATH/.env.production.example $DEPLOY_PATH/$ENVFILE
    \$EDITOR $DEPLOY_PATH/$ENVFILE   # fill DATABASE_URL/DIRECT_URL (→ tradex-postgres),
                                     # generate JWT_SECRET / ENCRYPTION_KEY, set keys
  Then re-run this script.
EOF
  exit 1
fi
# Reuse deploy.sh's completeness gate via a tiny inline check.
sshq "cd '$DEPLOY_PATH' && grep -q CHANGE_ME '$ENVFILE' && { echo 'ERROR: $ENVFILE still has CHANGE_ME placeholders.' >&2; exit 1; } || true"

# ── 1. shared net + paths ────────────────────────────────────────────────────
echo "==> [1/8] ensuring shared net '$SHARED_NET' + paths"
sshq "mkdir -p '$DEPLOY_PATH' '$VHOST_DIR' && docker network create '$SHARED_NET' 2>/dev/null || true"

# ── 2. ship scaffolding (provision/compose/migrate live in remote/) ──────────
echo "==> [2/8] shipping remote/ scaffolding"
# shellcheck disable=SC2086
rsync -az --delete --exclude='release/' --exclude='release.prev/' --exclude="$ENVFILE" \
  ${SSH_OPTS:+-e "ssh $SSH_OPTS"} deploy/remote/ "$TARGET:$DEPLOY_PATH/"
sshq "chmod +x '$DEPLOY_PATH/provision-shared-db.sh' '$DEPLOY_PATH/migrate.sh' 2>/dev/null || true"

# ── 3. provision DB + extensions (password parsed from .env.production) ───────
echo "==> [3/8] provisioning hiredesq DB/role + extensions in $SHARED_PG_CONTAINER"
# Parse the password out of DATABASE_URL on the droplet so it always matches the
# runtime connection. Done remotely — the secret never transits this machine.
sshq "set -e; cd '$DEPLOY_PATH'; \
  url=\$(grep -E '^DATABASE_URL=' '$ENVFILE' | head -n1 | cut -d= -f2-); \
  pw=\$(printf '%s' \"\$url\" | sed -E 's#^[^:]+://[^:]+:([^@]+)@.*#\1#'); \
  [ -n \"\$pw\" ] || { echo 'ERROR: could not parse DB password from DATABASE_URL' >&2; exit 1; }; \
  HIREDESQ_DB_PASSWORD=\"\$pw\" PG_CONTAINER='$SHARED_PG_CONTAINER' ./provision-shared-db.sh"

# ── 4. build + first deploy (no cert yet) ────────────────────────────────────
echo "==> [4/8] building release/ locally"
"$HERE/build.sh"
echo "==> [4/8] first deploy (vhost copied; proxy reload will be skipped until the cert exists)"
"$HERE/deploy.sh" || true   # verify.sh inside will warn about the missing cert — expected here

# ── 5. cert bootstrap ────────────────────────────────────────────────────────
echo "==> [5/8] TLS cert for $APP_HOST"
if sshq "test -d '$TRADEX_DEPLOY_PATH/certbot/conf/live/$APP_HOST'"; then
  echo "   cert already present — skipping issuance"
else
  # DNS must point at THIS droplet (grey-cloud) or HTTP-01 is served elsewhere.
  resolved="$(dig +short @1.1.1.1 "$APP_HOST" A 2>/dev/null | tr '\n' ' ')"
  if ! printf '%s' "$resolved" | grep -qw "$DEPLOY_HOST"; then
    cat >&2 <<EOF
ERROR: $APP_HOST resolves to [$resolved], not $DEPLOY_HOST.
  Point $APP_HOST + $WWW_HOST at $DEPLOY_HOST (A records, DNS-only / grey-cloud)
  so the Let's Encrypt HTTP-01 challenge reaches this droplet, then re-run.
EOF
    exit 1
  fi
  echo "   DNS OK ($APP_HOST → $DEPLOY_HOST). Installing temp ACME vhost + issuing cert."
  # Temp HTTP-only vhost: the full TLS vhost can't load (cert absent) so nginx -t
  # fails and the ACME location never activates. This minimal one passes nginx -t.
  sshq "cat > '$VHOST_DIR/$APP_HOST.conf' <<EOF
server {
  listen 80;
  server_name $APP_HOST $WWW_HOST;
  location /.well-known/acme-challenge/ { root /var/www/certbot; }
  location / { return 404; }
}
EOF
  docker exec '$PROXY_CONTAINER' nginx -t && docker exec '$PROXY_CONTAINER' nginx -s reload"
  # Issue via the SHARED tradex certbot (run from tradex's deploy path).
  sshq "cd '$TRADEX_DEPLOY_PATH' && docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
    --entrypoint '' certbot certbot certonly --webroot -w /var/www/certbot \
    -d '$APP_HOST' -d '$WWW_HOST' --email '$CERT_EMAIL' --agree-tos --no-eff-email"
fi

# ── 6. re-deploy so the full TLS vhost loads ─────────────────────────────────
echo "==> [6/8] re-deploy (installs full TLS vhost + reloads proxy)"
"$HERE/deploy.sh"

# ── 7. migrate ───────────────────────────────────────────────────────────────
echo "==> [7/8] applying migrations"
sshq "cd '$DEPLOY_PATH' && ./migrate.sh"

# ── 8. verify ────────────────────────────────────────────────────────────────
echo "==> [8/8] verifying"
"$HERE/verify.sh"

echo
echo "######## bootstrap complete — https://$APP_HOST should be live ########"

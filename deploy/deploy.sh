#!/usr/bin/env bash
# Rsync release/ + remote/ to the droplet, then bring the stack up.
# Modeled on the tradex deploy pipeline. Idempotent — safe to re-run.
#
# This is the RECURRING deploy. For a never-deployed host (no DB role, no
# .env.production, no cert) run ./deploy/bootstrap.sh first — it does the
# one-time provisioning + cert issuance, then calls this script.
#
# Encodes the hard-won deploy learnings as fail-fast guards (see deploy/README.md):
#   - compose service keys MUST be hiredesq-prefixed (a bare api/web/worker service
#     name leaks that alias onto the SHARED `edge` net and hijacks sibling stacks'
#     upstreams — this once made tradex.inflxr.com serve the hiredesq app).
#   - .env.production must exist AND be complete (no empty required keys / CHANGE_ME).
#   - after `up`, verify.sh confirms the right app is served and nothing bled across
#     domains.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
HERE="$ROOT/deploy"

if [ ! -f deploy/.env.deploy ]; then
  echo "missing deploy/.env.deploy — copy from .env.deploy.example and fill in" >&2
  exit 1
fi
# shellcheck disable=SC1091
source deploy/.env.deploy
: "${DEPLOY_USER:?}" "${DEPLOY_HOST:?}" "${DEPLOY_PATH:?}"
SSH_OPTS="${SSH_OPTS:-}"
# Shared reverse-proxy integration (hiredesq is a sibling behind the tradex nginx):
#   SHARED_NET       docker network the tradex nginx + this stack both join
#   VHOST_DIR        host dir the tradex nginx mounts as conf.d/vhosts
#   PROXY_CONTAINER  tradex nginx container to reload after dropping the vhost
SHARED_NET="${SHARED_NET:-edge}"
VHOST_DIR="${VHOST_DIR:-/srv/nginx-vhosts}"
PROXY_CONTAINER="${PROXY_CONTAINER:-tradex-nginx}"
# Container name of the SHARED Postgres (tradex's) that hiredesq's api/worker
# connect to over $SHARED_NET. It ships only on tradex's private net, so we
# attach it to the shared net here (idempotent).
SHARED_PG_CONTAINER="${SHARED_PG_CONTAINER:-tradex-postgres}"

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
COMPOSE="docker-compose.prod.yml"
ENVFILE=".env.production"
# Compose SERVICE keys (NOT container names). These are hiredesq-prefixed on
# purpose — see the collision guard below.
SERVICES="hiredesq-api hiredesq-worker hiredesq-web"
# ssh wrapper that honours optional SSH_OPTS without word-splitting surprises.
sshq() { # shellcheck disable=SC2086
  ssh $SSH_OPTS "$TARGET" "$@"
}

# ─────────────────────────────────────────────────────────────────────────────
# Preflight (local) — cheap guards that catch the mistakes we actually made.
# ─────────────────────────────────────────────────────────────────────────────
if [ ! -d release ]; then
  echo "no release/ — run ./deploy/build.sh first" >&2
  exit 1
fi

# COLLISION GUARD: a bare `api:`/`web:`/`worker:` compose service name registers
# that name as an alias on the shared `edge` net (docker adds the service name as
# a per-network alias). Sibling stacks (tradex) resolve bare `web`/`api` for their
# OWN upstreams and would get hijacked to hiredesq. The service keys must be
# hiredesq-prefixed so the only edge alias is the unique container name.
if grep -nE '^[[:space:]]{2}(api|web|worker):[[:space:]]*$' "deploy/remote/$COMPOSE" >/dev/null; then
  echo "ERROR: deploy/remote/$COMPOSE defines a BARE service name (api/web/worker)." >&2
  echo "       On the shared '$SHARED_NET' net that leaks a generic alias and hijacks" >&2
  echo "       sibling stacks (this once made tradex.inflxr.com serve hiredesq)." >&2
  echo "       Rename the service keys to hiredesq-* (keep container_name)." >&2
  exit 1
fi

echo "==> ensuring $DEPLOY_PATH + shared proxy paths + shared net exist on $TARGET"
sshq "mkdir -p '$DEPLOY_PATH' '$VHOST_DIR' && docker network create '$SHARED_NET' 2>/dev/null || true"

echo "==> attaching $SHARED_PG_CONTAINER to '$SHARED_NET' so api/worker can reach the shared DB"
# Idempotent: 'already exists' is fine; missing container (tradex not yet up) is
# surfaced as a warning rather than aborting the hiredesq deploy.
sshq "docker network connect '$SHARED_NET' '$SHARED_PG_CONTAINER' 2>/dev/null || true; \
  docker network inspect '$SHARED_NET' --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw '$SHARED_PG_CONTAINER' \
    && echo '   $SHARED_PG_CONTAINER is on $SHARED_NET' \
    || echo 'WARN: $SHARED_PG_CONTAINER not on $SHARED_NET (is tradex deployed?). api/worker will fail to reach the DB until it is.' >&2"

# ─────────────────────────────────────────────────────────────────────────────
# Preflight (remote) — .env.production exists AND is complete. A blank required
# key means compose substitutes "" and the container boots broken (or, worse,
# silently runs against the wrong thing).
# ─────────────────────────────────────────────────────────────────────────────
echo "==> validating $ENVFILE on the droplet"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "DEPLOY_PATH='$DEPLOY_PATH' ENVFILE='$ENVFILE' bash -s" <<'REMOTE'
set -euo pipefail
cd "$DEPLOY_PATH"
if [ ! -f "$ENVFILE" ]; then
  echo "ERROR: $ENVFILE missing on droplet. Run ./deploy/bootstrap.sh (first deploy) or" >&2
  echo "       copy .env.production.example → $ENVFILE and fill it in, then re-run." >&2
  exit 1
fi
missing=""
# Keys with no safe default — the app cannot boot correctly without them.
for k in APP_URL API_URL DATABASE_URL DIRECT_URL JWT_SECRET ENCRYPTION_KEY ANTHROPIC_API_KEY; do
  grep -qE "^${k}=.+" "$ENVFILE" || missing="$missing $k"
done
if [ -n "$missing" ]; then
  echo "ERROR: $ENVFILE has empty/missing required key(s):$missing" >&2
  exit 1
fi
if grep -q 'CHANGE_ME' "$ENVFILE"; then
  echo "ERROR: $ENVFILE still contains CHANGE_ME placeholder(s) — fill in real values." >&2
  exit 1
fi
echo "   $ENVFILE present and complete"
REMOTE

echo "==> snapshotting previous release on droplet (for rollback)"
sshq "cd '$DEPLOY_PATH' && rm -rf release.prev && (cp -al release release.prev 2>/dev/null || cp -R release release.prev 2>/dev/null || true)"

echo "==> rsync release/ → $TARGET:$DEPLOY_PATH/release/"
# shellcheck disable=SC2086
rsync -az --delete \
  ${SSH_OPTS:+-e "ssh $SSH_OPTS"} \
  release/ "$TARGET:$DEPLOY_PATH/release/"

echo "==> rsync remote/ scaffolding → $TARGET:$DEPLOY_PATH/"
# --delete clears stale files, but protect droplet-only paths:
#   release/, release.prev/   shipped above — don't nuke
#   .env.production           populated secrets (never overwrite/delete)
# shellcheck disable=SC2086
rsync -az --delete \
  --exclude='release/' \
  --exclude='release.prev/' \
  --exclude='.env.production' \
  ${SSH_OPTS:+-e "ssh $SSH_OPTS"} \
  deploy/remote/ "$TARGET:$DEPLOY_PATH/"

sshq "chmod +x '$DEPLOY_PATH/migrate.sh' '$DEPLOY_PATH/provision-shared-db.sh' 2>/dev/null || true"

echo "==> publishing vhost → $VHOST_DIR/hiredesq.com.conf and reloading $PROXY_CONTAINER"
# Drop the vhost into the shared host dir (outside any rsync --delete tree), then
# validate + hot-reload the tradex nginx. A bad config fails `nginx -t` and we
# abort WITHOUT reloading, so a broken vhost can never take the proxy down. On a
# first deploy the cert doesn't exist yet → `nginx -t` fails → we copy but skip
# the reload and warn (bootstrap.sh issues the cert, then re-runs this).
sshq "cp '$DEPLOY_PATH/nginx-vhosts/hiredesq.com.conf' '$VHOST_DIR/hiredesq.com.conf' && \
  if docker exec '$PROXY_CONTAINER' nginx -t 2>/dev/null; then \
    docker exec '$PROXY_CONTAINER' nginx -s reload && echo '   vhost reloaded'; \
  else \
    echo 'WARN: $PROXY_CONTAINER nginx -t failed or container not running — vhost copied but NOT reloaded. Issue the cert (./deploy/bootstrap.sh or README), then re-run.' >&2; \
  fi"

echo "==> docker compose up -d --build --remove-orphans ($SERVICES)"
# --remove-orphans clears containers from a previous service layout (e.g. after a
# service rename) so they don't linger with stale aliases on the shared net.
# NB: this can take >2 min (image build). When invoked by an agent/CI with a
# command timeout, run it in the background (see README "Running the build").
# shellcheck disable=SC2086
sshq "cd '$DEPLOY_PATH' && \
  docker compose -f '$COMPOSE' --env-file '$ENVFILE' up -d --build --remove-orphans $SERVICES"

# Re-resolve the shared proxy's upstreams after recreate (static `upstream {}`
# blocks pin the IP at reload-time). hiredesq's own vhost uses a runtime resolver
# so it self-heals, but reloading is cheap insurance and re-validates the config.
echo "==> reloading $PROXY_CONTAINER post-up"
sshq "docker exec '$PROXY_CONTAINER' nginx -t 2>/dev/null && docker exec '$PROXY_CONTAINER' nginx -s reload 2>/dev/null && echo '   reloaded' || echo '   (reload skipped — cert not yet issued)'"

# ─────────────────────────────────────────────────────────────────────────────
# Postflight verification (health + per-domain correctness + collision guard).
# ─────────────────────────────────────────────────────────────────────────────
if [ -x "$HERE/verify.sh" ]; then
  echo "==> verifying deployment"
  "$HERE/verify.sh" || echo "WARN: verify.sh reported issues (see above)." >&2
fi

echo
echo "==> done."
echo "If the schema changed, run migrations:  ssh $TARGET 'cd $DEPLOY_PATH && ./migrate.sh'"
echo "Tail logs:  ssh $TARGET 'cd $DEPLOY_PATH && docker compose -f $COMPOSE --env-file $ENVFILE logs -f --tail=200'"

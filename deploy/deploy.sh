#!/usr/bin/env bash
# Rsync release/ + remote/ to the droplet, then bring the stack up.
# Modeled on the tradex deploy pipeline.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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

if [ ! -d release ]; then
  echo "no release/ — run ./deploy/build.sh first" >&2
  exit 1
fi

TARGET="$DEPLOY_USER@$DEPLOY_HOST"
# Container name of the SHARED Postgres (tradex's) that hiredesq's api/worker
# connect to over $SHARED_NET. It ships only on tradex's private net, so we
# attach it to the shared net here (idempotent).
SHARED_PG_CONTAINER="${SHARED_PG_CONTAINER:-tradex-postgres}"

echo "==> ensuring $DEPLOY_PATH + shared proxy paths + shared net exist on $TARGET"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "mkdir -p '$DEPLOY_PATH' '$VHOST_DIR' && docker network create '$SHARED_NET' 2>/dev/null || true"

echo "==> attaching $SHARED_PG_CONTAINER to '$SHARED_NET' so api/worker can reach the shared DB"
# Idempotent: 'already exists' is fine; missing container (tradex not yet up) is
# surfaced as a warning rather than aborting the hiredesq deploy.
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "docker network connect '$SHARED_NET' '$SHARED_PG_CONTAINER' 2>/dev/null || true; \
  docker network inspect '$SHARED_NET' --format '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | grep -qw '$SHARED_PG_CONTAINER' \
    && echo '   $SHARED_PG_CONTAINER is on $SHARED_NET' \
    || echo 'WARN: $SHARED_PG_CONTAINER not on $SHARED_NET (is tradex deployed?). api/worker will fail to reach the DB until it is.' >&2"

echo "==> snapshotting previous release on droplet (for rollback)"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "cd '$DEPLOY_PATH' && rm -rf release.prev && (cp -al release release.prev 2>/dev/null || cp -R release release.prev 2>/dev/null || true)"

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

# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "chmod +x '$DEPLOY_PATH/migrate.sh' 2>/dev/null || true"

echo "==> publishing vhost → $VHOST_DIR/hiredesq.com.conf and reloading $PROXY_CONTAINER"
# Drop the vhost into the shared host dir (outside any rsync --delete tree), then
# validate + hot-reload the tradex nginx. A bad config fails `nginx -t` and we
# abort WITHOUT reloading, so a broken vhost can never take the proxy down.
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "cp '$DEPLOY_PATH/nginx-vhosts/hiredesq.com.conf' '$VHOST_DIR/hiredesq.com.conf' && \
  if docker exec '$PROXY_CONTAINER' nginx -t 2>/dev/null; then \
    docker exec '$PROXY_CONTAINER' nginx -s reload && echo '   vhost reloaded'; \
  else \
    echo 'WARN: $PROXY_CONTAINER nginx -t failed or container not running — vhost copied but NOT reloaded. Issue the cert (see README), then reload manually.' >&2; \
  fi"

echo "==> docker compose up -d --build (api, worker, web — Postgres is the shared tradex-postgres)"
# shellcheck disable=SC2086
ssh $SSH_OPTS "$TARGET" "cd '$DEPLOY_PATH' && \
  if [ ! -f .env.production ]; then echo 'ERROR: .env.production missing on droplet — copy from .env.production.example and fill in, then re-run.' >&2; exit 1; fi && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build api worker web"

echo
echo "==> done."
echo "If the schema changed, run migrations:  ssh $TARGET 'cd $DEPLOY_PATH && ./migrate.sh'"
echo "Tail logs:  ssh $TARGET 'cd $DEPLOY_PATH && docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200'"

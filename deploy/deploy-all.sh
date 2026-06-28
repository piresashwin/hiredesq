#!/usr/bin/env bash
# One-shot deploy: build locally → rsync + compose up over SSH → migrate on the
# droplet → restart the worker against the new schema. This is the whole recurring
# release in a single command — it just chains the three reviewed scripts in order,
# so every guard in build.sh / deploy.sh / migrate.sh still applies.
#
#   ./deploy/deploy-all.sh            full release (build + deploy + migrate)
#   ./deploy/deploy-all.sh --no-migrate   skip the migration step (no schema change)
#   ./deploy/deploy-all.sh --skip-build   reuse the existing release/ (deploy + migrate only)
#
# FIRST deploy to a never-provisioned host (no DB role / .env.production / cert):
# run ./deploy/bootstrap.sh instead — it does the one-time setup, then deploys.
#
# `prisma migrate deploy` is idempotent: with no pending migrations it's a clean
# no-op, so running the migrate step every release is safe (and is why it's the
# default). Pass --no-migrate only when you want to be explicit / save the round-trip.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RUN_BUILD=1
RUN_MIGRATE=1
for arg in "$@"; do
  case "$arg" in
    --no-migrate) RUN_MIGRATE=0 ;;
    --skip-build) RUN_BUILD=0 ;;
    -h|--help)
      awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 {exit}' "$0"
      exit 0 ;;
    *)
      echo "unknown flag: $arg (see --help)" >&2
      exit 1 ;;
  esac
done

# Resolve the SSH target the same way deploy.sh does, so the migrate step lands on
# the same host without duplicating config.
if [ ! -f deploy/.env.deploy ]; then
  echo "missing deploy/.env.deploy — copy from .env.deploy.example and fill in" >&2
  exit 1
fi
# shellcheck disable=SC1091
source deploy/.env.deploy
: "${DEPLOY_USER:?}" "${DEPLOY_HOST:?}" "${DEPLOY_PATH:?}"
SSH_OPTS="${SSH_OPTS:-}"
TARGET="$DEPLOY_USER@$DEPLOY_HOST"

step() { printf '\n\033[1;36m═══ %s\033[0m\n' "$*"; }

# ── 1. build ──────────────────────────────────────────────────────────────────
if [ "$RUN_BUILD" -eq 1 ]; then
  step "1/4  build  →  release/"
  ./deploy/build.sh
else
  step "1/4  build  →  SKIPPED (--skip-build); reusing existing release/"
  [ -d release ] || { echo "no release/ to reuse — drop --skip-build" >&2; exit 1; }
fi

# ── 2. deploy (rsync + compose up + vhost reload + verify) ──────────────────────
step "2/4  deploy  →  $TARGET:$DEPLOY_PATH"
./deploy/deploy.sh

# ── 3. migrate (prisma migrate deploy on the droplet, over DIRECT_URL) ─────────
if [ "$RUN_MIGRATE" -eq 1 ]; then
  step "3/4  migrate  →  prisma migrate deploy on $TARGET"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$TARGET" "cd '$DEPLOY_PATH' && ./migrate.sh"
else
  step "3/4  migrate  →  SKIPPED (--no-migrate)"
fi

# ── 4. restart the worker so its boot runs against the migrated schema ─────────
# (api/web were already (re)built+started by deploy.sh; the worker is restarted
# here so any code that reads the new columns boots after the migration applied.)
if [ "$RUN_MIGRATE" -eq 1 ]; then
  step "4/4  restart worker  →  pick up the migrated schema"
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$TARGET" "cd '$DEPLOY_PATH' && \
    docker compose -f docker-compose.prod.yml --env-file .env.production restart hiredesq-worker"
else
  step "4/4  restart worker  →  SKIPPED (no migration ran)"
fi

step "done — release live on $DEPLOY_HOST"
echo "Tail logs:  ssh $TARGET 'cd $DEPLOY_PATH && docker compose -f docker-compose.prod.yml --env-file .env.production logs -f --tail=200'"

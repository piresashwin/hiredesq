#!/usr/bin/env bash
# Local build → assembles deployable release/ folders for api, worker, web.
#
#   release/api/    pnpm deploy --prod (dist + isolated prod node_modules + prisma)
#   release/worker/ pnpm deploy --prod (the CV-parse pipeline)
#   release/web/    pnpm deploy --prod + .next/ build output (no standalone — broken
#                   in pnpm monorepos)
#
# Outputs land under repo-root/release/ which is rsynced by deploy.sh.
# Modeled on the tradex deploy pipeline.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load PUBLIC_APP_URL from deploy/.env.deploy so the Next.js client bundle is
# built with the right NEXT_PUBLIC_API_URL baked in. `next build` inlines
# NEXT_PUBLIC_* — runtime env doesn't reach the browser.
if [ -f deploy/.env.deploy ]; then
  # shellcheck disable=SC1091
  source deploy/.env.deploy
fi
: "${PUBLIC_APP_URL:?PUBLIC_APP_URL not set — add it to deploy/.env.deploy. This is the public origin baked into the web bundle.}"
# The shared nginx serves the API under /api on the same origin, so the browser
# bundle must call <origin>/api. (${PUBLIC_APP_URL%/} strips a trailing slash.)
export NEXT_PUBLIC_API_URL="${PUBLIC_APP_URL%/}/api"

RELEASE_DIR="$ROOT/release"

echo "==> cleaning $RELEASE_DIR"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

echo "==> installing workspace deps (frozen)"
pnpm install --frozen-lockfile

echo "==> generating prisma client"
pnpm --filter @hiredesq/database prisma:generate

echo "==> building packages + apps (NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL)"
pnpm turbo run build --filter=@hiredesq/api --filter=@hiredesq/worker --filter=@hiredesq/web

# ---- api ----
echo "==> pnpm deploy api → release/api"
rm -rf "$RELEASE_DIR/api"
pnpm --filter=@hiredesq/api deploy --prod "$RELEASE_DIR/api"
# Ship the prisma schema + migrations so migrate.sh can run on the droplet.
mkdir -p "$RELEASE_DIR/api/prisma"
cp packages/database/prisma/schema.prisma "$RELEASE_DIR/api/prisma/schema.prisma"
if [ -d packages/database/prisma/migrations ]; then
  cp -R packages/database/prisma/migrations "$RELEASE_DIR/api/prisma/migrations"
fi

echo "==> generating prisma client into release/api (linux-musl + native targets)"
# pnpm deploy --prod strips the workspace's generated .prisma/client output.
# Run prisma generate against the schema inside the release dir so the engine
# binaries (per schema.prisma binaryTargets) land next to it.
PRISMA_BIN="$ROOT/node_modules/.pnpm/node_modules/.bin/prisma"
"$PRISMA_BIN" generate --schema="$RELEASE_DIR/api/prisma/schema.prisma"

# ---- worker (CV-parse pipeline) ----
echo "==> pnpm deploy worker → release/worker"
rm -rf "$RELEASE_DIR/worker"
pnpm --filter=@hiredesq/worker deploy --prod "$RELEASE_DIR/worker"

echo "==> copying generated prisma client from release/api → release/worker"
API_PRISMA_PKG=$(find "$RELEASE_DIR/api/node_modules/.pnpm" -maxdepth 1 -type d -name '@prisma+client@*' | head -n1)
WORKER_PRISMA_PKG=$(find "$RELEASE_DIR/worker/node_modules/.pnpm" -maxdepth 1 -type d -name '@prisma+client@*' | head -n1)
if [ -n "$API_PRISMA_PKG" ] && [ -n "$WORKER_PRISMA_PKG" ]; then
  cp -R "$API_PRISMA_PKG/node_modules/.prisma" "$WORKER_PRISMA_PKG/node_modules/"
  cp -R "$API_PRISMA_PKG/node_modules/@prisma/client/." "$WORKER_PRISMA_PKG/node_modules/@prisma/client/"
else
  echo "  (could not locate @prisma/client pnpm dirs — skipping copy)"
fi

# ---- web ----
echo "==> pnpm deploy web → release/web"
# Standalone output is broken with pnpm monorepos. Use pnpm deploy (working prod
# node_modules), copy .next/ alongside, and run `next start` in the container.
rm -rf "$RELEASE_DIR/web"
pnpm --filter=@hiredesq/web deploy --prod "$RELEASE_DIR/web"

echo "==> copying .next/ build output into release/web"
mkdir -p "$RELEASE_DIR/web/.next"
cp -R apps/web/.next/. "$RELEASE_DIR/web/.next/"
rm -rf "$RELEASE_DIR/web/.next/cache" "$RELEASE_DIR/web/.next/trace"

echo
echo "==> release sizes"
du -sh "$RELEASE_DIR"/* 2>/dev/null || true
echo
echo "release ready at $RELEASE_DIR — now run ./deploy/deploy.sh"

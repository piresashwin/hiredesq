#!/usr/bin/env bash
# Local build → assembles deployable release/ folders for api, worker, web.
# Run this BEFORE deploy.sh. Outputs land under repo-root/release/, which deploy.sh
# rsyncs to the droplet where thin Docker images COPY and run them. Modeled on the
# tradex deploy pipeline.
#
# Produces:
#   release/api/    pnpm deploy --prod (dist + isolated prod node_modules + prisma)
#   release/worker/ pnpm deploy --prod (the CV-parse pipeline)
#   release/web/    pnpm deploy --prod + .next/ build output (no standalone — broken
#                   in pnpm monorepos; the container runs `next start`)
#
# Two non-obvious things this script does (both are load-bearing — see
# deploy/README.md "Gotchas"):
#   1. Bakes NEXT_PUBLIC_* into the web bundle. `next build` inlines NEXT_PUBLIC_*
#      at build time; runtime env never reaches the browser. NEXT_PUBLIC_API_URL
#      and NEXT_PUBLIC_GOOGLE_CLIENT_ID are sourced from deploy/.env.deploy here.
#   2. Repairs the damage prisma 6.19's `generate` does to release/api: it rewrites
#      node_modules symlinks to escape the release tree (dangling in the container)
#      and self-installs its CLI from the repo root (ERR_PNPM_ADDING_TO_ROOT). We
#      run generate with cwd=release/api, copy the linux-musl engine into the local
#      store, and rebuild every escaping symlink — failing loudly if any remain.
#
# Config: deploy/.env.deploy (PUBLIC_APP_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID).
# Prerequisite check: PUBLIC_APP_URL must be set or the build aborts.

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
# NEXT_PUBLIC_GOOGLE_CLIENT_ID is likewise inlined into the web bundle — the
# "Sign in with Google" button renders only when it's present at build time
# (GoogleSignInButton returns null otherwise). Sourced from deploy/.env.deploy.
export NEXT_PUBLIC_GOOGLE_CLIENT_ID="${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}"

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
# pnpm deploy --prod strips the workspace's generated .prisma/client output AND
# the `prisma` CLI (a devDep). With prisma 6.19 the generator self-installs the
# CLI via `pnpm add prisma@<v> -D` when it can't resolve it next to the schema;
# run from the repo root that hits the workspace root and pnpm aborts
# (ERR_PNPM_ADDING_TO_ROOT). Running with cwd=release/api makes prisma's
# projectRoot the release dir, so generate proceeds without the self-install.
PRISMA_BIN="$ROOT/node_modules/.pnpm/node_modules/.bin/prisma"
( cd "$RELEASE_DIR/api" && "$PRISMA_BIN" generate --schema="./prisma/schema.prisma" )
# release/api's @prisma/client symlinks back to the repo-root store, so the
# generated client (incl. the linux-musl engine) lands in the ROOT store. Copy it
# into release/api's OWN @prisma+client store so the Docker COPY ships it and
# `require('.prisma/client')` resolves inside the container.
API_PRISMA_PKG=$(find "$RELEASE_DIR/api/node_modules/.pnpm" -maxdepth 1 -type d -name '@prisma+client@*' | head -n1)
ROOT_PRISMA_CLIENT=$(find "$ROOT/node_modules/.pnpm" -maxdepth 1 -type d -name '@prisma+client@*' | head -n1)/node_modules/.prisma/client
if [ -d "$ROOT_PRISMA_CLIENT" ] && [ -n "$API_PRISMA_PKG" ]; then
  mkdir -p "$API_PRISMA_PKG/node_modules/.prisma"
  rm -rf "$API_PRISMA_PKG/node_modules/.prisma/client"
  cp -R "$ROOT_PRISMA_CLIENT" "$API_PRISMA_PKG/node_modules/.prisma/client"
else
  echo "ERROR: generated prisma client not found to copy into release/api" >&2
  exit 1
fi
# Sanity-check the musl engine actually shipped — the container is alpine/musl.
if ! ls "$API_PRISMA_PKG/node_modules/.prisma/client/"libquery_engine-linux-musl* >/dev/null 2>&1; then
  echo "ERROR: linux-musl query engine missing from release/api prisma client" >&2
  exit 1
fi

# prisma 6.19's `generate` runs an internal pnpm reconcile that REWRITES the
# top-level node_modules symlinks in release/api to point at the REPO-ROOT store
# (../../../node_modules/.pnpm/...) instead of release/api's own .pnpm store.
# Those targets don't exist inside the container (/app), so `node dist/main`
# dies with "Cannot find module 'reflect-metadata'". Re-point every dangling
# top-level link back into the local .pnpm store. (worker/web are generated
# AFTER their deploy and never run prisma generate, so they're unaffected.)
echo "==> repairing release/api node_modules symlinks broken by prisma generate"
# prisma 6.19's `generate` runs an internal pnpm reconcile that REWRITES the
# node_modules symlinks in release/api to point ABOVE the release tree:
#   regular deps   → ../../../node_modules/.pnpm/<pkg>      (repo-root store)
#   injected wsdeps→ ../../../../packages/<name>           (repo source dirs)
# Both accidentally resolve on the build host but are DANGLING inside the
# container (/app), so node dies with "Cannot find module '<pkg>'". Rebuild every
# escaping link from release/api's OWN local .pnpm store (which DOES contain
# injected copies of the @hiredesq/* packages). Idempotent: links already inside
# the tree are left as-is.
node - "$RELEASE_DIR/api/node_modules" <<'NODE'
const fs = require('fs');
const path = require('path');
const nm = process.argv[2];
const pnpmDir = path.join(nm, '.pnpm');

// Index the local .pnpm store: public package name -> relative target under .pnpm.
// Each store entry is <key>/node_modules/<maybe-@scope>/<pkg>.
const index = new Map();
for (const key of fs.readdirSync(pnpmDir)) {
  const innerNm = path.join(pnpmDir, key, 'node_modules');
  if (!fs.existsSync(innerNm)) continue;
  for (const a of fs.readdirSync(innerNm)) {
    if (a === '.bin') continue;
    if (a.startsWith('@')) {
      const scopeDir = path.join(innerNm, a);
      if (!fs.statSync(scopeDir).isDirectory()) continue;
      for (const b of fs.readdirSync(scopeDir)) {
        index.set(`${a}/${b}`, `${key}/node_modules/${a}/${b}`);
      }
    } else {
      index.set(a, `${key}/node_modules/${a}`);
    }
  }
}

// Only PROD deps must exist at runtime; dev-only links (stripped by --prod) that
// prisma left dangling are safe to drop.
const pkgJson = JSON.parse(fs.readFileSync(path.join(nm, '..', 'package.json'), 'utf8'));
const prodDeps = new Set(Object.keys(pkgJson.dependencies || {}));
let fixed = 0, removed = 0, missing = [];
function escapes(tgt) {
  // a link whose target climbs ABOVE node_modules (../../.. or more)
  return /^(\.\.\/){3,}/.test(tgt);
}
function repair(dir, depth, scope) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.pnpm' || ent.name === '.bin') continue;
    const p = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {
      const tgt = fs.readlinkSync(p);
      if (!escapes(tgt)) continue;
      const pkg = scope ? `${scope}/${ent.name}` : ent.name;
      const storeRel = index.get(pkg);
      if (!storeRel) {
        // No prod copy in the store. If it's a prod dep that's a real problem;
        // otherwise it's a dev-only link prisma left dangling — just remove it.
        if (prodDeps.has(pkg)) { missing.push(pkg); }
        else { fs.unlinkSync(p); removed++; }
        continue;
      }
      // top-level link lives in node_modules beside .pnpm → `.pnpm/...`;
      // a scoped link lives one dir deeper (@scope/) → `../.pnpm/...`.
      const next = depth === 0 ? `.pnpm/${storeRel}` : `../.pnpm/${storeRel}`;
      fs.unlinkSync(p);
      fs.symlinkSync(next, p);
      fixed++;
    } else if (ent.isDirectory() && ent.name.startsWith('@') && depth === 0) {
      repair(p, depth + 1, ent.name);
    }
  }
}
repair(nm, 0, null);
console.error(`   repaired ${fixed} symlink(s), removed ${removed} dangling dev-only link(s)`);
if (missing.length) {
  console.error(`ERROR: prod dependency link(s) with no local .pnpm entry: ${missing.join(', ')}`);
  process.exit(1);
}
NODE
# Verify NO link under node_modules still escapes the release tree. The build host
# resolves an escaping link against the repo, so check the link TARGET, not -e.
ESCAPING=$(find "$RELEASE_DIR/api/node_modules" -maxdepth 1 -type l \
    \( -lname '../../../*' -o -lname '../../../../*' \) \
  -o -mindepth 2 -maxdepth 2 -type l \( -lname '../../../*' -o -lname '../../../../*' \) 2>/dev/null | head)
if [ -n "$ESCAPING" ]; then
  echo "ERROR: release/api still has node_modules symlinks escaping the release tree:" >&2
  echo "$ESCAPING" >&2
  exit 1
fi

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

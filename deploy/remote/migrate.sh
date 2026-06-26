#!/usr/bin/env bash
# Apply Prisma migrations against the production database.
# Run on the droplet from $DEPLOY_PATH after a deploy that includes schema changes.
# Review the migration first with /prisma-migration-safe + db-migration-reviewer.

set -euo pipefail

cd "$(dirname "$0")"

# Migrations run over the direct connection (no pooler). prisma CLI is installed
# globally in the api image.
#
# NB: the compose SERVICE is `hiredesq-api` (prefixed so its alias on the shared
# `edge` net is unique — a bare `api` service name collides with sibling stacks on
# that net; see docker-compose.prod.yml + deploy/README.md). Keep this in sync with
# the service key, NOT the container_name.
#
# pgvector ('vector') is a NON-trusted extension, so the hiredesq role cannot
# `CREATE EXTENSION vector` — provision-shared-db.sh pre-creates it (and pg_trgm)
# as the Postgres superuser, which makes the migrations' `CREATE EXTENSION
# IF NOT EXISTS` a no-op. If migrate fails with "permission denied to create
# extension", re-run provision-shared-db.sh on the droplet.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  --entrypoint sh hiredesq-api -c '\
    : "${DIRECT_URL:?DIRECT_URL not set}" && \
    DATABASE_URL="$DIRECT_URL" prisma migrate deploy --schema=./prisma/schema.prisma'

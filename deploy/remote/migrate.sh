#!/usr/bin/env bash
# Apply Prisma migrations against the production database.
# Run on the droplet from $DEPLOY_PATH after a deploy that includes schema changes.
# Review the migration first with /prisma-migration-safe + db-migration-reviewer.

set -euo pipefail

cd "$(dirname "$0")"

# Migrations run over the direct connection (no pooler). prisma CLI is installed
# globally in the api image.
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  --entrypoint sh api -c '\
    : "${DIRECT_URL:?DIRECT_URL not set}" && \
    DATABASE_URL="$DIRECT_URL" prisma migrate deploy --schema=./prisma/schema.prisma'

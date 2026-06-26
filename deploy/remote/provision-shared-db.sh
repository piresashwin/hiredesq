#!/usr/bin/env bash
# One-time: provision hiredesq's database + login role INSIDE the shared
# tradex-postgres instance. Run ON the droplet, once, before the first deploy.
#
# This creates a SEPARATE `hiredesq` database owned by a SEPARATE `hiredesq`
# role. It does NOT touch tradex's `tradesphere` database or its roles — the two
# products share a Postgres *instance*, not data. RLS is deferred for hiredesq
# (CLAUDE.md §1); a single owning role is correct for v1.
#
# Usage (on the droplet):
#   HIREDESQ_DB_PASSWORD='<strong-secret>' ./provision-shared-db.sh
#
# The password MUST match the one in /opt/hiredesq/.env.production
# (DATABASE_URL / DIRECT_URL). We connect as tradex-postgres's superuser, read
# from tradex's own compose env so we don't hardcode it here.

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-tradex-postgres}"
HIREDESQ_DB="${HIREDESQ_DB:-hiredesq}"
HIREDESQ_ROLE="${HIREDESQ_ROLE:-hiredesq}"

: "${HIREDESQ_DB_PASSWORD:?set HIREDESQ_DB_PASSWORD to the password used in /opt/hiredesq/.env.production}"

# The superuser name is whatever tradex booted Postgres with (POSTGRES_USER).
# Pull it from the running container's env rather than guessing.
SUPERUSER="$(docker exec "$PG_CONTAINER" printenv POSTGRES_USER)"
: "${SUPERUSER:?could not read POSTGRES_USER from $PG_CONTAINER}"

# SQL-escape the password for use as a literal.
PW_ESC="$(printf "%s" "$HIREDESQ_DB_PASSWORD" | sed "s/'/''/g")"

echo "==> provisioning role '$HIREDESQ_ROLE' + database '$HIREDESQ_DB' in $PG_CONTAINER (superuser=$SUPERUSER)"

# Role (idempotent). CREATE DATABASE can't run inside a DO block / transaction,
# so it's issued separately and guarded with \gexec.
docker exec -i -e PGPASSWORD_UNUSED=1 "$PG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname postgres <<EOSQL
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$HIREDESQ_ROLE') THEN
    CREATE ROLE "$HIREDESQ_ROLE" LOGIN PASSWORD '$PW_ESC';
  ELSE
    ALTER ROLE "$HIREDESQ_ROLE" WITH LOGIN PASSWORD '$PW_ESC';
  END IF;
END
\$do\$;

SELECT 'CREATE DATABASE "$HIREDESQ_DB" OWNER "$HIREDESQ_ROLE"'
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$HIREDESQ_DB')\gexec

GRANT ALL PRIVILEGES ON DATABASE "$HIREDESQ_DB" TO "$HIREDESQ_ROLE";
EOSQL

# Pre-create extensions AS THE SUPERUSER, inside the hiredesq database.
# WHY THIS STEP EXISTS (a deploy learning): the schema uses pgvector (`vector`)
# and pg_trgm. `pg_trgm` is a TRUSTED extension (a non-superuser DB owner may
# create it), but `vector` is NOT trusted — so the `hiredesq` role canNOT run
# `CREATE EXTENSION vector` and `prisma migrate deploy` would die with
# "permission denied to create extension vector". Creating both here as the
# superuser makes the migrations' `CREATE EXTENSION IF NOT EXISTS` calls no-ops.
# Idempotent. If the image lacks pgvector, this step fails loudly here (good —
# better than a cryptic mid-migration error).
echo "==> pre-creating extensions (pg_trgm, vector) in '$HIREDESQ_DB' as superuser"
docker exec -i "$PG_CONTAINER" \
  psql -v ON_ERROR_STOP=1 --username "$SUPERUSER" --dbname "$HIREDESQ_DB" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "==> done. hiredesq can now connect as:"
echo "    postgresql://$HIREDESQ_ROLE:****@tradex-postgres:5432/$HIREDESQ_DB?schema=public"
echo "    (host = the container name 'tradex-postgres', reachable over the edge net)"

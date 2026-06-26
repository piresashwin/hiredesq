#!/usr/bin/env bash
# PreToolUse(Bash) — BLOCKING safety guard for hiredesq.
# Blocks: committing .env*, destructive / prod-targeted Prisma migrations, and
# echoing/exporting raw secret values inline. Exit 2 => Claude is told why.
set -euo pipefail

cmd="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"
[ -z "$cmd" ] && exit 0

block() { echo "BLOCKED by guard-secrets-prod: $1" >&2; exit 2; }

# 1. Never stage/commit env files.
if printf '%s' "$cmd" | grep -Eiq '\bgit\s+add\b.*\.env'; then
  block "refusing to 'git add' a .env file. Secrets must not enter git."
fi
if printf '%s' "$cmd" | grep -Eiq '\.env(\.[a-z]+)?\b' && printf '%s' "$cmd" | grep -Eiq '\bgit\s+(commit|add)\b'; then
  block "this git command references a .env file. Keep secrets out of version control."
fi

# 2. Destructive Prisma operations and prod-targeted migrations.
if printf '%s' "$cmd" | grep -Eiq 'prisma\s+migrate\s+reset'; then
  block "'prisma migrate reset' drops the database. Refusing automatically."
fi
if printf '%s' "$cmd" | grep -Eiq 'prisma\s+(migrate\s+deploy|db\s+push)' \
   && printf '%s' "$cmd" | grep -Eiq 'prod|production|DATABASE_URL=.*(amazonaws|supabase\.co|railway|render|\.inflxr\.)'; then
  block "looks like a Prisma migration against production. Run migrations through deploy/remote/migrate.sh on the droplet (see /deploy-release)."
fi

# 3. Don't echo/export raw secret values inline.
if printf '%s' "$cmd" | grep -Eiq '\b(export\s+)?(ANTHROPIC_API_KEY|ENCRYPTION_KEY|JWT_SECRET|.*_API_KEY|.*_SECRET|DATABASE_URL[A-Z_]*|S3_[A-Z_]*KEY)\s*=\s*["'"'"'a-zA-Z0-9]'; then
  block "this command assigns a real secret value inline. Source it from the environment / .env instead."
fi

exit 0

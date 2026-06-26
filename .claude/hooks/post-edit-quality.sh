#!/usr/bin/env bash
# PostToolUse(Edit|Write) — WARN-ONLY quality feedback for hiredesq.
# Runs prettier (check) and eslint on the changed JS/TS file; reminds about
# prisma generate on schema changes. Never blocks: always exits 0.
set -uo pipefail

file="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-/Users/ashwin/dev/hiredesq}"
warn() { echo "⚠️  quality(${file##*/}): $1" >&2; }

case "$file" in
  *.ts|*.tsx|*.js|*.jsx)
    if command -v pnpm >/dev/null 2>&1; then
      (cd "$root" && pnpm exec prettier --check "$file" >/dev/null 2>&1) || warn "prettier would reformat this file (run: pnpm exec prettier --write '$file')"
      lint="$(cd "$root" && pnpm exec eslint "$file" 2>&1)" || warn "eslint reported issues:\n$(printf '%s' "$lint" | tail -15)"
    fi
    ;;
  *.prisma)
    warn "schema changed — run 'pnpm db:generate', create a migration with /prisma-migration-safe, and review with the db-migration-reviewer agent."
    ;;
esac

exit 0

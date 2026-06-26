#!/usr/bin/env bash
# PostToolUse(Edit|Write) — WARN-ONLY scan for PII-in-logs and plaintext secrets.
# Never blocks: always exits 0. Warnings go to stderr (see CLAUDE.md §2, §6).
set -uo pipefail

file="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

warn() { echo "⚠️  pii-scan(${file##*/}): $1" >&2; }

case "$file" in
  *.ts|*.tsx|*.js|*.jsx)
    # Logging a likely-PII variable/object by name.
    if grep -Eni '(console\.(log|info|debug|warn|error)|logger\.(log|info|debug|warn|error)|\.debug\(|\.info\()[^)]*(candidate|resume|parsed|applicant|email|phone|contact|firstName|lastName|address)' "$file" >/dev/null 2>&1; then
      warn "a log statement references candidate/PII-looking data — log IDs and counts, not contents (CLAUDE.md §2)."
    fi
    # Whole-object logging that can sweep PII in.
    if grep -Eni 'JSON\.stringify\((candidate|parsed|applicant|resume)' "$file" >/dev/null 2>&1; then
      warn "JSON.stringify of a candidate/parsed object near logging can leak PII — serialize a redacted view."
    fi
    # Raw error message persisted to a DB column or returned in a response — PII
    # (resume fragments, parsed fields) rides through err.message into ParseJob.error
    # and out to the client. Use a safe enumerated error code, not err.message.
    if grep -Eni 'error\s*:.*\.message\b' "$file" >/dev/null 2>&1; then
      warn "an error '.message' is being put into an 'error' field — model/extractor errors embed candidate PII; persist a safe enumerated code, log err.name/stack server-side only (CLAUDE.md §2)."
    fi
    # Inline secret assignment.
    if grep -Eni '(ANTHROPIC_API_KEY|ENCRYPTION_KEY|JWT_SECRET|[A-Z_]*_SECRET|[A-Z_]*_API_KEY)\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{12,}' "$file" >/dev/null 2>&1; then
      warn "looks like a hard-coded secret — read it from process.env / config instead (CLAUDE.md §6)."
    fi
    ;;
esac

exit 0

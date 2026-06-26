/**
 * Safe error mapping for the parse pipeline (CLAUDE.md §2).
 *
 * A caught error's `.message` MUST NOT be persisted into `ParseJob.error` or
 * returned to the client: model-output `JSON.parse` errors, mammoth/pdf-parse/xlsx
 * errors, and validation errors embed candidate PII (names, emails, phones, resume
 * fragments) and `ParseJob.error` is surfaced verbatim in the ingest UI. Every parse
 * failure path routes through this helper so only a safe, PII-free string is stored.
 * Log the raw `err.name`/stack server-side instead (never the message contents).
 */
export function toSafeParseError(err: unknown, fallback: string): string {
  // Quota exhaustion carries no PII and is worth surfacing precisely so the UI can
  // nudge an upgrade. Detected by name to avoid a circular import with the processor.
  if (err instanceof Error && err.name === "IngestQuotaError") {
    return "Free ingest limit reached — upgrade to keep parsing.";
  }
  // Everything else: the caller's pre-vetted, PII-free fallback. NEVER err.message.
  return fallback;
}

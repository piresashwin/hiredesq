/**
 * Model B ingest meter (FEATURE-SET.md §F3, CLAUDE.md §4). Resume parsing is FREE
 * — it is NOT drawn from the daily credit balance (that meter gates submission
 * generation, the monetizable output). Ingest is instead protected by a quota, so
 * the activation moment ("I dumped my 200-resume backlog") never paywalls on day 1,
 * while a scripted-abuse dump still hits a ceiling.
 *
 * The live ceiling is read from the Plan reference table (Plan.ingestFreeLimit) at
 * runtime by the credits service and the worker's reserveIngestSlot. null in the DB
 * means unmetered (paid tiers). The functions below are pure helpers that accept a
 * `limit` argument; callers pass the DB-sourced value.
 *
 * INGEST_FREE_LIMIT is the SEED DEFAULT for the free tier — the value placed in
 * the Plan table row for `free` by the seed script. It is NOT used as the live
 * ceiling by any service or worker path; changing a price/limit is a data edit, not
 * a deploy. This constant exists only so the seed is self-documenting.
 *
 * Pure domain logic — the persistence/lock lives in the worker + credits service.
 */
export const INGEST_FREE_LIMIT = 1000; // seed default for the free tier; live ceiling in Plan table

/**
 * Free-tier ingest is allowed while lifetime usage is under the limit. `limit`
 * is REQUIRED — callers must null-check Plan.ingestFreeLimit first (null = unmetered,
 * so this function is never called for unmetered tiers). The default has been removed
 * deliberately so passing the raw nullable DB value is a compile error, not a silent
 * substitution of the seed default.
 */
export function canParseFree(usedLifetime: number, limit: number): boolean {
  return usedLifetime < limit;
}

/**
 * How many free parses remain (never negative) — for the UI meter / 402 copy.
 * `limit` is REQUIRED — same null-check requirement as canParseFree above.
 */
export function ingestQuotaRemaining(usedLifetime: number, limit: number): number {
  return Math.max(0, limit - usedLifetime);
}

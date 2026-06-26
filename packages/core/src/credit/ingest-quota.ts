/**
 * Model B ingest meter (FEATURE-SET.md §F3, CLAUDE.md §4). Resume parsing is FREE
 * — it is NOT drawn from the daily credit balance (that meter gates submission
 * generation, the monetizable output). Ingest is instead protected by a quota, so
 * the activation moment ("I dumped my 200-resume backlog") never paywalls on day 1,
 * while a scripted-abuse dump still hits a ceiling.
 *
 * The quota is a single lifetime counter: a free workspace may parse up to
 * INGEST_FREE_LIMIT before ingest nudges an upgrade. This generously covers any
 * real solo backlog (a 500-CV dump costs ~$1–2 of Haiku COGS) while bounding abuse.
 * Paid (team) plans are unmetered — the gate only applies on the free plan.
 *
 * Pure domain logic — the persistence/lock lives in the worker + credits service.
 */
export const INGEST_FREE_LIMIT = 1000;

/** Free-tier ingest is allowed while lifetime usage is under the limit. */
export function canParseFree(usedLifetime: number, limit: number = INGEST_FREE_LIMIT): boolean {
  return usedLifetime < limit;
}

/** How many free parses remain (never negative) — for the UI meter / 402 copy. */
export function ingestQuotaRemaining(
  usedLifetime: number,
  limit: number = INGEST_FREE_LIMIT,
): number {
  return Math.max(0, limit - usedLifetime);
}

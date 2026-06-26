// Pure helpers for the account-at-a-glance home (no Prisma I/O) so the windowing
// is deterministically testable with a fixed `now`. MVP-SPEC §2E.

const DAY_MS = 24 * 60 * 60 * 1000;

/** How far ahead a guarantee window must clear to count as "clearing soon". */
export const CLEARING_SOON_DAYS = 7;

/** Cap on the named items previewed per attention queue (the count is exact;
 *  the list is a teaser). Keeps the payload small and PII-light (§2). */
export const ATTENTION_PREVIEW_LIMIT = 5;

/**
 * The `[now, now + days)` window an at-risk placement's `clearsAt` must fall in
 * to be "clearing soon". The lower bound `now` excludes already-elapsed windows —
 * those read as `cleared` already (effectivePlacementStatus), so they're earned,
 * not pending.
 */
export function clearingSoonWindow(now: Date, days: number = CLEARING_SOON_DAYS): {
  gte: Date;
  lt: Date;
} {
  return { gte: now, lt: new Date(now.getTime() + days * DAY_MS) };
}

// Pure period-boundary helpers for the lazy credit grant (CLAUDE.md §4).
// Reset boundaries are UTC for v1 so renewal is stable regardless of server
// timezone. No I/O — unit-tested in isolation.
//
// NOTE: Monthly resets use a UTC calendar-month boundary, NOT a billing-anchor
// date. This is a deliberate v1 simplification: all workspaces roll over on the
// 1st of each month at 00:00 UTC, irrespective of when they signed up. A
// billing-anchored reset would require tracking the subscription start date per
// workspace and is deferred until Stripe integration matures.

// ─── Day helpers (kept: used by no callers currently, but preserved for any
//     future daily-bounded feature; grep confirmed day-period imports have been
//     updated to period.ts) ─────────────────────────────────────────────────

/** A `YYYY-MM-DD` key identifying a UTC calendar day (e.g. "2026-06-17"). */
export function dayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * True when `now` falls on a later UTC calendar day than `lastGrantedAt` (or
 * when the allotment was never granted).
 */
export function isNewDay(lastGrantedAt: Date | null, now: Date): boolean {
  if (lastGrantedAt === null) return true;
  return dayKey(lastGrantedAt) < dayKey(now);
}

/** The first instant of the next UTC calendar day after `now`. */
export function startOfNextDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

// ─── Month helpers ────────────────────────────────────────────────────────

/** A `YYYY-MM` key identifying a UTC calendar month (e.g. "2026-06"). */
export function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * True when `now` falls in a later UTC calendar month than `lastGrantedAt` (or
 * when the allotment was never granted). Drives the idempotent-by-month renewal:
 * a second call within the same month returns false (no re-grant).
 */
export function isNewMonth(lastGrantedAt: Date | null, now: Date): boolean {
  if (lastGrantedAt === null) return true;
  return monthKey(lastGrantedAt) < monthKey(now);
}

/** The first instant of the next UTC calendar month after `now`. */
export function startOfNextMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

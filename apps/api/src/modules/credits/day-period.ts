// Pure day-boundary helpers for the lazy daily credit grant (CLAUDE.md §4).
// The reset boundary is UTC for v1 so the renewal is stable regardless of
// server timezone. No I/O — unit-tested in isolation.

/** A `YYYY-MM-DD` key identifying a UTC calendar day (e.g. "2026-06-17"). */
export function dayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * True when `now` falls on a later UTC calendar day than `lastGrantedAt` (or
 * when the allotment was never granted). Drives the idempotent-by-day renewal:
 * a second call within the same day returns false (no re-grant).
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

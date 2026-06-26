import type { PlacementStatus } from "@hiredesq/shared";

// Pure guarantee-window logic (no Prisma I/O) so it's deterministically testable
// with a fixed `now`. MVP-SPEC §2E / CLAUDE.md §3.

const DAY_MS = 24 * 60 * 60 * 1000;

/** clearsAt = placedAt + guaranteeDays. Set at placement-create time. */
export function computeClearsAt(placedAt: Date, guaranteeDays: number): Date {
  return new Date(placedAt.getTime() + guaranteeDays * DAY_MS);
}

/**
 * The EFFECTIVE status used for recognition AND display. An `at_risk` placement
 * whose window has elapsed reads as `cleared` even before any stored flip — so the
 * "earned" number never depends on a cron having run. Terminal states
 * (`fell_through`, `replaced`) and an already-stored `cleared` pass through.
 */
export function effectivePlacementStatus(
  status: PlacementStatus,
  clearsAt: Date,
  now: Date,
): PlacementStatus {
  if (status === "at_risk" && now.getTime() >= clearsAt.getTime()) return "cleared";
  return status;
}

/** A placement still contributes to booked revenue (not reversed/superseded). */
export function isLive(status: PlacementStatus): boolean {
  return status === "at_risk" || status === "cleared";
}

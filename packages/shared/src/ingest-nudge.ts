// Ingest-quota upgrade nudge thresholds (CLAUDE.md §4/§5). Parsing is FREE but
// metered per period (Model B, FEATURE-SET §F3): free = 500 lifetime, solo_pro =
// 200/month, team = unmetered. As a workspace approaches its ceiling we nudge an
// upgrade — escalating from a quiet meter to a celebratory banner to the wall.
//
// Pure helpers shared by web (the meter/banner), the worker (the proactive
// notification), and tests — one source of truth for the thresholds, mirroring the
// LOW_RATIO = 0.15 convention used by the submission CreditMeter. Driven purely off
// (used, limit) so it is tier-agnostic: a null limit (unmetered/paid) is always "none".

/** Quiet informational meter appears at/above this fraction of the ceiling. */
export const INGEST_NUDGE_SUBTLE = 0.75;
/** Dismissible celebratory upgrade banner + the proactive notification fire here. */
export const INGEST_NUDGE_BANNER = 0.9;

/**
 * How close a workspace is to its ingest ceiling, as an escalating level:
 *  - "none"   below 75%, or unmetered (limit null) — nothing shown
 *  - "subtle" 75–90% — a quiet "N of M parses used" meter
 *  - "banner" 90–100% — a dismissible celebratory upgrade banner
 *  - "wall"   at/over the ceiling — parsing is paused until upgrade/reset
 */
export type IngestNudgeLevel = "none" | "subtle" | "banner" | "wall";

export function ingestNudgeLevel(used: number, limit: number | null): IngestNudgeLevel {
  if (limit === null || limit <= 0) return "none"; // unmetered (paid) — never nudge
  if (used >= limit) return "wall";
  const ratio = used / limit;
  if (ratio >= INGEST_NUDGE_BANNER) return "banner";
  if (ratio >= INGEST_NUDGE_SUBTLE) return "subtle";
  return "none";
}

/**
 * The exact usage count at which the banner threshold is first reached — the
 * worker uses this to fire the proactive "approaching limit" notification once,
 * the first time `ingestUsed` reaches it within a period.
 */
export function ingestBannerThresholdCount(limit: number): number {
  return Math.ceil(limit * INGEST_NUDGE_BANNER);
}

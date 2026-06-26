import type { PipelineStage, SubmissionVerdict, TrailEntryKind } from "@hiredesq/shared";

// Pure mapping from a client verdict to its pipeline + trail effects (§2D, F5).
// No I/O — deterministically unit-testable.

/**
 * The pipeline stage a client verdict nudges a job-linked application to —
 * FORWARD-ONLY: it never disturbs a booked win (`placed`) and never re-opens a
 * closed/later stage. Returns null when no auto-move applies (the caller leaves the
 * stage as-is). `advance`/`interview` move an early live stage to `interview`;
 * `reject` moves any non-placed application to `rejected`.
 */
export function verdictToStage(
  current: PipelineStage,
  verdict: SubmissionVerdict,
): PipelineStage | null {
  if (current === "placed") return null; // don't disturb a booked win
  if (verdict === "reject") return current === "rejected" ? null : "rejected";
  // advance | interview → move forward to interview only from an earlier live stage
  if (current === "sourced" || current === "submitted") return "interview";
  return null;
}

/** A verdict's trail-entry kind: a positive verdict qualifies, a reject disqualifies. */
export function verdictToTrailKind(verdict: SubmissionVerdict): TrailEntryKind {
  return verdict === "reject" ? "disqualified" : "qualified";
}

/** Human label for the trail note. */
export function verdictLabel(verdict: SubmissionVerdict): string {
  if (verdict === "advance") return "Advance";
  if (verdict === "interview") return "Interview";
  return "Reject";
}

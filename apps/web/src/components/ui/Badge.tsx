import type { ReactNode } from "react";
import type { ConstraintStatus, ConstraintSummary, PlacementStatus, SubmissionStatus } from "@hiredesq/shared";
import { cn } from "@/lib/cn";

// Chips / badges (design-system §6.8). Stage badges use the pipeline palette
// (§3.3) where colour reads as progression — Placed = money green, Rejected is
// muted (a rejection is not an error). The AI badge marks AI-derived, editable
// values so the recruiter knows she can correct them (Principle 6).

export type Stage = "sourced" | "submitted" | "interview" | "placed" | "rejected";

const STAGE_STYLE: Record<Stage, string> = {
  sourced: "bg-stage-sourced/10 text-stage-sourced",
  submitted: "bg-stage-submitted/10 text-stage-submitted",
  interview: "bg-stage-interview/10 text-stage-interview",
  placed: "bg-stage-placed/10 text-stage-placed",
  rejected: "bg-stage-rejected/15 text-stage-rejected",
};

const STAGE_LABEL: Record<Stage, string> = {
  sourced: "Sourced",
  submitted: "Submitted",
  interview: "Interview",
  placed: "Placed",
  rejected: "Rejected",
};

const base =
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label font-medium whitespace-nowrap";

export function StageBadge({ stage, className }: { stage: Stage; className?: string }) {
  return (
    <span className={cn(base, STAGE_STYLE[stage], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STAGE_LABEL[stage]}
    </span>
  );
}

/** Marks an AI-extracted, editable value. Sets the expectation that it's correctable. */
export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(base, "bg-brand-tint text-brand", className)}
      title="Extracted by AI — editable"
    >
      ✦ AI
    </span>
  );
}

/** Generic neutral chip (skills, tags). */
export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(base, "bg-subtle text-muted", className)}>{children}</span>;
}

// Submission lifecycle (§2D, Wedge 2): sent → viewed → advance/interview, or
// reject. Reuses the pipeline palette where it maps cleanly; "advance" reads as
// progress (brand green), "reject" stays muted — a no is not an error (Principle 7).
const SUBMISSION_STYLE: Record<SubmissionStatus, string> = {
  sent: "bg-stage-submitted/10 text-stage-submitted",
  viewed: "bg-info/10 text-info",
  advance: "bg-brand-tint text-brand",
  interview: "bg-stage-interview/10 text-stage-interview",
  reject: "bg-stage-rejected/15 text-stage-rejected",
};

// Pre-verdict states are factual ("Sent", the client opened it → "Viewed"); the
// three terminal states carry a "Client:" prefix so it reads as the client's call,
// not ours — and so a verdict is never mistaken for a pipeline stage. "Passed" (not
// "Rejected") keeps a no calm rather than alarming (Principle 7).
const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  sent: "Sent",
  viewed: "Viewed",
  advance: "Client: Advance",
  interview: "Client: Interview",
  reject: "Client: Passed",
};

export function SubmissionBadge({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  return (
    <span className={cn(base, SUBMISSION_STYLE[status], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {SUBMISSION_LABEL[status]}
    </span>
  );
}

// Placement guarantee lifecycle (§2E). `cleared` is the only earned state → money
// green (positive, confident). `at_risk` is booked-but-inside-window → warning
// terracotta (cautionary, NOT alarming — the fee is real, just not final).
// `fell_through`/`replaced` are reversed/superseded → muted (not an error).
const PLACEMENT_STYLE: Record<PlacementStatus, string> = {
  cleared: "bg-success-tint text-money",
  at_risk: "bg-warning-tint text-warning",
  fell_through: "bg-subtle text-muted",
  replaced: "bg-subtle text-muted",
};

const PLACEMENT_LABEL: Record<PlacementStatus, string> = {
  cleared: "Cleared",
  at_risk: "At risk",
  fell_through: "Fell through",
  replaced: "Replaced",
};

export function PlacementStatusBadge({
  status,
  className,
}: {
  status: PlacementStatus;
  className?: string;
}) {
  return (
    <span className={cn(base, PLACEMENT_STYLE[status], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {PLACEMENT_LABEL[status]}
    </span>
  );
}

// Qualification chip (§2C, F4). DETERMINISTIC data — a factual checklist of the
// job's hard requirements vs the candidate, NOT an AI score or ranking. Tone:
//  • pass → money green (the scarce qualified few — easy to spot, positive)
//  • fail → warning terracotta (a cautionary MISMATCH, not an alarming error)
//  • unknown → muted (NEEDS INFO — absence of data, never treated as a fail)
// Status is conveyed by an icon glyph + label, never colour alone (a11y §10).
const QUALIFICATION_STYLE: Record<ConstraintStatus, string> = {
  pass: "bg-success-tint text-money",
  fail: "bg-warning-tint text-warning",
  unknown: "bg-subtle text-muted",
};

const QUALIFICATION_LABEL: Record<ConstraintStatus, string> = {
  pass: "Qualified",
  fail: "Mismatch",
  unknown: "Needs info",
};

// A tiny status glyph so the meaning survives without colour (and in monochrome).
const QUALIFICATION_GLYPH: Record<ConstraintStatus, string> = {
  pass: "✓",
  fail: "!",
  unknown: "?",
};

/**
 * Renders the qualification verdict for an application. Returns null for "none"
 * (the job sets no hard requirements — nothing to show, by design).
 */
export function QualificationBadge({
  summary,
  className,
}: {
  summary: ConstraintSummary;
  className?: string;
}) {
  if (summary === "none") return null;
  return (
    <span className={cn(base, QUALIFICATION_STYLE[summary], className)}>
      <span aria-hidden className="font-semibold leading-none">
        {QUALIFICATION_GLYPH[summary]}
      </span>
      {QUALIFICATION_LABEL[summary]}
    </span>
  );
}

export { QUALIFICATION_LABEL };

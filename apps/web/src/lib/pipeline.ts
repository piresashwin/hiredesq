// Pipeline / stage helpers shared across the Jobs board, list view, and the
// jobs index (design-system §3.3, §6.5). Stage colour reads as progression —
// Placed = money green, Rejected = muted (a rejection is not an error). Tokens
// only, never hardcoded hex.

import type { PipelineStage } from "@hiredesq/shared";

export const STAGE_ORDER: PipelineStage[] = [
  "sourced",
  "submitted",
  "interview",
  "placed",
  "rejected",
];

export const STAGE_LABEL: Record<PipelineStage, string> = {
  sourced: "Sourced",
  submitted: "Submitted",
  interview: "Interview",
  placed: "Placed",
  rejected: "Rejected",
};

// Column accent classes (background tint + text + ring) sourced from the §3.3
// stage tokens. Kept as full strings so Tailwind's content scan keeps them.
export const STAGE_ACCENT: Record<
  PipelineStage,
  { dot: string; text: string; soft: string; ring: string; bar: string }
> = {
  sourced: {
    dot: "bg-stage-sourced",
    text: "text-stage-sourced",
    soft: "bg-stage-sourced/10",
    ring: "ring-stage-sourced/40",
    bar: "bg-stage-sourced",
  },
  submitted: {
    dot: "bg-stage-submitted",
    text: "text-stage-submitted",
    soft: "bg-stage-submitted/10",
    ring: "ring-stage-submitted/40",
    bar: "bg-stage-submitted",
  },
  interview: {
    dot: "bg-stage-interview",
    text: "text-stage-interview",
    soft: "bg-stage-interview/10",
    ring: "ring-stage-interview/40",
    bar: "bg-stage-interview",
  },
  placed: {
    dot: "bg-stage-placed",
    text: "text-stage-placed",
    soft: "bg-stage-placed/10",
    ring: "ring-stage-placed/40",
    bar: "bg-stage-placed",
  },
  rejected: {
    dot: "bg-stage-rejected",
    text: "text-stage-rejected",
    soft: "bg-stage-rejected/15",
    ring: "ring-stage-rejected/40",
    bar: "bg-stage-rejected",
  },
};

// The in-flight stages — what still counts toward weighted pipeline value
// (Placed is booked revenue, Rejected is dead; both contribute 0, §6.5).
export const IN_FLIGHT_STAGES: PipelineStage[] = ["sourced", "submitted", "interview"];

// The "advance →" path: the natural next stage a recruiter moves a candidate to.
// Placed/Rejected are terminal so they have no forward step.
export const NEXT_STAGE: Partial<Record<PipelineStage, PipelineStage>> = {
  sourced: "submitted",
  submitted: "interview",
  interview: "placed",
};

/**
 * A per-card expected-fee display estimate, derived from the job's expectedFee
 * (the API is the source of truth for the actual deal value now — the old
 * fixture map is gone). This is DISPLAY ONLY; real fees resolve server-side as
 * Decimal (CLAUDE.md §3). Returns null when the job has no expected fee set.
 */
export function expectedFeeForJob(jobExpectedFee: string | null | undefined): string | null {
  if (jobExpectedFee == null || jobExpectedFee.trim() === "") return null;
  const n = Number(jobExpectedFee);
  if (!Number.isFinite(n) || n <= 0) return null;
  return jobExpectedFee;
}

// Deterministic avatar tint per person (recruiters scan by face/initial, §6.5).
// Tokens only — a small palette drawn from the brand/stage family so initials
// circles read as warm, not random web colours.
const AVATAR_TINTS = [
  "bg-stage-submitted/15 text-stage-submitted",
  "bg-stage-interview/15 text-stage-interview",
  "bg-brand-tint text-brand",
  "bg-stage-sourced/15 text-stage-sourced",
  "bg-warning-tint text-warning",
  "bg-info/10 text-info",
] as const;

/** Up-to-two-letter initials from a display name (e.g. "Sarah Chen" → "SC"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Stable colour class pair for an avatar, keyed off the candidate id. */
export function avatarTint(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length]!;
}

/** Whole-number days between two ISO timestamps (days-in-stage on a card). */
export function daysBetween(iso: string, now: number = Date.now()): number {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

export function daysInStageLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

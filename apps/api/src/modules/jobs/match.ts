// The candidate-match ranking algorithm (§5), as a PURE function — no Prisma, no AI,
// no NestJS — so it's directly unit-testable and the service stays a thin orchestrator.
//
// "Best of cosine, relevant only" (user decision): the ANN recall + max-distance gate
// happen in SQL (so only relevant candidates ever reach here); this function turns the
// ranked rows into match DTOs and applies the CONSTRAINT-AWARE ordering — qualified
// (no hard fail) first, near-misses demoted but NOT hidden, similarity desc within each
// group — then truncates to the requested count. This is semantic suggestion (recall)
// + deterministic constraint flags, NOT an AI fit-score (MVP-SPEC §3).
import type { CandidateMatchDto } from "@hiredesq/shared";
import { checkConstraints, type CandidateConstraintFields, type JobConstraints } from "./constraints.js";
import { toCandidateListItemDto } from "../candidates/candidate.mapper.js";

/** One ANN result: a candidate id and its cosine DISTANCE to the job (ascending). */
export interface RankedRow {
  id: string;
  distance: number;
}

/** A hydrated candidate row: the list projection PLUS the constraint fields. */
export type MatchCandidateRow = Parameters<typeof toCandidateListItemDto>[0] &
  CandidateConstraintFields;

/**
 * Build the ordered match list from ANN-ranked ids and their hydrated rows. `ranked`
 * is assumed sorted by distance ascending (closest first); rows missing from `byId`
 * are skipped. Qualified candidates come first (similarity order preserved from
 * `ranked`), then near-misses (≥1 hard-constraint fail), then truncate to `take`.
 */
export function buildMatches(
  job: JobConstraints,
  ranked: RankedRow[],
  byId: Map<string, MatchCandidateRow>,
  take: number,
): CandidateMatchDto[] {
  const matches: CandidateMatchDto[] = [];
  for (const { id, distance } of ranked) {
    const row = byId.get(id);
    if (!row) continue;
    const { summary, flags } = checkConstraints(job, {
      nationality: row.nationality,
      residenceTransferable: row.residenceTransferable,
      licenses: row.licenses,
    });
    matches.push({
      candidate: toCandidateListItemDto(row),
      // pgvector `<=>` is cosine distance; similarity = 1 - distance, clamped to [0,1].
      similarity: Math.max(0, Math.min(1, 1 - distance)),
      constraintSummary: summary,
      constraintFlags: flags,
    });
  }
  const qualified = matches.filter((m) => m.constraintSummary !== "fail");
  const nearMiss = matches.filter((m) => m.constraintSummary === "fail");
  return [...qualified, ...nearMiss].slice(0, take);
}

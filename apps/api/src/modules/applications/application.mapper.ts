import type { Application, Candidate } from "@hiredesq/database";
import type { ApplicationDto, PipelineStage } from "@hiredesq/shared";
import type { ConstraintResult } from "../jobs/constraints.js";

// An Application row joined with the minimal candidate fields for board cards.
// The summary uses only NON-PII fields (name/title/company) — no email/phone, so
// no decryption happens at this boundary (CLAUDE.md §2). The constraint fields are
// selected for the qualification filter but are NOT echoed in the card summary.
type CandidateSummaryFields = Pick<Candidate, "id" | "fullName" | "currentTitle" | "currentCompany">;
export type ApplicationRow = Application & { candidate: CandidateSummaryFields };

// `constraint` is the deterministic qualification verdict (F4, §2C); when its
// summary is "none" (job unconstrained) the per-flag detail is omitted.
export function toApplicationDto(row: ApplicationRow, constraint?: ConstraintResult): ApplicationDto {
  const dto: ApplicationDto = {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    stage: row.stage as PipelineStage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    candidate: {
      id: row.candidate.id,
      fullName: row.candidate.fullName,
      currentTitle: row.candidate.currentTitle,
      currentCompany: row.candidate.currentCompany,
    },
  };
  if (constraint) {
    dto.constraintSummary = constraint.summary;
    if (constraint.summary !== "none") dto.constraintFlags = constraint.flags;
  }
  return dto;
}

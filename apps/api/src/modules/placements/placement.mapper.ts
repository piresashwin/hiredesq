import type { Candidate, Job, Placement } from "@hiredesq/database";
import type { PlacementDto } from "@hiredesq/shared";
import { effectivePlacementStatus } from "./guarantee.js";

// A Placement row joined with the minimal candidate fields (for the revenue
// placements table) and the job title. The summary uses only NON-PII fields
// (name/title/company) — no email/phone, so no decryption at this boundary
// (CLAUDE.md §2). feeAmount is a Decimal serialized as a string, never a float (§3).
type CandidateSummaryFields = Pick<Candidate, "id" | "fullName" | "currentTitle" | "currentCompany">;
type JobTitleFields = Pick<Job, "title">;
export type PlacementRow = Placement & { candidate: CandidateSummaryFields; job: JobTitleFields };

// `now` lets the DTO report the EFFECTIVE status (an at_risk placement past its
// window reads as `cleared`) without needing a stored flip (§2E).
export function toPlacementDto(row: PlacementRow, now: Date = new Date()): PlacementDto {
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    feeAmount: row.feeAmount.toString(),
    currency: row.currency,
    placedAt: row.placedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    guaranteeDays: row.guaranteeDays,
    clearsAt: row.clearsAt.toISOString(),
    status: effectivePlacementStatus(row.status, row.clearsAt, now),
    replacesPlacementId: row.replacesPlacementId,
    candidate: {
      id: row.candidate.id,
      fullName: row.candidate.fullName,
      currentTitle: row.candidate.currentTitle,
      currentCompany: row.candidate.currentCompany,
    },
    jobTitle: row.job.title,
  };
}

import type { Candidate, Submission } from "@hiredesq/database";
import type {
  MaskedProfileDto,
  SharedSubmissionDto,
  SubmissionDto,
  SubmissionStatus,
} from "@hiredesq/shared";

// Only the non-PII candidate fields the submissions list needs (§2).
type CandidateSummaryFields = Pick<Candidate, "id" | "fullName" | "currentTitle" | "currentCompany">;
export type SubmissionRow = Submission & { candidate?: CandidateSummaryFields | null };

// `maskedProfile` is stored as JSON; it was built by the deterministic masker so it
// already carries NO contact fields (CLAUDE.md §2). The cast is the read boundary.
function readMaskedProfile(row: Submission): MaskedProfileDto {
  return row.maskedProfile as unknown as MaskedProfileDto;
}

// Full DTO for the OWNER (workspace-scoped, behind the guard stack).
export function toSubmissionDto(row: SubmissionRow): SubmissionDto {
  return {
    id: row.id,
    candidateId: row.candidateId,
    jobId: row.jobId,
    status: row.status as SubmissionStatus,
    summary: row.summary,
    maskedProfile: readMaskedProfile(row),
    shareToken: row.shareToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.candidate
      ? {
          candidate: {
            id: row.candidate.id,
            fullName: row.candidate.fullName,
            currentTitle: row.candidate.currentTitle,
            currentCompany: row.candidate.currentCompany,
          },
        }
      : {}),
  };
}

// PUBLIC share view (tokenized, unauthenticated). DELIBERATELY minimal: no ids, no
// workspace, no contact — only what a client needs to review (§1/§2).
export function toSharedSubmissionDto(row: Submission): SharedSubmissionDto {
  return {
    summary: row.summary,
    maskedProfile: readMaskedProfile(row),
    status: row.status as SubmissionStatus,
    createdAt: row.createdAt.toISOString(),
  };
}

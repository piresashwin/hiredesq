import { IsIn, IsOptional, IsString } from "class-validator";
import type { GenerateSubmissionInput, RecordVerdictInput, SubmissionVerdict } from "@hiredesq/shared";
import { PaginationQuery } from "../../common/pagination.js";

// ?candidateId scopes the list to one candidate (the profile panel); bounded by
// the inherited `limit` (Batch B/C). No workspaceId — it's the route param (§1).
export class ListSubmissionsQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  candidateId?: string;
}

// No workspaceId field — it comes from the authenticated route param, never the
// body (CLAUDE.md §1). candidateId/jobId are verified in-tenant in the service.
export class GenerateSubmissionDto implements GenerateSubmissionInput {
  @IsString()
  candidateId!: string;

  /** Optional job link (V1.1 path). Omit for the [Launch] pool-only submission. */
  @IsOptional()
  @IsString()
  jobId?: string;
}

const VERDICTS: SubmissionVerdict[] = ["advance", "interview", "reject"];

export class RecordVerdictDto implements RecordVerdictInput {
  @IsIn(VERDICTS)
  verdict!: SubmissionVerdict;
}

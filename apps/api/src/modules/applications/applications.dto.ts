import { IsIn, IsString } from "class-validator";
import type { AttachCandidateInput, MoveStageInput, PipelineStage } from "@hiredesq/shared";

// No workspaceId/jobId fields — both come from the authenticated route params,
// never the body (CLAUDE.md §1).
const STAGES: PipelineStage[] = ["sourced", "submitted", "interview", "placed", "rejected"];

export class AttachCandidateDto implements AttachCandidateInput {
  @IsString()
  candidateId!: string;
}

export class MoveStageDto implements MoveStageInput {
  @IsIn(STAGES)
  stage!: PipelineStage;
}

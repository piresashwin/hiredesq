import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { AddTrailEntryInput, TrailEntryKind } from "@hiredesq/shared";

// No workspaceId/jobId/applicationId fields — they come from the authenticated
// route params, never the body (CLAUDE.md §1). The note is recruiter-authored free
// text (fine to store); we never log its contents (§2).
const KINDS: TrailEntryKind[] = ["note", "qualified", "disqualified"];

export class AddTrailEntryDto implements AddTrailEntryInput {
  // Defaults to "note" in the service when omitted.
  @IsOptional()
  @IsIn(KINDS)
  kind?: TrailEntryKind;

  @IsString()
  @MaxLength(2000)
  note!: string;
}

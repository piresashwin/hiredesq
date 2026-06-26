import { IsOptional, IsString, MaxLength } from "class-validator";
import type { UpgradeInterestInput } from "@hiredesq/shared";

// No workspaceId / userId here — workspaceId comes from the route param and
// userId from the authenticated principal, never the body (CLAUDE.md §1).
export class UpgradeInterestDto implements UpgradeInterestInput {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import type {
  CreatePlacementInput,
  FallThroughInput,
  FeeBasis,
  ReplacePlacementInput,
} from "@hiredesq/shared";

// No workspaceId field — it comes from the authenticated route param, never the
// body (CLAUDE.md §1). Money inputs (amount/salary/percent) are decimal STRINGS,
// never JS numbers (§3); a decimal regex keeps them parseable by the Money value
// object. The basis decides which of them are required (validated in the service).
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
// Percent allows up to 4 fractional digits (e.g. an 8.3333% of-salary fee).
const PERCENT_RE = /^\d+(\.\d{1,4})?$/;
const BASES: FeeBasis[] = ["flat", "percent_of_salary"];

export class CreatePlacementDto implements CreatePlacementInput {
  @IsString()
  candidateId!: string;

  @IsString()
  jobId!: string;

  @IsIn(BASES)
  basis!: FeeBasis;

  @IsString()
  @MaxLength(8)
  currency!: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE, { message: "amount must be a decimal money string" })
  amount?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE, { message: "salary must be a decimal money string" })
  salary?: string;

  @IsOptional()
  @IsString()
  @Matches(PERCENT_RE, { message: "percent must be a decimal string" })
  percent?: string;

  @IsOptional()
  @IsISO8601()
  placedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  guaranteeDays?: number;
}

// Record a fall-through. retainedAmount (optional, pro-rated refund retention) is a
// decimal money string, never a JS number (§3); the service bounds it to 0..fee.
export class FallThroughDto implements FallThroughInput {
  @IsOptional()
  @IsString()
  @Matches(MONEY_RE, { message: "retainedAmount must be a decimal money string" })
  retainedAmount?: string;
}

// Replace a fallen-through placement with a new candidate — no new fee.
export class ReplacePlacementDto implements ReplacePlacementInput {
  @IsString()
  candidateId!: string;

  @IsOptional()
  @IsISO8601()
  placedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  guaranteeDays?: number;
}

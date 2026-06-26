import { IsArray, IsBoolean, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { CreateJobInput, UpdateJobInput } from "@hiredesq/shared";
import { PaginationQuery } from "../../common/pagination.js";

// No workspaceId field — it comes from the authenticated route param, never the
// body (CLAUDE.md §1). expectedFee is a money STRING (a Decimal serialized
// losslessly), never a JS number (§3); a decimal regex keeps it parseable.
const MONEY_RE = /^\d+(\.\d{1,2})?$/;

// List query: server-side title/client search (the web no longer filters
// client-side, which can't page) + the inherited bounded page/limit (Batch B/C).
export class ListJobsQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateJobDto implements CreateJobInput {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  client?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE, { message: "expectedFee must be a decimal money string" })
  expectedFee?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  // Hard constraints for the deterministic qualification filter (F4, §2C). Each is
  // optional on create; the service defaults arrays to [] and the boolean to false.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredNationalities?: string[];

  @IsOptional()
  @IsBoolean()
  residenceTransferableRequired?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredLicenses?: string[];
}

export class UpdateJobDto implements UpdateJobInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  client?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  status?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY_RE, { message: "expectedFee must be a decimal money string" })
  expectedFee?: string | null;

  // Hard constraints for the deterministic qualification filter (F4, §2C).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredNationalities?: string[];

  @IsOptional()
  @IsBoolean()
  residenceTransferableRequired?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredLicenses?: string[];
}

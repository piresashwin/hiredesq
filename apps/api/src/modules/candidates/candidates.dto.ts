import {
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { AddNoteInput, UpdateCandidateInput } from "@hiredesq/shared";
import { PaginationQuery } from "../../common/pagination.js";

// No workspaceId field — it comes from the authenticated route param, never the
// body (CLAUDE.md §1). Extends PaginationQuery for the bounded `limit` (Batch B).
export class ListCandidatesQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  // "true" → semantic (meaning-based) search over candidate embeddings; otherwise
  // the default keyword/fuzzy (pg_trgm) search. Query params arrive as strings.
  @IsOptional()
  @IsBooleanString()
  semantic?: string;
}

// Fields a recruiter can correct in place. All optional (partial update). email
// and phone are nullable — clearing them is a valid edit.
export class UpdateCandidateDto implements UpdateCandidateInput {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  currentCompany?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  // Hard-constraint fields for the deterministic qualification filter (F4, §2C).
  // Not dedup keys, so no normalization. nationality clearable to null.
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nationality?: string | null;

  @IsOptional()
  @IsBoolean()
  residenceTransferable?: boolean | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  licenses?: string[];

  // Custom-field values keyed by CustomFieldDefinition.id. Each value is a string
  // (set) or null (clear). Shape + per-value validation against the workspace's
  // definitions happens in the service; here we only confirm it's an object.
  @IsOptional()
  @IsObject()
  customFields?: Record<string, string | null>;
}

// A free-form recruiter note on a candidate. No workspaceId/candidateId fields —
// they come from the authenticated route params, never the body (CLAUDE.md §1).
// `applicationId` (optional) scopes the note to one of the candidate's positions;
// omit it for a candidate-level note. The body is recruiter-authored free text
// (fine to store); we never log its contents (§2).
export class AddNoteDto implements AddNoteInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  applicationId?: string;
}

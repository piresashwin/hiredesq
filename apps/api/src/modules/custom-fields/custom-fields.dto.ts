import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";
import type {
  CreateCustomFieldInput,
  CustomFieldType,
  UpdateCustomFieldInput,
} from "@hiredesq/shared";

// The configurable value types. Kept in sync with CustomFieldType (shared) and the
// Prisma CustomFieldType enum.
const CUSTOM_FIELD_TYPES: CustomFieldType[] = ["text", "number", "date", "select", "boolean"];

// No workspaceId field — it comes from the authenticated route param, never the
// body (CLAUDE.md §1).
export class CreateCustomFieldDto implements CreateCustomFieldInput {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsIn(CUSTOM_FIELD_TYPES)
  type!: CustomFieldType;

  // Choices for a `select` field (required + non-empty for that type — enforced in
  // the service against `type`). Ignored for other types.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];
}

export class UpdateCustomFieldDto implements UpdateCustomFieldInput {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

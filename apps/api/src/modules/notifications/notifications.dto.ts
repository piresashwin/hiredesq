import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";
import type { ListNotificationsInput } from "@hiredesq/shared";
import { MAX_PAGE_SIZE } from "../../common/pagination.js";

// No workspaceId field — it comes from the authenticated route param, never the
// query/body (CLAUDE.md §1). Implements the shared ListNotificationsInput so a
// renamed/retyped field fails to compile on BOTH sides (one contract).
export class ListNotificationsQuery implements ListNotificationsInput {
  // Query params arrive as strings; @Type coerces for @IsInt/@Min/@Max.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  // `?unreadOnly=true` arrives as the string "true" — coerce explicitly (a bare
  // `Boolean("false")` is truthy, so never lean on @Type(() => Boolean) here).
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  unreadOnly?: boolean;
}

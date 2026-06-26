import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { DuplicateCountDto, DuplicateSuggestionDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../common/guards.js";
import { DuplicatesService } from "./duplicates.service.js";
import { ListDuplicatesQuery, ResolveDuplicateDto } from "./duplicates.dto.js";

// Dedup review (§5). Full guard stack; workspaceId from the route (§1).
@Controller("workspaces/:workspaceId/duplicates")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class DuplicatesController {
  constructor(private readonly duplicates: DuplicatesService) {}

  @Get()
  @RequirePermission("read", "candidate")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListDuplicatesQuery,
  ): Promise<DuplicateSuggestionDto[]> {
    return this.duplicates.list(workspaceId, query.status, query.limit);
  }

  // Lean count for the review badge — the button needs a number, not PII DTOs (§2).
  @Get("count")
  @RequirePermission("read", "candidate")
  async count(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListDuplicatesQuery,
  ): Promise<DuplicateCountDto> {
    return { count: await this.duplicates.count(workspaceId, query.status) };
  }

  // Merge/keep is a candidate write (confirm deletes the merged-away record).
  @Post(":id/resolve")
  @RequirePermission("write", "candidate")
  @HttpCode(204)
  async resolve(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: ResolveDuplicateDto,
  ): Promise<void> {
    await this.duplicates.resolve(workspaceId, id, dto.action);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { CandidateMatchDto, JobDto, Paginated } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { PaginationQuery } from "../../common/pagination.js";
import { JobsService } from "./jobs.service.js";
import { CreateJobDto, ListJobsQuery, UpdateJobDto } from "./jobs.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/jobs")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @RequirePermission("write", "job")
  create(@Param("workspaceId") workspaceId: string, @Body() dto: CreateJobDto): Promise<JobDto> {
    return this.jobs.create(workspaceId, dto);
  }

  @Get()
  @RequirePermission("read", "job")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListJobsQuery,
  ): Promise<Paginated<JobDto>> {
    return this.jobs.list(workspaceId, {
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(":id")
  @RequirePermission("read", "job")
  get(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<JobDto> {
    return this.jobs.getById(workspaceId, id);
  }

  // Embedding-matched candidate suggestions for this position (§5). Reads candidate
  // data, so it carries the candidate-read permission. workspaceId/id come from the
  // route params only, never the body (§1).
  @Get(":id/candidates/suggested")
  @RequirePermission("read", "candidate")
  suggested(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Query() pagination: PaginationQuery,
  ): Promise<CandidateMatchDto[]> {
    return this.jobs.suggestCandidates(workspaceId, id, pagination.limit);
  }

  @Patch(":id")
  @RequirePermission("write", "job")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: UpdateJobDto,
  ): Promise<JobDto> {
    return this.jobs.update(workspaceId, id, dto);
  }

  @Delete(":id")
  @RequirePermission("delete", "job")
  @HttpCode(204)
  async remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<void> {
    await this.jobs.remove(workspaceId, id);
  }
}

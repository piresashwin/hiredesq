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
import type { ApplicationDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { PaginationQuery } from "../../common/pagination.js";
import { ApplicationsService } from "./applications.service.js";
import { AttachCandidateDto, MoveStageDto } from "./applications.dto.js";

// Nested under the job; full guard stack on the class (CLAUDE.md §1). workspaceId
// and jobId both come from the route params, never the body.
@Controller("workspaces/:workspaceId/jobs/:jobId/applications")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @RequirePermission("read", "job")
  list(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Query() pagination: PaginationQuery,
  ): Promise<ApplicationDto[]> {
    return this.applications.list(workspaceId, jobId, pagination.limit);
  }

  @Post()
  @RequirePermission("write", "application")
  attach(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Body() dto: AttachCandidateDto,
  ): Promise<ApplicationDto> {
    return this.applications.attach(workspaceId, jobId, dto);
  }

  @Patch(":id")
  @RequirePermission("write", "application")
  moveStage(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Param("id") id: string,
    @Body() dto: MoveStageDto,
  ): Promise<ApplicationDto> {
    return this.applications.moveStage(workspaceId, jobId, id, dto);
  }

  @Delete(":id")
  @RequirePermission("delete", "application")
  @HttpCode(204)
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Param("id") id: string,
  ): Promise<void> {
    await this.applications.remove(workspaceId, jobId, id);
  }
}

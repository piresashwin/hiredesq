import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { ParseJobStatusDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { ParseJobsService } from "./parse-jobs.service.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/parse-jobs")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class ParseJobsController {
  constructor(private readonly parseJobs: ParseJobsService) {}

  @Get(":id")
  @RequirePermission("read", "candidate")
  get(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<ParseJobStatusDto> {
    return this.parseJobs.getById(workspaceId, id);
  }
}

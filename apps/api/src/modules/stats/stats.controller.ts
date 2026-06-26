import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { HomeOverviewDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { StatsService } from "./stats.service.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1). Read
// of aggregate account data — permissive for members like the other read endpoints.
@Controller("workspaces/:workspaceId/stats")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get("home")
  @RequirePermission("read", "stats")
  home(@Param("workspaceId") workspaceId: string): Promise<HomeOverviewDto> {
    return this.stats.home(workspaceId);
  }
}

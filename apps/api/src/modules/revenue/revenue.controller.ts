import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { RevenueSummaryDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { RevenueService } from "./revenue.service.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/revenue")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get("summary")
  @RequirePermission("read", "placement")
  summary(@Param("workspaceId") workspaceId: string): Promise<RevenueSummaryDto> {
    return this.revenue.summary(workspaceId);
  }
}

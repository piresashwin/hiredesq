import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { CreditBalanceDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { CreditsService } from "./credits.service.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/credits")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}

  @Get()
  @RequirePermission("read", "candidate")
  get(@Param("workspaceId") workspaceId: string): Promise<CreditBalanceDto> {
    return this.credits.getBalance(workspaceId);
  }
}

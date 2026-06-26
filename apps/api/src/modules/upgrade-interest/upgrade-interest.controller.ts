import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
  type AuthedRequest,
} from "../../common/guards.js";
import { UpgradeInterestService } from "./upgrade-interest.service.js";
import { UpgradeInterestDto } from "./upgrade-interest.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
// resource "billing" → PermissionsGuard forces owner-only (intended).
@Controller("workspaces/:workspaceId/upgrade-interest")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class UpgradeInterestController {
  constructor(private readonly upgradeInterest: UpgradeInterestService) {}

  @Post()
  @RequirePermission("write", "billing")
  @HttpCode(204)
  async register(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpgradeInterestDto,
  ): Promise<void> {
    // userId from the authenticated principal (set by AuthGuard), never the body.
    await this.upgradeInterest.register(workspaceId, req.user!.id, dto);
  }

  @Get()
  @RequirePermission("read", "billing")
  status(@Param("workspaceId") workspaceId: string): Promise<{ registered: boolean }> {
    return this.upgradeInterest.status(workspaceId);
  }
}

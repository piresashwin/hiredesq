import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { Paginated, PlacementDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { PaginationQuery } from "../../common/pagination.js";
import { PlacementsService } from "./placements.service.js";
import { CreatePlacementDto, FallThroughDto, ReplacePlacementDto } from "./placements.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/placements")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class PlacementsController {
  constructor(private readonly placements: PlacementsService) {}

  @Post()
  @RequirePermission("write", "placement")
  create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreatePlacementDto,
  ): Promise<PlacementDto> {
    return this.placements.create(workspaceId, dto);
  }

  @Get()
  @RequirePermission("read", "placement")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() pagination: PaginationQuery,
  ): Promise<Paginated<PlacementDto>> {
    return this.placements.list(workspaceId, { page: pagination.page, limit: pagination.limit });
  }

  @Get(":id")
  @RequirePermission("read", "placement")
  get(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<PlacementDto> {
    return this.placements.getById(workspaceId, id);
  }

  // Record a fall-through inside the guarantee window — reverses the fee (§2E).
  @Post(":id/fall-through")
  @RequirePermission("write", "placement")
  fallThrough(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: FallThroughDto,
  ): Promise<PlacementDto> {
    return this.placements.fallThrough(workspaceId, id, dto);
  }

  // Replace with a new candidate — no new fee; carries the original fee forward (§2E).
  @Post(":id/replace")
  @RequirePermission("write", "placement")
  replace(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: ReplacePlacementDto,
  ): Promise<PlacementDto> {
    return this.placements.replace(workspaceId, id, dto);
  }

  @Delete(":id")
  @RequirePermission("delete", "placement")
  @HttpCode(204)
  async remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<void> {
    await this.placements.remove(workspaceId, id);
  }
}

import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import type { ImportBatchDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../common/guards.js";
import { ImportBatchesService } from "./import-batches.service.js";

// Drives the bulk progress view. Full guard stack; workspaceId from the route (§1).
@Controller("workspaces/:workspaceId/import-batches")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class ImportBatchesController {
  constructor(private readonly batches: ImportBatchesService) {}

  @Get(":id")
  @RequirePermission("read", "candidate")
  get(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<ImportBatchDto> {
    return this.batches.getById(workspaceId, id);
  }
}

import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { IngestService } from "./ingest.service.js";
import { IngestDto } from "./ingest.dto.js";

@Controller("workspaces/:workspaceId/ingest")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  // Paste/upload → enqueue a parse. Writing a candidate requires write perms.
  @Post()
  @RequirePermission("write", "candidate")
  create(@Param("workspaceId") workspaceId: string, @Body() dto: IngestDto) {
    return this.ingest.ingest(workspaceId, dto);
  }
}

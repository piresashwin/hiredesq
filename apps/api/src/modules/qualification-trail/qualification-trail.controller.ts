import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { QualificationTrailEntryDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
  type AuthedRequest,
} from "../../common/guards.js";
import { QualificationTrailService } from "./qualification-trail.service.js";
import { AddTrailEntryDto } from "./qualification-trail.dto.js";

// Nested under the application; full guard stack on the class (CLAUDE.md §1).
// workspaceId, jobId and applicationId all come from the route params, never the
// body. The trail is FREE — no AI provider call, no credit gate (§4).
@Controller("workspaces/:workspaceId/jobs/:jobId/applications/:applicationId/trail")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class QualificationTrailController {
  constructor(private readonly trail: QualificationTrailService) {}

  @Get()
  @RequirePermission("read", "application")
  list(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Param("applicationId") applicationId: string,
  ): Promise<QualificationTrailEntryDto[]> {
    return this.trail.list(workspaceId, jobId, applicationId);
  }

  @Post()
  @RequirePermission("write", "application")
  add(
    @Param("workspaceId") workspaceId: string,
    @Param("jobId") jobId: string,
    @Param("applicationId") applicationId: string,
    @Req() req: AuthedRequest,
    @Body() dto: AddTrailEntryDto,
  ): Promise<QualificationTrailEntryDto> {
    // authorId from the authenticated principal (set by AuthGuard), never the body.
    // Nullable column, so null is a safe fallback if the principal is absent.
    return this.trail.addEntry(workspaceId, jobId, applicationId, dto, req.user?.id ?? null);
  }
}

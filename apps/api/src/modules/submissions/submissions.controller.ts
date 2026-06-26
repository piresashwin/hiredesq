import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Paginated, SharedSubmissionDto, SubmissionDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
  type AuthedRequest,
} from "../../common/guards.js";
import { SubmissionsService } from "./submissions.service.js";
import { GenerateSubmissionDto, ListSubmissionsQuery, RecordVerdictDto } from "./submissions.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/submissions")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Post()
  @RequirePermission("write", "submission")
  generate(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: GenerateSubmissionDto,
    @Req() req: AuthedRequest,
  ): Promise<SubmissionDto> {
    return this.submissions.generate(workspaceId, dto, req.user?.id ?? null);
  }

  // Record the client's verdict — closes the loop (§2D, F5).
  @Post(":id/verdict")
  @RequirePermission("write", "submission")
  recordVerdict(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: RecordVerdictDto,
    @Req() req: AuthedRequest,
  ): Promise<SubmissionDto> {
    return this.submissions.recordVerdict(workspaceId, id, dto.verdict, req.user?.id ?? null);
  }

  @Get()
  @RequirePermission("read", "submission")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListSubmissionsQuery,
  ): Promise<Paginated<SubmissionDto>> {
    return this.submissions.list(workspaceId, {
      candidateId: query.candidateId,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(":id")
  @RequirePermission("read", "submission")
  get(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<SubmissionDto> {
    return this.submissions.getById(workspaceId, id);
  }

  @Delete(":id")
  @RequirePermission("delete", "submission")
  @HttpCode(204)
  async remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<void> {
    await this.submissions.remove(workspaceId, id);
  }
}

/**
 * PUBLIC, UNGUARDED share endpoint. The unguessable share token IS the capability
 * (like a signed storage URL), so this is deliberately NOT mounted under
 * workspaces/:workspaceId and NOT behind the guard stack — the client opening the
 * link is not an authenticated user. It returns ONLY the masked, non-identifying
 * view (§1/§2: no ids, no workspace, no contact). This is the single intentional
 * exception to the §1 guard-stack rule; see SubmissionsService.getByToken.
 */
@Controller("shared/submissions")
export class SharedSubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get(":token")
  get(@Param("token") token: string): Promise<SharedSubmissionDto> {
    return this.submissions.getByToken(token);
  }
}

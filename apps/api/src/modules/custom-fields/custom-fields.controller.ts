import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { CustomFieldDefinitionDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../common/guards.js";
import { CustomFieldsService } from "./custom-fields.service.js";
import { CreateCustomFieldDto, UpdateCustomFieldDto } from "./custom-fields.dto.js";

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
// Reading definitions is part of reading candidates (any member needs them to
// render a profile). Configuring them is workspace administration — owner-only,
// which the resource "workspace" enforces in PermissionsGuard.
@Controller("workspaces/:workspaceId/custom-fields")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class CustomFieldsController {
  constructor(private readonly customFields: CustomFieldsService) {}

  @Get()
  @RequirePermission("read", "candidate")
  list(@Param("workspaceId") workspaceId: string): Promise<CustomFieldDefinitionDto[]> {
    return this.customFields.list(workspaceId);
  }

  @Post()
  @RequirePermission("write", "workspace")
  create(
    @Param("workspaceId") workspaceId: string,
    @Body() dto: CreateCustomFieldDto,
  ): Promise<CustomFieldDefinitionDto> {
    return this.customFields.create(workspaceId, dto);
  }

  @Patch(":id")
  @RequirePermission("write", "workspace")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCustomFieldDto,
  ): Promise<CustomFieldDefinitionDto> {
    return this.customFields.update(workspaceId, id, dto);
  }

  @Delete(":id")
  @RequirePermission("delete", "workspace")
  @HttpCode(204)
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<void> {
    await this.customFields.remove(workspaceId, id);
  }
}

import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CustomFieldDefinition } from "@hiredesq/database";
import type { CustomFieldDefinitionDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import type { CreateCustomFieldDto, UpdateCustomFieldDto } from "./custom-fields.dto.js";

// Workspace-configurable custom candidate fields (Settings → Candidate fields).
// Definitions are workspace config; the per-candidate values live on the candidate
// row (Candidate.customFields) and are written through CandidatesService. Every
// query is scoped by workspaceId — these rows are tenant data (CLAUDE.md §1).
@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string): Promise<CustomFieldDefinitionDto[]> {
    const rows = await this.prisma.customFieldDefinition.findMany({
      where: { workspaceId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(toDto);
  }

  async create(workspaceId: string, dto: CreateCustomFieldDto): Promise<CustomFieldDefinitionDto> {
    const options = normalizeOptions(dto.type === "select" ? dto.options : []);
    if (dto.type === "select" && options.length === 0) {
      throw new BadRequestException("a select field needs at least one option");
    }

    // Append after the current fields (max order + 1), scoped to the workspace.
    const last = await this.prisma.customFieldDefinition.findFirst({
      where: { workspaceId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    const order = (last?.order ?? -1) + 1;

    const row = await this.prisma.customFieldDefinition.create({
      data: { workspaceId, label: dto.label.trim(), type: dto.type, options, order },
    });
    this.logger.log(`create custom field ws=${workspaceId} id=${row.id} type=${row.type}`);
    return toDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    dto: UpdateCustomFieldDto,
  ): Promise<CustomFieldDefinitionDto> {
    // Confirm the definition is in this workspace before touching it (§1).
    const existing = await this.prisma.customFieldDefinition.findFirst({
      where: { id, workspaceId },
    });
    if (!existing) throw new NotFoundException("custom field not found");

    const data: { label?: string; options?: string[]; order?: number } = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.options !== undefined) {
      // Options only apply to select fields; reject editing them on other types so
      // the data stays coherent.
      if (existing.type !== "select") {
        throw new BadRequestException("only a select field has options");
      }
      const options = normalizeOptions(dto.options);
      if (options.length === 0) throw new BadRequestException("a select field needs at least one option");
      data.options = options;
    }

    // Scope the write by workspaceId too (updateMany), then re-read for the response.
    await this.prisma.customFieldDefinition.updateMany({ where: { id, workspaceId }, data });
    this.logger.log(`update custom field ws=${workspaceId} id=${id}`);
    const row = await this.prisma.customFieldDefinition.findFirstOrThrow({ where: { id, workspaceId } });
    return toDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.prisma.customFieldDefinition.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("custom field not found");
    // Tenant-scoped delete. Stored values keyed by this id on candidate rows become
    // orphans, which read-time filtering ignores — no candidate write needed.
    await this.prisma.customFieldDefinition.deleteMany({ where: { id, workspaceId } });
    this.logger.log(`delete custom field ws=${workspaceId} id=${id}`);
  }
}

// Trim, drop blanks, and de-duplicate (case-sensitive) the option list.
function normalizeOptions(options: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options ?? []) {
    const v = raw.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function toDto(row: CustomFieldDefinition): CustomFieldDefinitionDto {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    options: row.options,
    order: row.order,
  };
}

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { QualificationTrailEntryDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { toQualificationTrailEntryDto } from "./qualification-trail.mapper.js";
import type { AddTrailEntryDto } from "./qualification-trail.dto.js";

// The qualification trail records why a candidate was qualified/disqualified on a
// job (F4). It is FREE — pure CRUD, NO AI provider call, NO credit gate (§4). The
// note is recruiter-authored free text; we never log its contents (§2).
@Injectable()
export class QualificationTrailService {
  private readonly logger = new Logger(QualificationTrailService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Tenant + job + application scoped throughout (§1): every id is sourced from the
  // route, never the body.
  async list(
    workspaceId: string,
    jobId: string,
    applicationId: string,
  ): Promise<QualificationTrailEntryDto[]> {
    await this.assertApplicationInScope(workspaceId, jobId, applicationId);
    const rows = await this.prisma.qualificationTrailEntry.findMany({
      where: { workspaceId, applicationId },
      orderBy: { createdAt: "asc" },
    });
    this.logger.log(
      `list trail ws=${workspaceId} job=${jobId} app=${applicationId} count=${rows.length}`,
    ); // ids/counts only (§2)
    return rows.map(toQualificationTrailEntryDto);
  }

  async addEntry(
    workspaceId: string,
    jobId: string,
    applicationId: string,
    dto: AddTrailEntryDto,
    authorId: string | null,
  ): Promise<QualificationTrailEntryDto> {
    await this.assertApplicationInScope(workspaceId, jobId, applicationId);
    const row = await this.prisma.qualificationTrailEntry.create({
      data: {
        workspaceId,
        applicationId,
        kind: dto.kind ?? "note",
        note: dto.note,
        authorId,
      },
    });
    this.logger.log(
      `add trail ws=${workspaceId} job=${jobId} app=${applicationId} id=${row.id} kind=${row.kind}`,
    ); // ids/kind only, never the note (§2)
    return toQualificationTrailEntryDto(row);
  }

  // Verify the application is in this workspace AND on this job before reading or
  // writing its trail — never trust ids from the route to be in-tenant (§1).
  private async assertApplicationInScope(
    workspaceId: string,
    jobId: string,
    applicationId: string,
  ): Promise<void> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, workspaceId, jobId },
      select: { id: true },
    });
    if (!application) throw new NotFoundException("application not found");
  }
}

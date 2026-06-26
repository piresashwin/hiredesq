import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ApplicationDto } from "@hiredesq/shared";
import { Prisma } from "@hiredesq/database";
import { PrismaService } from "../../common/prisma.service.js";
import { pageTake } from "../../common/pagination.js";
import { toApplicationDto } from "./application.mapper.js";
import { checkConstraints, type JobConstraints } from "../jobs/constraints.js";
import type { AttachCandidateDto, MoveStageDto } from "./applications.dto.js";

// Only the non-PII candidate fields the board card needs (§2), plus the
// hard-constraint fields the deterministic qualification filter reads (F4, §2C).
const candidateSummarySelect = {
  id: true,
  fullName: true,
  currentTitle: true,
  currentCompany: true,
  nationality: true,
  residenceTransferable: true,
  licenses: true,
} as const;

// The job's three hard-constraint fields, loaded once per request (§2C).
const jobConstraintsSelect = {
  requiredNationalities: true,
  residenceTransferableRequired: true,
  requiredLicenses: true,
} as const;

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Tenant + job scoped throughout (§1): both workspaceId and jobId are in every
  // WHERE, sourced from the route, never the body.
  async list(workspaceId: string, jobId: string, limit?: number): Promise<ApplicationDto[]> {
    // Load the job's hard constraints once (also asserts it's in-tenant, §1/§2C).
    const constraints = await this.getJobConstraints(workspaceId, jobId);
    const rows = await this.prisma.application.findMany({
      where: { workspaceId, jobId },
      include: { candidate: { select: candidateSummarySelect } },
      orderBy: [{ stage: "asc" }, { updatedAt: "desc" }],
      take: pageTake({ limit }),
    });
    this.logger.log(`list applications ws=${workspaceId} job=${jobId} count=${rows.length}`); // ids/counts only (§2)
    // Deterministic qualification verdict per candidate — pure data, no AI (§2C/§4).
    return rows.map((row) => toApplicationDto(row, checkConstraints(constraints, row.candidate)));
  }

  async attach(workspaceId: string, jobId: string, dto: AttachCandidateDto): Promise<ApplicationDto> {
    // Verify BOTH the job and the candidate live in this workspace (§1) before
    // creating the link — never trust ids from the body to be in-tenant. Loading
    // the job also gives us its hard constraints for the qualification verdict (§2C).
    const constraints = await this.getJobConstraints(workspaceId, jobId);
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, workspaceId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException("candidate not found");

    // Idempotent on @@unique([workspaceId, candidateId, jobId]): if already
    // attached, return the existing application rather than 500-ing on the
    // unique violation.
    const existing = await this.prisma.application.findFirst({
      where: { workspaceId, jobId, candidateId: dto.candidateId },
      include: { candidate: { select: candidateSummarySelect } },
    });
    if (existing) {
      this.logger.log(`attach noop (exists) ws=${workspaceId} job=${jobId} app=${existing.id}`); // ids only (§2)
      return toApplicationDto(existing, checkConstraints(constraints, existing.candidate));
    }

    try {
      const row = await this.prisma.application.create({
        data: { workspaceId, jobId, candidateId: dto.candidateId, stage: "sourced" },
        include: { candidate: { select: candidateSummarySelect } },
      });
      this.logger.log(`attach candidate ws=${workspaceId} job=${jobId} app=${row.id}`); // ids only (§2)
      return toApplicationDto(row, checkConstraints(constraints, row.candidate));
    } catch (err) {
      // Concurrent double-attach can lose the find/create race on the
      // @@unique([workspaceId, candidateId, jobId]); treat P2002 as the same
      // idempotent no-op and return the row the other request created.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const raced = await this.prisma.application.findFirst({
          where: { workspaceId, jobId, candidateId: dto.candidateId },
          include: { candidate: { select: candidateSummarySelect } },
        });
        if (raced) return toApplicationDto(raced, checkConstraints(constraints, raced.candidate));
      }
      throw err;
    }
  }

  async moveStage(
    workspaceId: string,
    jobId: string,
    id: string,
    dto: MoveStageDto,
  ): Promise<ApplicationDto> {
    // Confirm the application is in this workspace AND job before touching it (§1).
    const existing = await this.prisma.application.findFirst({
      where: { id, workspaceId, jobId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("application not found");

    // Moving to "placed" does NOT create a Placement here — that's the Phase 4
    // revenue flow; we only set the stage.
    await this.prisma.application.updateMany({ where: { id, workspaceId, jobId }, data: { stage: dto.stage } });
    this.logger.log(`move stage ws=${workspaceId} job=${jobId} app=${id} stage=${dto.stage}`); // ids only (§2)

    const constraints = await this.getJobConstraints(workspaceId, jobId);
    const row = await this.prisma.application.findFirst({
      where: { id, workspaceId, jobId },
      include: { candidate: { select: candidateSummarySelect } },
    });
    if (!row) throw new NotFoundException("application not found");
    return toApplicationDto(row, checkConstraints(constraints, row.candidate));
  }

  async remove(workspaceId: string, jobId: string, id: string): Promise<void> {
    const existing = await this.prisma.application.findFirst({
      where: { id, workspaceId, jobId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("application not found");

    // Tenant + job scoped detach.
    await this.prisma.application.deleteMany({ where: { id, workspaceId, jobId } });
    this.logger.log(`detach application ws=${workspaceId} job=${jobId} app=${id}`); // ids only (§2)
  }

  // Loads the job's hard constraints AND asserts it's in this workspace (§1). The
  // selected fields are non-default-safe via schema defaults (F4, §2C).
  private async getJobConstraints(workspaceId: string, jobId: string): Promise<JobConstraints> {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, workspaceId },
      select: jobConstraintsSelect,
    });
    if (!job) throw new NotFoundException("job not found");
    return job;
  }
}

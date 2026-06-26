import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ParseJobStatusDto, ParseJobStatus } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";

@Injectable()
export class ParseJobsService {
  private readonly logger = new Logger(ParseJobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getById(workspaceId: string, id: string): Promise<ParseJobStatusDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1).
    const job = await this.prisma.parseJob.findFirst({
      where: { id, workspaceId },
      select: { id: true, status: true, error: true, candidateId: true },
    });
    if (!job) throw new NotFoundException("parse job not found");
    this.logger.log(`parse-job status ws=${workspaceId} id=${id} status=${job.status}`); // ids only (§2)
    return {
      id: job.id,
      status: job.status as ParseJobStatus,
      error: job.error,
      candidateId: job.candidateId,
    };
  }
}

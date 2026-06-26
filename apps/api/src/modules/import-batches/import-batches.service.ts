import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ImportBatchDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";

@Injectable()
export class ImportBatchesService {
  private readonly logger = new Logger(ImportBatchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getById(workspaceId: string, id: string): Promise<ImportBatchDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1). Join the target job
    // (F7) for the progress label ("12 CVs for Senior Nurse — Kuwait").
    const batch = await this.prisma.importBatch.findFirst({
      where: { id, workspaceId },
      include: { job: { select: { title: true } } },
    });
    if (!batch) throw new NotFoundException("import batch not found");
    this.logger.log(`import-batch ws=${workspaceId} id=${id} status=${batch.status}`); // ids only (§2)
    return {
      id: batch.id,
      source: batch.source,
      status: batch.status,
      total: batch.total,
      done: batch.done,
      failed: batch.failed,
      duplicates: batch.duplicates,
      createdAt: batch.createdAt.toISOString(),
      updatedAt: batch.updatedAt.toISOString(),
      jobId: batch.jobId,
      jobTitle: batch.job?.title ?? null,
    };
  }
}

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ImportBatchDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";

@Injectable()
export class ImportBatchesService {
  private readonly logger = new Logger(ImportBatchesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActive(workspaceId: string): Promise<ImportBatchDto[]> {
    const batches = await this.prisma.importBatch.findMany({
      where: { workspaceId, status: "processing" },
      include: { job: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return batches.map((b) => ({
      id: b.id,
      source: b.source,
      status: b.status,
      total: b.total,
      done: b.done,
      failed: b.failed,
      duplicates: b.duplicates,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      jobId: b.jobId,
      jobTitle: b.job?.title ?? null,
    }));
  }

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

import type { Job } from "@hiredesq/database";
import type { JobDto, PipelineStage } from "@hiredesq/shared";

// Single mapper from a Prisma Job row (+ computed pipeline aggregates) to the API
// DTO. expectedFee/pipelineValue are Decimal serialized as strings, never floats
// (CLAUDE.md §3).
export function toJobDto(
  job: Job,
  stageCounts: Partial<Record<PipelineStage, number>>,
  pipelineValue: string,
): JobDto {
  return {
    id: job.id,
    title: job.title,
    client: job.client,
    status: job.status,
    description: job.description,
    createdAt: job.createdAt.toISOString(),
    expectedFee: job.expectedFee === null ? null : job.expectedFee.toString(),
    currency: job.currency,
    // Hard constraints (F4, §2C) — always present on the row via schema defaults.
    requiredNationalities: job.requiredNationalities,
    residenceTransferableRequired: job.residenceTransferableRequired,
    requiredLicenses: job.requiredLicenses,
    stageCounts,
    pipelineValue,
  };
}

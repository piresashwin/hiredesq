import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CandidateMatchDto, JobDto, Paginated, PipelineStage } from "@hiredesq/shared";
import { embedText, jobEmbeddingText, toVectorLiteral } from "@hiredesq/ai";
import { PrismaService } from "../../common/prisma.service.js";
import { buildPage, pageSkip, pageTake } from "../../common/pagination.js";
import { candidateListSelect } from "../candidates/candidate.mapper.js";
import { toJobDto } from "./job.mapper.js";
import { buildMatches, type MatchCandidateRow } from "./match.js";
import { computePipelineValue } from "./pipeline-value.js";
import type { CreateJobDto, UpdateJobDto } from "./jobs.dto.js";

// "Best of cosine, relevant only" (user decision): a candidate must be within this
// cosine DISTANCE of the job to be suggested at all — so a weak match never pads the
// list to `limit`. pgvector `<=>` is cosine distance (1 - similarity); 0.55 ≈ 0.45
// similarity. Env-tunable; CALIBRATE against observed Voyage scores before relying on it.
const JOB_MATCH_MAX_DISTANCE = Number(process.env.JOB_MATCH_MAX_DISTANCE ?? "0.55");
// Recall a wider pool than `limit` so the constraint-aware re-ordering (qualified
// first) has room to work, capped so a huge pool can't blow up the hydrate.
const MATCH_POOL_CAP = 100;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // workspaceId is always the first argument; every query filters by it (§1).
  async create(workspaceId: string, dto: CreateJobDto): Promise<JobDto> {
    const job = await this.prisma.job.create({
      data: {
        workspaceId,
        title: dto.title,
        client: dto.client ?? null,
        description: dto.description ?? null,
        // Decimal column — Prisma accepts the validated money string (§3).
        expectedFee: dto.expectedFee ?? null,
        currency: dto.currency ?? "USD",
        status: "open",
        // Hard constraints (F4, §2C) — default to empty/false when omitted.
        requiredNationalities: dto.requiredNationalities ?? [],
        residenceTransferableRequired: dto.residenceTransferableRequired ?? false,
        requiredLicenses: dto.requiredLicenses ?? [],
      },
    });
    this.logger.log(`create job ws=${workspaceId} id=${job.id}`); // ids only (§2)
    // Semantic-match embedding (§5) — best-effort, AFTER the row exists (network call
    // to Voyage). A missing/slow embedder must NOT fail job creation; it backfills
    // lazily on the first suggest. Same posture as candidate embedding at ingest.
    await this.embedJobBestEffort(workspaceId, job.id, job);
    // A brand-new job has no applications yet.
    return toJobDto(job, {}, computePipelineValue(job.expectedFee, {}, job.currency));
  }

  // Server-side search + offset pagination. Search is required here (the web used
  // to filter client-side, which can't coexist with pagination — only the current
  // page would ever be filtered). The `count` uses the SAME where as `findMany` so
  // the total reflects the filtered set, workspace-scoped throughout (§1).
  async list(
    workspaceId: string,
    opts: { search?: string; page?: number; limit?: number } = {},
  ): Promise<Paginated<JobDto>> {
    const { search, page, limit } = opts;
    const term = search?.trim();
    const where = {
      workspaceId,
      ...(term
        ? {
            OR: [
              { title: { contains: term, mode: "insensitive" as const } },
              { client: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip({ page, limit }),
        take: pageTake({ limit }),
      }),
      this.prisma.job.count({ where }),
    ]);
    this.logger.log(`list jobs ws=${workspaceId} page=${page ?? 1} count=${jobs.length}`); // ids/counts only (§2)

    const countsByJob = await this.stageCountsByJob(
      workspaceId,
      jobs.map((j) => j.id),
    );

    const items = jobs.map((job) => {
      const stageCounts = countsByJob.get(job.id) ?? {};
      return toJobDto(job, stageCounts, computePipelineValue(job.expectedFee, stageCounts, job.currency));
    });
    return buildPage(items, total, { page, limit });
  }

  async getById(workspaceId: string, id: string): Promise<JobDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1).
    const job = await this.prisma.job.findFirst({ where: { id, workspaceId } });
    if (!job) throw new NotFoundException("job not found");

    const countsByJob = await this.stageCountsByJob(workspaceId, [id]);
    const stageCounts = countsByJob.get(id) ?? {};
    return toJobDto(job, stageCounts, computePipelineValue(job.expectedFee, stageCounts, job.currency));
  }

  async update(workspaceId: string, id: string, dto: UpdateJobDto): Promise<JobDto> {
    // Confirm the job is in this workspace before touching it (§1).
    const existing = await this.prisma.job.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new NotFoundException("job not found");

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.client !== undefined) data.client = dto.client;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.expectedFee !== undefined) data.expectedFee = dto.expectedFee; // money string → Decimal (§3)
    // Hard constraints (F4, §2C) — persist when supplied.
    if (dto.requiredNationalities !== undefined) data.requiredNationalities = dto.requiredNationalities;
    if (dto.residenceTransferableRequired !== undefined)
      data.residenceTransferableRequired = dto.residenceTransferableRequired;
    if (dto.requiredLicenses !== undefined) data.requiredLicenses = dto.requiredLicenses;

    // Scope the write by workspaceId too — updateMany so the predicate is in the
    // WHERE, then re-read for the response.
    await this.prisma.job.updateMany({ where: { id, workspaceId }, data });
    this.logger.log(`update job ws=${workspaceId} id=${id}`); // ids only (§2)

    // Re-embed when any field that feeds jobEmbeddingText changed (title / description
    // / hard constraints) — best-effort, never fails the update. Status/fee/client
    // don't affect the match vector, so they skip the Voyage call.
    const matchFieldsChanged =
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.requiredNationalities !== undefined ||
      dto.residenceTransferableRequired !== undefined ||
      dto.requiredLicenses !== undefined;
    if (matchFieldsChanged) {
      const fresh = await this.prisma.job.findFirst({ where: { id, workspaceId } });
      if (fresh) await this.embedJobBestEffort(workspaceId, id, fresh);
    }

    return this.getById(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.prisma.job.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new NotFoundException("job not found");

    // Tenant-scoped hard delete. Cascades applications + placements per schema.
    await this.prisma.job.deleteMany({ where: { id, workspaceId } });
    this.logger.log(`delete job ws=${workspaceId} id=${id}`); // ids only (§2)
  }

  /**
   * Application counts per stage, per job, for the given job ids — tenant-scoped.
   * Returns a map jobId → { stage: count }. Jobs with no applications are absent
   * from the map (the caller defaults to {}).
   */
  private async stageCountsByJob(
    workspaceId: string,
    jobIds: string[],
  ): Promise<Map<string, Partial<Record<PipelineStage, number>>>> {
    const byJob = new Map<string, Partial<Record<PipelineStage, number>>>();
    if (jobIds.length === 0) return byJob;

    const grouped = await this.prisma.application.groupBy({
      by: ["jobId", "stage"],
      where: { workspaceId, jobId: { in: jobIds } },
      _count: { _all: true },
    });

    for (const g of grouped) {
      const counts = byJob.get(g.jobId) ?? {};
      counts[g.stage as PipelineStage] = g._count._all;
      byJob.set(g.jobId, counts);
    }
    return byJob;
  }

  /**
   * Suggest the pool's nearest-matching candidates for a job (§5). The algorithm
   * (user decision — "best of cosine, relevant only"):
   *   1. ANN recall over pgvector with a max-DISTANCE gate, so only genuinely relevant
   *      candidates surface (never padded to `limit`).
   *   2. Deterministic constraint check per candidate (reuse checkConstraints — NO AI).
   *   3. Constraint-aware ordering: qualified (no hard fail) first, near-misses demoted
   *      but NOT hidden; similarity desc within each group; truncate to `limit`.
   * Returns [] (not an error) when the job can't be embedded — search/match is an
   * enhancement, mirroring semanticSearch's graceful fallback. Tenant-scoped throughout (§1).
   */
  async suggestCandidates(
    workspaceId: string,
    jobId: string,
    limit?: number,
  ): Promise<CandidateMatchDto[]> {
    const take = pageTake({ limit });
    // Tenant-scoped lookup — never `where: { id }` alone (§1). Needed for the
    // constraint check and as the lazy-embed source.
    const job = await this.prisma.job.findFirst({ where: { id: jobId, workspaceId } });
    if (!job) throw new NotFoundException("job not found");

    const literal = await this.jobVectorLiteral(workspaceId, job);
    if (!literal) {
      this.logger.warn(`suggest: job embedding unavailable ws=${workspaceId} job=${jobId}`);
      return [];
    }

    // 1. ANN recall + relevance gate. Explicit workspace_id predicate on raw SQL (§1);
    //    parameterized via the tagged template. Recall a wider pool than `take` so the
    //    constraint re-ordering has room, capped so the hydrate stays bounded.
    const pool = Math.min(Math.max(take * 3, take), MATCH_POOL_CAP);
    const ranked = await this.prisma.$queryRaw<Array<{ id: string; distance: number }>>`
      SELECT "id", ("embedding" <=> ${literal}::vector) AS distance
      FROM "candidate"
      WHERE "workspace_id" = ${workspaceId}
        AND "embedding" IS NOT NULL
        AND ("embedding" <=> ${literal}::vector) <= ${JOB_MATCH_MAX_DISTANCE}
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${pool}
    `;
    if (ranked.length === 0) return [];

    // Hydrate the relevant ids: list-lean projection (§2 — no contact PII) PLUS the
    // constraint fields the deterministic check needs. Tenant-scoped re-read (§1).
    const ids = ranked.map((r) => r.id);
    const rows = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, workspaceId },
      select: { ...candidateListSelect, nationality: true, residenceTransferable: true, licenses: true },
    });
    const byId = new Map<string, MatchCandidateRow>(rows.map((r) => [r.id, r]));

    // 2 + 3. Constraint-aware ordering (pure, testable — see match.ts): qualified
    // first, near-misses demoted, similarity desc within each group, truncate to take.
    const matches = buildMatches(
      {
        requiredNationalities: job.requiredNationalities,
        residenceTransferableRequired: job.residenceTransferableRequired,
        requiredLicenses: job.requiredLicenses,
      },
      ranked,
      byId,
      take,
    );
    this.logger.log(`suggest ws=${workspaceId} job=${jobId} matched=${matches.length}`); // ids/counts only (§2)
    return matches;
  }

  /**
   * Resolve the job's match vector as a pgvector literal. Uses the stored embedding
   * when present (no recompute per suggest); otherwise embeds on demand, persists it
   * best-effort, and returns the fresh literal. Returns null if the embedder is
   * unavailable so the caller degrades gracefully. Tenant-scoped (§1).
   */
  private async jobVectorLiteral(
    workspaceId: string,
    job: { id: string; title: string; description: string | null; requiredNationalities: string[]; residenceTransferableRequired: boolean; requiredLicenses: string[] },
  ): Promise<string | null> {
    const stored = await this.prisma.$queryRaw<Array<{ embedding: string | null }>>`
      SELECT "embedding"::text AS embedding
      FROM "job"
      WHERE "id" = ${job.id} AND "workspace_id" = ${workspaceId}
    `;
    const existing = stored[0]?.embedding;
    if (existing) return existing;

    // Lazy backfill (pre-existing jobs, or a write-time embedder outage).
    try {
      const vector = await embedText(jobEmbeddingText(job));
      await this.writeJobEmbedding(workspaceId, job.id, vector);
      return toVectorLiteral(vector);
    } catch (err) {
      this.logger.warn(
        `job embed skipped ws=${workspaceId} job=${job.id} err=${err instanceof Error ? err.name : "unknown"}`,
      ); // ids only — never the vector or PII (§2)
      return null;
    }
  }

  /**
   * Generate + store ONE job's embedding, swallowing any error (§5) — best-effort,
   * never fails the create/update path. Logs ids only — never the vector (§2).
   */
  private async embedJobBestEffort(
    workspaceId: string,
    jobId: string,
    job: { title: string; description: string | null; requiredNationalities: string[]; residenceTransferableRequired: boolean; requiredLicenses: string[] },
  ): Promise<void> {
    try {
      await this.writeJobEmbedding(workspaceId, jobId, await embedText(jobEmbeddingText(job)));
    } catch (err) {
      this.logger.warn(
        `job embed skipped ws=${workspaceId} job=${jobId} err=${err instanceof Error ? err.name : "unknown"}`,
      );
    }
  }

  /** Write one job's embedding via $executeRaw (Prisma has no vector type),
   * workspace-scoped (§1). Never logs the vector. */
  private async writeJobEmbedding(
    workspaceId: string,
    jobId: string,
    vector: number[],
  ): Promise<void> {
    const literal = toVectorLiteral(vector);
    await this.prisma.$executeRaw`
      UPDATE "job" SET "embedding" = ${literal}::vector
      WHERE "id" = ${jobId} AND "workspace_id" = ${workspaceId}
    `;
  }
}

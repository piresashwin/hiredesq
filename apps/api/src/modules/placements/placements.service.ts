import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Paginated, PlacementDto } from "@hiredesq/shared";
import { Prisma } from "@hiredesq/database";
import { Money } from "@hiredesq/core";
import { PrismaService } from "../../common/prisma.service.js";
import { buildPage, pageSkip, pageTake } from "../../common/pagination.js";
import { toPlacementDto } from "./placement.mapper.js";
import { computeClearsAt } from "./guarantee.js";
import { FeeResolutionError, resolveFee } from "./fee-resolution.js";
import type { CreatePlacementDto, FallThroughDto, ReplacePlacementDto } from "./placements.dto.js";

// Default guarantee window when the caller doesn't specify one (§2E).
const DEFAULT_GUARANTEE_DAYS = 30;

// Only the non-PII candidate fields the revenue placements table needs (§2).
const candidateSummarySelect = {
  id: true,
  fullName: true,
  currentTitle: true,
  currentCompany: true,
} as const;

// The candidate summary + job title joined onto every placement returned.
const placementInclude = {
  candidate: { select: candidateSummarySelect },
  job: { select: { title: true } },
} as const;

@Injectable()
export class PlacementsService {
  private readonly logger = new Logger(PlacementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // workspaceId is always the first argument; every query filters by it (§1).
  async create(workspaceId: string, dto: CreatePlacementDto): Promise<PlacementDto> {
    // Verify BOTH the candidate and the job live in this workspace (§1) before
    // creating anything — never trust ids from the body to be in-tenant.
    const [candidate, job] = await Promise.all([
      this.prisma.candidate.findFirst({ where: { id: dto.candidateId, workspaceId }, select: { id: true } }),
      this.prisma.job.findFirst({ where: { id: dto.jobId, workspaceId }, select: { id: true } }),
    ]);
    if (!candidate) throw new NotFoundException("candidate not found");
    if (!job) throw new NotFoundException("job not found");

    // Resolve the fee to a Decimal money string via the Money value object (§3).
    let feeAmount: string;
    try {
      feeAmount = resolveFee(dto);
    } catch (err) {
      if (err instanceof FeeResolutionError) throw new BadRequestException(err.message);
      throw err;
    }

    const placedAt = dto.placedAt ? new Date(dto.placedAt) : new Date();
    // A fresh placement is `at_risk` until its guarantee window clears (§2E).
    const guaranteeDays = dto.guaranteeDays ?? DEFAULT_GUARANTEE_DAYS;
    const clearsAt = computeClearsAt(placedAt, guaranteeDays);

    // One transaction: create the Placement AND move the matching Application to
    // `placed`. Placing a candidate implies they're placed on that job, so this
    // closes the Phase 3 drag-to-Placed seam — if no application exists yet, we
    // create one already in `placed`.
    const placement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.placement.create({
        data: {
          workspaceId,
          candidateId: dto.candidateId,
          jobId: dto.jobId,
          feeAmount, // resolved Decimal string → Decimal(14,2) (§3)
          currency: dto.currency,
          placedAt,
          guaranteeDays,
          clearsAt,
        },
        include: placementInclude,
      });

      // Upsert the application to `placed`, tenant + (candidate, job) scoped (§1).
      const moved = await tx.application.updateMany({
        where: { workspaceId, candidateId: dto.candidateId, jobId: dto.jobId },
        data: { stage: "placed" },
      });
      if (moved.count === 0) {
        await tx.application.create({
          data: { workspaceId, candidateId: dto.candidateId, jobId: dto.jobId, stage: "placed" },
        });
      }

      return created;
    });

    this.logger.log(`create placement ws=${workspaceId} id=${placement.id} job=${dto.jobId}`); // ids only (§2)
    return toPlacementDto(placement);
  }

  /**
   * Record a fall-through inside the guarantee window — reverse the fee (§2E/§3).
   * Optional pro-rated `retainedAmount` (0..fee) is kept as earned; omitted = full
   * reversal. All arithmetic through Money, never float. Tenant-scoped (§1); a
   * placement already reversed/replaced can't fall through again.
   */
  async fallThrough(workspaceId: string, id: string, dto: FallThroughDto): Promise<PlacementDto> {
    const placement = await this.prisma.placement.findFirst({
      where: { id, workspaceId },
      select: { id: true, feeAmount: true, currency: true, status: true },
    });
    if (!placement) throw new NotFoundException("placement not found");
    // The status read here is advisory only — the real guard is the conditional
    // updateMany below. An early throw gives the caller a clean error in the common
    // (uncontended) case; the WHERE-clause guard closes the concurrent double-reversal.
    if (placement.status === "fell_through" || placement.status === "replaced") {
      throw new BadRequestException("placement is already reversed");
    }

    // Validate retained 0..fee via Money (§3). Default (omitted) = full reversal.
    let retained = Money.zero(placement.currency);
    if (dto.retainedAmount !== undefined) {
      retained = Money.of(dto.retainedAmount, placement.currency);
      const fee = Money.of(placement.feeAmount.toString(), placement.currency);
      if (retained.isNegative() || fee.subtract(retained).isNegative()) {
        throw new BadRequestException("retainedAmount must be between 0 and the fee");
      }
    }
    const retainedAmount = new Prisma.Decimal(retained.round().toString()).toFixed(2);

    // Guard the status transition IN the WHERE so two concurrent fall-throughs can't
    // both reverse the fee (§3) — only the first matches a still-live placement; the
    // loser updates zero rows. updateMany keeps the workspaceId predicate (§1).
    const reversed = await this.prisma.placement.updateMany({
      where: { id, workspaceId, status: { notIn: ["fell_through", "replaced"] } },
      data: { status: "fell_through", retainedAmount },
    });
    if (reversed.count === 0) throw new BadRequestException("placement is already reversed");
    this.logger.log(`placement fell_through ws=${workspaceId} id=${id}`); // ids only (§2)
    return this.getById(workspaceId, id);
  }

  /**
   * Replace a placement with a new candidate — NO new fee (§2E). The replacement
   * CARRIES the original fee forward and starts a fresh guarantee window; the
   * original flips to `replaced`, so the chain's fee is recognized exactly once
   * (on the live replacement). The new candidate's application on the same job is
   * moved to `placed`. One transaction, fully tenant-scoped (§1).
   */
  async replace(workspaceId: string, id: string, dto: ReplacePlacementDto): Promise<PlacementDto> {
    const original = await this.prisma.placement.findFirst({
      where: { id, workspaceId },
      select: { id: true, jobId: true, feeAmount: true, currency: true, guaranteeDays: true, status: true },
    });
    if (!original) throw new NotFoundException("placement not found");
    if (original.status === "replaced") throw new BadRequestException("placement is already replaced");

    // Verify the replacement candidate is in this workspace (§1) — never trust the body.
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, workspaceId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException("candidate not found");

    const placedAt = dto.placedAt ? new Date(dto.placedAt) : new Date();
    const guaranteeDays = dto.guaranteeDays ?? original.guaranteeDays;
    const clearsAt = computeClearsAt(placedAt, guaranteeDays);

    const replacement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.placement.create({
        data: {
          workspaceId,
          candidateId: dto.candidateId,
          jobId: original.jobId,
          feeAmount: original.feeAmount, // CARRY the original fee — no new charge (§2E/§3)
          currency: original.currency,
          placedAt,
          guaranteeDays,
          clearsAt,
          replacesPlacementId: original.id,
        },
        include: placementInclude,
      });
      // The original is superseded — its fee now rides on the replacement. Guard the
      // flip on status IN the WHERE so two concurrent replacements can't both create a
      // carry-forward placement off the same original (which would recognize the fee
      // twice, §2E/§3); the loser flips zero rows and aborts the whole transaction.
      const superseded = await tx.placement.updateMany({
        where: { id: original.id, workspaceId, status: { not: "replaced" } },
        data: { status: "replaced" },
      });
      if (superseded.count === 0) throw new BadRequestException("placement is already replaced");
      // The replacement candidate is placed on the same job (tenant + keys scoped, §1).
      const moved = await tx.application.updateMany({
        where: { workspaceId, candidateId: dto.candidateId, jobId: original.jobId },
        data: { stage: "placed" },
      });
      if (moved.count === 0) {
        await tx.application.create({
          data: { workspaceId, candidateId: dto.candidateId, jobId: original.jobId, stage: "placed" },
        });
      }
      return created;
    });

    this.logger.log(`placement replaced ws=${workspaceId} orig=${id} new=${replacement.id}`); // ids only (§2)
    return toPlacementDto(replacement);
  }

  async list(
    workspaceId: string,
    opts: { page?: number; limit?: number } = {},
  ): Promise<Paginated<PlacementDto>> {
    const { page, limit } = opts;
    const where = { workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.placement.findMany({
        where,
        include: placementInclude,
        orderBy: { placedAt: "desc" },
        skip: pageSkip({ page, limit }),
        take: pageTake({ limit }),
      }),
      this.prisma.placement.count({ where }),
    ]);
    this.logger.log(`list placements ws=${workspaceId} page=${page ?? 1} count=${rows.length}`); // ids/counts only (§2)
    const now = new Date();
    return buildPage(
      rows.map((r) => toPlacementDto(r, now)),
      total,
      { page, limit },
    );
  }

  async getById(workspaceId: string, id: string): Promise<PlacementDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1).
    const row = await this.prisma.placement.findFirst({
      where: { id, workspaceId },
      include: placementInclude,
    });
    if (!row) throw new NotFoundException("placement not found");
    return toPlacementDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.prisma.placement.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new NotFoundException("placement not found");

    // Tenant-scoped hard delete — how a mis-logged placement is undone. The
    // application's stage is left as-is (the recruiter re-stages it manually).
    await this.prisma.placement.deleteMany({ where: { id, workspaceId } });
    this.logger.log(`delete placement ws=${workspaceId} id=${id}`); // ids only (§2)
  }
}

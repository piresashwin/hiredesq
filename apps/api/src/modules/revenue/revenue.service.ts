import { Injectable, Logger } from "@nestjs/common";
import type { PipelineStage, RevenueSummaryDto } from "@hiredesq/shared";
import { Prisma } from "@hiredesq/database";
import { Money } from "@hiredesq/core";
import { PrismaService } from "../../common/prisma.service.js";
import { computePipelineValue } from "../jobs/pipeline-value.js";
import { monthlyTrend, recognition } from "./revenue-summary.js";

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Every query is workspace-scoped (§1). All money math goes through Money so
  // the hero number reconciles EXACTLY with the placement rows (§3).
  async summary(workspaceId: string): Promise<RevenueSummaryDto> {
    const now = new Date();

    // The placement rows the booked/avg/trend numbers are derived from — fetch
    // only the fields the summary needs (no PII).
    const placements = await this.prisma.placement.findMany({
      where: { workspaceId },
      select: {
        feeAmount: true,
        placedAt: true,
        currency: true,
        status: true,
        clearsAt: true,
        retainedAmount: true,
      },
      orderBy: { placedAt: "desc" },
    });

    // v1 assumes a single workspace currency: use the currency of the most recent
    // placement, falling back to "USD" when there are none. Multi-currency
    // aggregation is out of scope for v1.
    const currency = placements[0]?.currency ?? "USD";

    // Guarantee-aware recognition: cleared (earned) vs at-risk (§2E/§3).
    const rec = recognition(placements, currency, now);
    const trend = monthlyTrend(placements, currency, now);

    const pipelineValue = await this.computeWorkspacePipelineValue(workspaceId, currency);

    this.logger.log(
      `revenue summary ws=${workspaceId} placements=${placements.length} thisMonth=${rec.placementsThisMonth}`,
    ); // ids/counts only (§2)

    return {
      currency,
      revenueCleared: rec.revenueCleared,
      revenueAtRisk: rec.revenueAtRisk,
      placementsThisMonth: rec.placementsThisMonth,
      pipelineValue,
      avgFee: rec.avgFee,
      monthlyTrend: trend,
    };
  }

  /**
   * Weighted pipeline value across ALL the workspace's jobs' in-flight
   * applications — the same per-job `computePipelineValue` the jobs board uses,
   * summed via Money so the dashboard total agrees exactly with the board (§3).
   */
  private async computeWorkspacePipelineValue(workspaceId: string, currency: string): Promise<string> {
    const jobs = await this.prisma.job.findMany({
      where: { workspaceId },
      select: { id: true, expectedFee: true, currency: true },
    });
    if (jobs.length === 0) return new Prisma.Decimal(0).toFixed(2);

    // In-flight application counts per job, per stage (placed/rejected excluded by
    // computePipelineValue's stage probabilities).
    const grouped = await this.prisma.application.groupBy({
      by: ["jobId", "stage"],
      where: { workspaceId },
      _count: { _all: true },
    });
    const countsByJob = new Map<string, Partial<Record<PipelineStage, number>>>();
    for (const g of grouped) {
      const counts = countsByJob.get(g.jobId) ?? {};
      counts[g.stage as PipelineStage] = g._count._all;
      countsByJob.set(g.jobId, counts);
    }

    let total = Money.zero(currency);
    for (const job of jobs) {
      const counts = countsByJob.get(job.id) ?? {};
      // Per-job value comes back as a money string; fold it into the Money total
      // in the workspace currency (single-currency v1 assumption).
      const perJob = computePipelineValue(job.expectedFee, counts, currency);
      total = total.add(Money.of(perJob, currency));
    }
    return new Prisma.Decimal(total.round().toString()).toFixed(2);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import type { HomeAttentionItemDto, HomeOverviewDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { recognition } from "../revenue/revenue-summary.js";
import { ATTENTION_PREVIEW_LIMIT, CLEARING_SOON_DAYS, clearingSoonWindow } from "./home-overview.js";

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The recruiter's account-at-a-glance home. EVERY query is workspace-scoped
   * (§1). The cleared-revenue headline reuses the SAME `recognition()` the revenue
   * dashboard does, so the two screens never disagree (§3). We fetch counts + a
   * small named preview per queue — never the whole list (§2).
   */
  async home(workspaceId: string): Promise<HomeOverviewDto> {
    const now = new Date();
    const window = clearingSoonWindow(now, CLEARING_SOON_DAYS);

    const [
      poolSize,
      jobsTotal,
      openJobs,
      duplicatesPending,
      placements,
      clearingCount,
      clearingPreview,
      awaitingCount,
      awaitingPreview,
    ] = await Promise.all([
      this.prisma.candidate.count({ where: { workspaceId } }),
      this.prisma.job.count({ where: { workspaceId } }),
      this.prisma.job.count({ where: { workspaceId, status: "open" } }),
      this.prisma.duplicateSuggestion.count({ where: { workspaceId, status: "pending" } }),
      // Same shape the revenue summary derives cleared/at-risk from (§3).
      this.prisma.placement.findMany({
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
      }),
      // At-risk placements whose guarantee window clears within the horizon.
      this.prisma.placement.count({
        where: { workspaceId, status: "at_risk", clearsAt: window },
      }),
      this.prisma.placement.findMany({
        where: { workspaceId, status: "at_risk", clearsAt: window },
        select: {
          id: true,
          candidateId: true,
          clearsAt: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
        orderBy: { clearsAt: "asc" },
        take: ATTENTION_PREVIEW_LIMIT,
      }),
      // Submissions still awaiting a client verdict (sent / viewed).
      this.prisma.submission.count({
        where: { workspaceId, status: { in: ["sent", "viewed"] } },
      }),
      this.prisma.submission.findMany({
        where: { workspaceId, status: { in: ["sent", "viewed"] } },
        select: {
          id: true,
          candidateId: true,
          createdAt: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: ATTENTION_PREVIEW_LIMIT,
      }),
    ]);

    const currency = placements[0]?.currency ?? "USD";
    const rec = recognition(placements, currency, now);

    const clearingItems: HomeAttentionItemDto[] = clearingPreview.map((p) => ({
      id: p.id,
      candidateId: p.candidateId,
      name: p.candidate.fullName,
      detail: p.job.title,
      when: p.clearsAt.toISOString(),
    }));

    const awaitingItems: HomeAttentionItemDto[] = awaitingPreview.map((s) => ({
      id: s.id,
      candidateId: s.candidateId,
      name: s.candidate.fullName,
      detail: s.job?.title ?? null,
      when: s.createdAt.toISOString(),
    }));

    this.logger.log(
      `home ws=${workspaceId} pool=${poolSize} jobs=${jobsTotal} clearing=${clearingCount} awaiting=${awaitingCount} dupes=${duplicatesPending}`,
    ); // ids/counts only (§2)

    return {
      currency,
      revenueCleared: rec.revenueCleared,
      poolSize,
      openJobs,
      hasAnyData: poolSize > 0 || jobsTotal > 0 || placements.length > 0,
      clearingSoon: { count: clearingCount, items: clearingItems },
      awaitingVerdict: { count: awaitingCount, items: awaitingItems },
      duplicatesPending,
    };
  }
}

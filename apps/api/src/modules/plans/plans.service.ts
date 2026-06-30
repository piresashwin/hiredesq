import { Injectable } from "@nestjs/common";
import type { PlanDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";

/**
 * Plans are global reference/config data — NOT tenant-scoped (no workspaceId).
 * Reads all Plan rows and serializes for the pricing/upgrade UI.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      orderBy: { priceMonthly: "asc" },
    });
    return rows.map((row) => ({
      tier: row.tier,
      name: row.name,
      // Decimal → string (CLAUDE.md §3: money is always a string at the API boundary).
      priceMonthly: row.priceMonthly.toString(),
      currency: row.currency,
      perSeat: row.perSeat,
      monthlySubmissionAllotment: row.monthlySubmissionAllotment,
      ingestFreeLimit: row.ingestFreeLimit,
      ingestPeriod: (row.ingestPeriod ?? null) as "lifetime" | "monthly" | null,
      seatLimit: row.seatLimit,
    }));
  }
}

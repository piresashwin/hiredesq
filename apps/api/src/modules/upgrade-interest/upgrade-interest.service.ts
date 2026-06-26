import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma.service.js";
import type { UpgradeInterestDto } from "./upgrade-interest.dto.js";

@Injectable()
export class UpgradeInterestService {
  private readonly logger = new Logger(UpgradeInterestService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record (or update) this workspace's standing upgrade interest — one row per
   * workspace (@@unique workspace_id), so a re-register just refreshes the note.
   * No payment (Stripe deferred); the founder follows up (MVP-SPEC §4/§6).
   */
  async register(workspaceId: string, userId: string, dto: UpgradeInterestDto): Promise<void> {
    await this.prisma.upgradeInterest.upsert({
      where: { workspaceId },
      create: { workspaceId, userId, note: dto.note },
      update: { userId, note: dto.note },
    });
    // Ids only — never the note's contents in logs (§2, defensive).
    this.logger.log(`upgrade-interest registered ws=${workspaceId} user=${userId}`);
  }

  async status(workspaceId: string): Promise<{ registered: boolean }> {
    const existing = await this.prisma.upgradeInterest.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    return { registered: existing !== null };
  }
}

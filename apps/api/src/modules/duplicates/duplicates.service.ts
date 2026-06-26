import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  CandidateSummaryDto,
  DuplicateSuggestionDto,
} from "@hiredesq/shared";
import type { Candidate, Prisma } from "@hiredesq/database";
import { PrismaService } from "../../common/prisma.service.js";
import { pageTake } from "../../common/pagination.js";
import { CandidatesService } from "../candidates/candidates.service.js";

type DuplicateStatus = "pending" | "confirmed" | "dismissed";

@Injectable()
export class DuplicatesService {
  private readonly logger = new Logger(DuplicatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: CandidatesService,
  ) {}

  /** Pending-count for the review badge — no PII over the wire (§2). Tenant-scoped. */
  count(workspaceId: string, status: DuplicateStatus = "pending"): Promise<number> {
    return this.prisma.duplicateSuggestion.count({ where: { workspaceId, status } });
  }

  /** Name-only matches awaiting a confirm/dismiss decision (§5). Tenant-scoped. */
  async list(
    workspaceId: string,
    status: DuplicateStatus = "pending",
    limit?: number,
  ): Promise<DuplicateSuggestionDto[]> {
    const rows = await this.prisma.duplicateSuggestion.findMany({
      where: { workspaceId, status },
      orderBy: { createdAt: "desc" },
      take: pageTake({ limit }),
      include: {
        candidate: { select: SUMMARY_SELECT },
        duplicateOf: { select: SUMMARY_SELECT },
      },
    });
    this.logger.log(`duplicates list ws=${workspaceId} status=${status} count=${rows.length}`); // counts only (§2)
    return rows.map((r) => ({
      id: r.id,
      matchedOn: r.matchedOn,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      candidate: toSummary(r.candidate),
      duplicateOf: toSummary(r.duplicateOf),
    }));
  }

  /**
   * Resolve a suggestion (§5).
   *  - confirm: merge the new candidate into duplicateOf (fill only the fields
   *    duplicateOf is missing), delete the new candidate + its files, mark
   *    confirmed.
   *  - dismiss: keep both records, mark dismissed.
   * All tenant-scoped; a name collision is never silently merged elsewhere.
   */
  async resolve(workspaceId: string, id: string, action: "confirm" | "dismiss"): Promise<void> {
    const suggestion = await this.prisma.duplicateSuggestion.findFirst({
      where: { id, workspaceId },
      select: { id: true, candidateId: true, duplicateOfId: true, status: true },
    });
    if (!suggestion) throw new NotFoundException("duplicate suggestion not found");

    if (action === "dismiss") {
      await this.prisma.duplicateSuggestion.updateMany({
        where: { id, workspaceId },
        data: { status: "dismissed" },
      });
      this.logger.log(`duplicate dismissed ws=${workspaceId} id=${id}`); // ids only (§2)
      return;
    }

    await this.merge(workspaceId, suggestion.candidateId, suggestion.duplicateOfId);

    await this.prisma.duplicateSuggestion.updateMany({
      where: { id, workspaceId },
      data: { status: "confirmed" },
    });
    this.logger.log(
      `duplicate confirmed ws=${workspaceId} id=${id} merged=${suggestion.candidateId}->${suggestion.duplicateOfId}`,
    ); // ids only (§2)
  }

  // Copy any fields the surviving record (duplicateOf) is missing from the new
  // record, then delete the new candidate + its files. Both reads are tenant-
  // scoped; if either record vanished concurrently we no-op the missing side.
  private async merge(workspaceId: string, newId: string, survivorId: string): Promise<void> {
    const [incoming, survivor] = await Promise.all([
      this.prisma.candidate.findFirst({ where: { id: newId, workspaceId } }),
      this.prisma.candidate.findFirst({ where: { id: survivorId, workspaceId } }),
    ]);

    if (survivor && incoming) {
      const data = this.fillMissing(survivor, incoming);
      if (Object.keys(data).length > 0) {
        await this.prisma.candidate.updateMany({ where: { id: survivorId, workspaceId }, data });
      }
    }

    if (incoming) {
      // Delete the merged-away record AND its stored files (§2).
      await this.candidates.remove(workspaceId, newId);
    }
  }

  // Only fill columns the survivor lacks — never overwrite existing survivor data.
  private fillMissing(survivor: Candidate, incoming: Candidate): Prisma.CandidateUpdateManyMutationInput {
    const data: Prisma.CandidateUpdateManyMutationInput = {};

    if (!survivor.emailEncrypted && incoming.emailEncrypted) {
      data.emailEncrypted = incoming.emailEncrypted;
      data.normalizedEmail = incoming.normalizedEmail;
    }
    if (!survivor.phoneEncrypted && incoming.phoneEncrypted) {
      data.phoneEncrypted = incoming.phoneEncrypted;
      data.normalizedPhone = incoming.normalizedPhone;
    }
    if (!survivor.location && incoming.location) data.location = incoming.location;
    if (!survivor.currentTitle && incoming.currentTitle) data.currentTitle = incoming.currentTitle;
    if (!survivor.currentCompany && incoming.currentCompany) {
      data.currentCompany = incoming.currentCompany;
    }
    if (survivor.skills.length === 0 && incoming.skills.length > 0) data.skills = incoming.skills;

    const survivorExp = survivor.experience as unknown[];
    if ((!survivorExp || survivorExp.length === 0) && incoming.experience) {
      data.experience = incoming.experience as Prisma.InputJsonValue;
    }
    const survivorEdu = survivor.education as unknown[];
    if ((!survivorEdu || survivorEdu.length === 0) && incoming.education) {
      data.education = incoming.education as Prisma.InputJsonValue;
    }

    return data;
  }
}

const SUMMARY_SELECT = {
  id: true,
  fullName: true,
  currentTitle: true,
  currentCompany: true,
} satisfies Prisma.CandidateSelect;

function toSummary(c: {
  id: string;
  fullName: string;
  currentTitle: string | null;
  currentCompany: string | null;
}): CandidateSummaryDto {
  return {
    id: c.id,
    fullName: c.fullName,
    currentTitle: c.currentTitle,
    currentCompany: c.currentCompany,
  };
}

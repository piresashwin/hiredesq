import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  EducationEntry,
  ExperienceEntry,
  Paginated,
  SharedSubmissionDto,
  SubmissionDto,
  SubmissionVerdict,
} from "@hiredesq/shared";
import { InsufficientCreditsError, maskCandidate, redactContactText } from "@hiredesq/core";
import { generateSubmissionSummary } from "@hiredesq/ai";
import { PrismaService } from "../../common/prisma.service.js";
import { buildPage, pageSkip, pageTake } from "../../common/pagination.js";
import { CreditsService } from "../credits/credits.service.js";
import { toSharedSubmissionDto, toSubmissionDto } from "./submission.mapper.js";
import { verdictLabel, verdictToStage, verdictToTrailKind } from "./verdict.js";
import type { GenerateSubmissionDto } from "./submissions.dto.js";

// One DAILY credit per generation (Model B, FEATURE-SET §F3 — the daily meter gates
// generation, not ingest).
const SUBMISSION_COST = 1;

const candidateSummarySelect = {
  id: true,
  fullName: true,
  currentTitle: true,
  currentCompany: true,
} as const;

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger(SubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
  ) {}

  // workspaceId is always the first argument; every query filters by it (§1).
  async generate(
    workspaceId: string,
    dto: GenerateSubmissionDto,
    authorId?: string | null,
  ): Promise<SubmissionDto> {
    // 1. Verify the candidate (and job, if linked) live in this workspace (§1) —
    //    never trust ids from the body to be in-tenant.
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, workspaceId },
    });
    if (!candidate) throw new NotFoundException("candidate not found");

    let job: { id: string; title: string; client: string | null } | null = null;
    if (dto.jobId) {
      job = await this.prisma.job.findFirst({
        where: { id: dto.jobId, workspaceId },
        select: { id: true, title: true, client: true },
      });
      if (!job) throw new NotFoundException("job not found");
    }

    // Deterministic reservation/idempotency key for the generation (§4). Derived
    // from the unit of work — NOT a random per-call value (a fresh shareToken used
    // to be the key, so a client retry minted a new ledger row and double-charged).
    // The shareToken is now a separate, random capability for the share link only.
    const reservationKey = `submission:${dto.candidateId}:${dto.jobId ?? "pool"}`;

    // Idempotent retry: if this generation already committed, the result exists —
    // return it without re-charging or re-calling the model (§4).
    if ((await this.credits.getReservationStatus(workspaceId, reservationKey)) === "committed") {
      const existing = await this.prisma.submission.findFirst({
        where: { workspaceId, candidateId: dto.candidateId, jobId: dto.jobId ?? null },
        include: { candidate: { select: candidateSummarySelect } },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        this.logger.log(`generate submission idempotent-hit ws=${workspaceId} id=${existing.id}`); // ids only (§2)
        return toSubmissionDto(existing);
      }
    }

    // 2. Advisory daily-credit pre-check → graceful 402 (the reserve below is the
    //    true gate). Model B: a generation costs a daily credit.
    if (!(await this.credits.hasCreditsFor(workspaceId, SUBMISSION_COST))) {
      throw new HttpException(
        { code: "no_credits", message: "You've used your free submissions for today." },
        402,
      );
    }

    // 3. DETERMINISTIC masking (§2): strip contact BEFORE anything else, so the AI
    //    (and the stored artifact) only ever sees the masked profile. email/phone
    //    are never even read here — maskCandidate has no field for them.
    const masked = maskCandidate({
      fullName: candidate.fullName,
      location: candidate.location,
      currentTitle: candidate.currentTitle,
      currentCompany: candidate.currentCompany,
      skills: candidate.skills,
      experience: candidate.experience as unknown as ExperienceEntry[],
      education: candidate.education as unknown as EducationEntry[],
    });

    // 4. Reserve a daily credit — the TRUE gate (§4). Idempotent on the deterministic
    //    reservationKey; the locked aggregate can't oversell.
    const shareToken = randomBytes(24).toString("base64url");
    try {
      await this.credits.reserve(workspaceId, reservationKey, SUBMISSION_COST);
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        throw new HttpException(
          { code: "no_credits", message: "You've used your free submissions for today." },
          402,
        );
      }
      throw err;
    }

    // 5. Generate the prose from the MASKED profile, then 6. scrub the output too —
    //    defense in depth, never trusting the model to redact (§2). On ANY failure,
    //    refund — never charge for a generation with no result (§4).
    let summary: string;
    try {
      const raw = await generateSubmissionSummary({
        profile: masked,
        jobTitle: job?.title ?? null,
        client: job?.client ?? null,
      });
      summary = redactContactText(raw);
    } catch {
      await this.credits.settle(workspaceId, reservationKey, "refund");
      throw new BadRequestException("submission generation failed");
    }

    // 7. Persist the submission and (if job-linked) nudge the application to
    //    `submitted` — the V1.1 trail write lands with R3/F5. One transaction.
    let created;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.submission.create({
          data: {
            workspaceId,
            candidateId: dto.candidateId,
            jobId: dto.jobId ?? null,
            summary,
            maskedProfile: masked as unknown as object,
            shareToken,
          },
          include: { candidate: { select: candidateSummarySelect } },
        });
        if (dto.jobId) {
          // The submission IS the "submitted to client" act — ensure the candidate
          // sits at (at least) `submitted` on this job, and record it on the trail
          // (F5). Tenant + (candidate, job) scoped (§1).
          const app = await tx.application.findFirst({
            where: { workspaceId, candidateId: dto.candidateId, jobId: dto.jobId },
            select: { id: true, stage: true },
          });
          let applicationId = app?.id;
          if (!app) {
            const createdApp = await tx.application.create({
              data: { workspaceId, candidateId: dto.candidateId, jobId: dto.jobId, stage: "submitted" },
              select: { id: true },
            });
            applicationId = createdApp.id;
          } else if (app.stage === "sourced") {
            // Only advance from `sourced` — never downgrade a later stage.
            await tx.application.updateMany({
              where: { id: app.id, workspaceId },
              data: { stage: "submitted" },
            });
          }
          if (applicationId) {
            await tx.qualificationTrailEntry.create({
              data: {
                workspaceId,
                applicationId,
                kind: "note",
                note: "Submitted to client",
                authorId: authorId ?? null,
              },
            });
          }
        }
        return submission;
      });
    } catch (err) {
      await this.credits.settle(workspaceId, reservationKey, "refund");
      throw err;
    }

    // 8. Commit — the generation produced a result (§4).
    await this.credits.settle(workspaceId, reservationKey, "commit");
    this.logger.log(`generate submission ws=${workspaceId} id=${created.id}`); // ids only (§2)
    return toSubmissionDto(created);
  }

  // `candidateId` scopes the list to one candidate's submissions (the profile
  // panel) — server-side, so the client never fetches the whole workspace to filter
  // (covered by @@index([workspaceId, candidateId])). Omit for the full list. The
  // `count` uses the SAME where so the total reflects any candidate filter (§1).
  async list(
    workspaceId: string,
    opts: { candidateId?: string; page?: number; limit?: number } = {},
  ): Promise<Paginated<SubmissionDto>> {
    const { candidateId, page, limit } = opts;
    const where = { workspaceId, ...(candidateId ? { candidateId } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.submission.findMany({
        where,
        include: { candidate: { select: candidateSummarySelect } },
        orderBy: { createdAt: "desc" },
        skip: pageSkip({ page, limit }),
        take: pageTake({ limit }),
      }),
      this.prisma.submission.count({ where }),
    ]);
    this.logger.log(`list submissions ws=${workspaceId} page=${page ?? 1} count=${rows.length}`); // ids/counts only (§2)
    return buildPage(rows.map(toSubmissionDto), total, { page, limit });
  }

  async getById(workspaceId: string, id: string): Promise<SubmissionDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1).
    const row = await this.prisma.submission.findFirst({
      where: { id, workspaceId },
      include: { candidate: { select: candidateSummarySelect } },
    });
    if (!row) throw new NotFoundException("submission not found");
    return toSubmissionDto(row);
  }

  /**
   * PUBLIC tokenized lookup for the client share link — intentionally NOT
   * workspace-scoped: the unguessable token IS the capability (like a signed URL),
   * and the response is the masked, non-identifying view only (§1/§2 — no ids, no
   * workspace, no contact). Flips Sent → Viewed on first open (the rest of the
   * feedback loop is F5).
   */
  async getByToken(shareToken: string): Promise<SharedSubmissionDto> {
    const row = await this.prisma.submission.findUnique({ where: { shareToken } });
    if (!row) throw new NotFoundException("submission not found");
    if (row.status === "sent") {
      // Conditional flip so only the FIRST concurrent open transitions sent → viewed;
      // a racing second open updates zero rows. Keeps any future first-view side effect
      // (F5 feedback loop) from double-firing. The response shows "viewed" either way.
      await this.prisma.submission.updateMany({
        where: { shareToken, status: "sent" },
        data: { status: "viewed" },
      });
      row.status = "viewed";
    }
    return toSharedSubmissionDto(row);
  }

  /**
   * Record the client's verdict on a submission (§2D, F5) — closes the loop. Sets
   * the submission status, and for a job-linked submission auto-nudges the pipeline
   * stage FORWARD (never disturbing a win) and writes the decision to the
   * qualification trail. One transaction, fully tenant-scoped (§1). No AI, no credit.
   */
  async recordVerdict(
    workspaceId: string,
    id: string,
    verdict: SubmissionVerdict,
    authorId?: string | null,
  ): Promise<SubmissionDto> {
    const submission = await this.prisma.submission.findFirst({
      where: { id, workspaceId },
      select: { id: true, candidateId: true, jobId: true },
    });
    if (!submission) throw new NotFoundException("submission not found");

    await this.prisma.$transaction(async (tx) => {
      // The verdict values ARE the terminal SubmissionStatus values.
      await tx.submission.updateMany({ where: { id, workspaceId }, data: { status: verdict } });

      if (submission.jobId) {
        const app = await tx.application.findFirst({
          where: { workspaceId, candidateId: submission.candidateId, jobId: submission.jobId },
          select: { id: true, stage: true },
        });
        if (app) {
          const target = verdictToStage(app.stage, verdict);
          if (target) {
            // Guard on the stage we computed `target` FROM (§2D). If a concurrent move
            // advanced the application between the read above and here, this no-ops
            // instead of overwriting it — so the verdict's forward-nudge can never
            // drag a stage backward (e.g. interview → submitted).
            await tx.application.updateMany({
              where: { id: app.id, workspaceId, stage: app.stage },
              data: { stage: target },
            });
          }
          await tx.qualificationTrailEntry.create({
            data: {
              workspaceId,
              applicationId: app.id,
              kind: verdictToTrailKind(verdict),
              note: `Client verdict: ${verdictLabel(verdict)}`,
              authorId: authorId ?? null,
            },
          });
        }
      }
    });

    this.logger.log(`submission verdict ws=${workspaceId} id=${id} verdict=${verdict}`); // ids only (§2)
    return this.getById(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.prisma.submission.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("submission not found");
    await this.prisma.submission.deleteMany({ where: { id, workspaceId } });
    this.logger.log(`delete submission ws=${workspaceId} id=${id}`); // ids only (§2)
  }
}

import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  CandidateDto,
  CandidateExportDto,
  CandidateJobHistoryDto,
  CandidateListItemDto,
  ApplicationDto,
  NoteDto,
  Paginated,
  PlacementDto,
  PipelineStage,
  SignedUrlDto,
} from "@hiredesq/shared";
import { encryptField, normalizeEmail, normalizePhone, normalizeName } from "@hiredesq/core";
import { embedText, toVectorLiteral } from "@hiredesq/ai";
import { workspaceKey } from "@hiredesq/storage";
import { PrismaService } from "../../common/prisma.service.js";
import { StorageService } from "../../common/storage.service.js";
import { buildPage, pageSkip, pageTake } from "../../common/pagination.js";
import { effectivePlacementStatus } from "../placements/guarantee.js";
import { candidateListSelect, toCandidateDto, toCandidateListItemDto } from "./candidate.mapper.js";
import type { AddNoteDto, UpdateCandidateDto } from "./candidates.dto.js";

/** A buffered candidate photo handed over by the controller (multipart). */
export interface IncomingPhoto {
  mimetype: string;
  buffer: Buffer;
}

// Accepted photo content types → file extension for the storage key. Matches the
// user-avatar set (PNG/JPEG/WEBP).
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  // workspaceId is always the first argument; every query filters by it (§1).
  // The list/search row is a PII-lean summary (no email/phone, no experience blobs);
  // opening a profile fetches the full CandidateDto via getById (§2 — minimize the
  // decrypted-PII surface; only project what the list renders).
  async list(
    workspaceId: string,
    opts: { search?: string; semantic?: boolean; page?: number; limit?: number } = {},
  ): Promise<Paginated<CandidateListItemDto>> {
    const { search, semantic = false, page, limit } = opts;
    this.logger.log(`list candidates ws=${workspaceId} semantic=${semantic} page=${page ?? 1}`); // ids/counts only, no PII (§2)
    const take = pageTake({ limit });
    const term = search?.trim();

    // Search is a NARROWING tool: return the ranked top matches as a single page
    // (you refine the query rather than page through fuzzy/relevance results).
    // `total` = the returned count, so the numbered pager stays hidden. Only the
    // unfiltered BROWSE list below is offset-paginated (the "200 candidates"
    // surface the bounded-list invariant cares about).
    if (term) {
      const items = semantic
        ? await this.semanticSearch(workspaceId, term, take)
        : await this.search(workspaceId, term, take);
      return { items, total: items.length, page: 1, limit: take };
    }

    const where = { workspaceId };
    const [rows, total] = await Promise.all([
      this.prisma.candidate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip({ page, limit }),
        take,
        select: candidateListSelect,
      }),
      this.prisma.candidate.count({ where }),
    ]);
    return buildPage(rows.map(toCandidateListItemDto), total, { page, limit });
  }

  /**
   * Semantic (meaning-based) search (search upgrade #2, §5). Embeds the query with
   * the SAME local model used at ingest, then ranks candidates by cosine distance
   * (`<=>`) over the pgvector HNSW index — so "frontend engineer" surfaces a resume
   * that says "React/UI developer". Tenant-scoped raw SQL (explicit workspace_id,
   * §1), ids-only then hydrated through the mapper (§2). If the local embedder is
   * unavailable, falls back to fuzzy keyword search so search never hard-fails.
   */
  private async semanticSearch(
    workspaceId: string,
    term: string,
    take: number,
  ): Promise<CandidateListItemDto[]> {
    let literal: string;
    try {
      // "query" input_type — Voyage tunes the query vector for retrieval (§5).
      literal = toVectorLiteral(await embedText(term, "query"));
    } catch {
      this.logger.warn(`semantic search embedder unavailable ws=${workspaceId} — fuzzy fallback`);
      return this.search(workspaceId, term, take);
    }

    const ranked = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "candidate"
      WHERE "workspace_id" = ${workspaceId} AND "embedding" IS NOT NULL
      ORDER BY "embedding" <=> ${literal}::vector
      LIMIT ${take}
    `;
    return this.hydrateRanked(workspaceId, ranked);
  }

  /**
   * Fuzzy, typo-tolerant candidate search (search upgrade #1, §5). Uses pg_trgm:
   * the similarity (%) operator catches misspellings ("Ashwn" → "Ashwin") and
   * ILIKE catches substrings ("java" → "JavaScript"), both backed by the GIN
   * trigram indexes. Results are ranked by best trigram similarity across the
   * human-entered columns, newest first as a tie-break.
   *
   * Raw SQL is required (Prisma has no `%`/similarity operator) — so it carries an
   * EXPLICIT workspace_id predicate (§1) and is parameterized via the tagged
   * template (no injection). It selects ids only, then hydrates through the typed
   * model + mapper so PII decryption and DTO shaping stay in their single place (§2).
   */
  private async search(
    workspaceId: string,
    term: string,
    take: number,
  ): Promise<CandidateListItemDto[]> {
    const like = `%${term}%`;
    const ranked = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "candidate"
      WHERE "workspace_id" = ${workspaceId}
        AND (
          "full_name" % ${term}
          OR "current_title" % ${term}
          OR "current_company" % ${term}
          OR "full_name" ILIKE ${like}
          OR "current_title" ILIKE ${like}
          OR "current_company" ILIKE ${like}
          OR EXISTS (SELECT 1 FROM unnest("skills") s WHERE s ILIKE ${like})
          -- Also match PAST roles: a candidate's relevant title (e.g. "Case Officer")
          -- often lives in their experience history, not their current title. Without
          -- this, keyword search can never find them by what they used to do.
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements("experience") e
            WHERE (e->>'title') % ${term}
              OR (e->>'title') ILIKE ${like}
              OR (e->>'company') ILIKE ${like}
          )
        )
      ORDER BY GREATEST(
          similarity("full_name", ${term}),
          similarity(COALESCE("current_title", ''), ${term}),
          similarity(COALESCE("current_company", ''), ${term}),
          -- Best trigram similarity across past role titles, so a strong experience
          -- match ranks alongside a current-title match.
          COALESCE(
            (SELECT max(similarity(e->>'title', ${term}))
             FROM jsonb_array_elements("experience") e),
            0
          )
        ) DESC, "created_at" DESC
      LIMIT ${take}
    `;
    return this.hydrateRanked(workspaceId, ranked);
  }

  /**
   * Hydrate relevance-ranked ids (from a raw search query) into DTOs, preserving
   * the rank order and decrypting PII through the single mapper (§2). Tenant-scoped
   * re-read (§1).
   */
  private async hydrateRanked(
    workspaceId: string,
    ranked: Array<{ id: string }>,
  ): Promise<CandidateListItemDto[]> {
    if (ranked.length === 0) return [];
    const ids = ranked.map((r) => r.id);
    const rows = await this.prisma.candidate.findMany({
      where: { id: { in: ids }, workspaceId },
      select: candidateListSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .map(toCandidateListItemDto);
  }

  async getById(workspaceId: string, id: string): Promise<CandidateDto> {
    // Tenant-scoped lookup — never `where: { id }` alone (§1).
    const row = await this.prisma.candidate.findFirst({ where: { id, workspaceId } });
    if (!row) throw new NotFoundException("candidate not found");
    return toCandidateDto(row, workspaceId, this.storage);
  }

  /**
   * Store a candidate's profile photo (§2). Verifies the candidate is in THIS
   * workspace before touching it (§1); the storage key is namespaced under the
   * workspace and saved via a tenant-scoped updateMany. Returns the refreshed
   * CandidateDto carrying a freshly signed photoUrl.
   */
  async setPhoto(workspaceId: string, id: string, photo: IncomingPhoto): Promise<CandidateDto> {
    const ext = PHOTO_EXTENSIONS[photo.mimetype];
    if (!ext) {
      throw new BadRequestException("photo must be a PNG, JPEG, or WEBP image");
    }

    // Confirm the candidate is in this workspace before storing/writing (§1).
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    const key = workspaceKey(workspaceId, "candidate-photos", `${id}.${ext}`);
    await this.storage.put(workspaceId, key, photo.buffer, photo.mimetype);

    // Tenant-scoped write — the predicate is part of the WHERE (§1).
    await this.prisma.candidate.updateMany({ where: { id, workspaceId }, data: { photoKey: key } });
    this.logger.log(`photo set ws=${workspaceId} id=${id}`); // ids only, no PII (§2)
    return this.getById(workspaceId, id);
  }

  /**
   * The candidate's internal pipeline history — every job in THIS workspace they've
   * been attached to (§1), joined to the job for its title + client, newest first.
   * Distinct from their CV work history (ExperienceEntry).
   */
  async applications(workspaceId: string, id: string): Promise<CandidateJobHistoryDto[]> {
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    const rows = await this.prisma.application.findMany({
      where: { workspaceId, candidateId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jobId: true,
        stage: true,
        createdAt: true,
        job: { select: { title: true, client: true } },
      },
    });
    this.logger.log(`candidate applications ws=${workspaceId} id=${id} count=${rows.length}`); // ids/counts only (§2)
    return rows.map((a) => ({
      applicationId: a.id,
      jobId: a.jobId,
      jobTitle: a.job.title,
      client: a.job.client ?? null,
      stage: a.stage as PipelineStage,
      createdAt: a.createdAt.toISOString(),
    }));
  }

  /**
   * Free-form recruiter notes on a candidate (§1, tenant-scoped). A note is either
   * candidate-level (applicationId null) or scoped to one of the candidate's
   * positions. Newest first. The note body and candidate data are PII — we log
   * ids/counts only, never the text (§2).
   */
  async listNotes(workspaceId: string, id: string): Promise<NoteDto[]> {
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    const rows = await this.prisma.note.findMany({
      where: { workspaceId, candidateId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        body: true,
        applicationId: true,
        authorId: true,
        createdAt: true,
        // Denormalize the position's job title for display; null for a
        // candidate-level note. Tenant scoping is via the parent Note row (§1).
        application: { select: { job: { select: { title: true } } } },
      },
    });
    this.logger.log(`list notes ws=${workspaceId} id=${id} count=${rows.length}`); // ids/counts only, never the note text (§2)

    const authorNames = await this.resolveAuthorNames(rows.map((r) => r.authorId));
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      applicationId: r.applicationId,
      jobTitle: r.application?.job.title ?? null,
      authorId: r.authorId,
      authorName: r.authorId ? (authorNames.get(r.authorId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async addNote(
    workspaceId: string,
    id: string,
    dto: AddNoteDto,
    authorId: string | null,
  ): Promise<NoteDto> {
    // Confirm the candidate is in this workspace before writing (§1).
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    let jobTitle: string | null = null;
    const applicationId = dto.applicationId ?? null;
    if (applicationId) {
      // The position must belong to THIS candidate AND workspace (§1).
      const application = await this.prisma.application.findFirst({
        where: { id: applicationId, candidateId: id, workspaceId },
        select: { job: { select: { title: true } } },
      });
      if (!application) throw new NotFoundException("application not found");
      jobTitle = application.job.title;
    }

    const row = await this.prisma.note.create({
      data: {
        workspaceId,
        candidateId: id,
        applicationId,
        body: dto.body.trim(),
        authorId, // from the authenticated principal, never the body (§1)
      },
      select: { id: true, body: true, applicationId: true, authorId: true, createdAt: true },
    });
    this.logger.log(`add note ws=${workspaceId} id=${id} note=${row.id}`); // ids only, never the note text (§2)

    const authorName = row.authorId
      ? ((await this.resolveAuthorNames([row.authorId])).get(row.authorId) ?? null)
      : null;
    return {
      id: row.id,
      body: row.body,
      applicationId: row.applicationId,
      jobTitle,
      authorId: row.authorId,
      authorName,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async removeNote(workspaceId: string, id: string, noteId: string): Promise<void> {
    // Tenant + candidate scoped delete (§1). Idempotent: no error if already gone,
    // matching the deleteMany style used elsewhere here.
    const { count } = await this.prisma.note.deleteMany({
      where: { id: noteId, workspaceId, candidateId: id },
    });
    this.logger.log(`delete note ws=${workspaceId} id=${id} note=${noteId} removed=${count}`); // ids only (§2)
  }

  /**
   * Resolve distinct, non-null authorIds to display names in ONE query. Returns a
   * map of userId → fullName; a missing/removed user simply isn't in the map (the
   * caller falls back to null). Users are workspace members — no PII beyond the
   * display name is selected (§2).
   */
  private async resolveAuthorNames(
    authorIds: Array<string | null>,
  ): Promise<Map<string, string>> {
    const ids = [...new Set(authorIds.filter((a): a is string => Boolean(a)))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  async update(workspaceId: string, id: string, dto: UpdateCandidateDto): Promise<CandidateDto> {
    // Confirm the candidate is in this workspace before touching it (§1).
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    const data: Record<string, unknown> = {};

    if (dto.fullName !== undefined) {
      data.fullName = dto.fullName;
      data.normalizedName = normalizeName(dto.fullName);
    }
    if (dto.email !== undefined) {
      // Re-encrypt at rest (§2) and recompute the normalized column for dedup (§5).
      data.emailEncrypted = encryptField(dto.email);
      data.normalizedEmail = normalizeEmail(dto.email ?? undefined);
    }
    if (dto.phone !== undefined) {
      data.phoneEncrypted = encryptField(dto.phone);
      data.normalizedPhone = normalizePhone(dto.phone ?? undefined);
    }
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.currentTitle !== undefined) data.currentTitle = dto.currentTitle;
    if (dto.currentCompany !== undefined) data.currentCompany = dto.currentCompany;
    if (dto.skills !== undefined) data.skills = dto.skills;
    // Hard-constraint fields (F4, §2C) — not dedup keys, persist as-is.
    if (dto.nationality !== undefined) data.nationality = dto.nationality;
    if (dto.residenceTransferable !== undefined) data.residenceTransferable = dto.residenceTransferable;
    if (dto.licenses !== undefined) data.licenses = dto.licenses;

    // Scope the write by workspaceId too — updateMany so the predicate is part of
    // the WHERE, then re-read for the response.
    await this.prisma.candidate.updateMany({ where: { id, workspaceId }, data });
    this.logger.log(`update candidate ws=${workspaceId} id=${id}`); // ids only, no PII (§2)
    return this.getById(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    // A delete must remove the stored FILES too, not just the DB rows (§2). A
    // candidate has no direct file link in Phase 2, so we resolve files via the
    // parse jobs that produced it: ParseJob.candidateId → fileId → UploadedFile.
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    await this.deleteCandidateFiles(workspaceId, id);

    // Tenant-scoped hard delete. Cascades applications + placements per schema.
    await this.prisma.candidate.deleteMany({ where: { id, workspaceId } });
    this.logger.log(`delete candidate ws=${workspaceId} id=${id}`); // ids only (§2)
  }

  /**
   * Short-lived signed URL to view a candidate's original uploaded file (§2).
   * Resolves the file the same way deletion does (ParseJob.candidateId → file),
   * tenant-scoped. 404 when the candidate has no stored original (e.g. a paste).
   */
  async getFileUrl(workspaceId: string, id: string): Promise<SignedUrlDto> {
    const existing = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("candidate not found");

    const job = await this.prisma.parseJob.findFirst({
      where: { workspaceId, candidateId: id, fileId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { file: { select: { storageKey: true } } },
    });
    const key = job?.file?.storageKey;
    if (!key) throw new NotFoundException("candidate has no stored original");

    const expiresInSeconds = 300;
    const url = await this.storage.signedGetUrl(workspaceId, key, expiresInSeconds);
    this.logger.log(`signed file url ws=${workspaceId} id=${id}`); // ids only (§2)
    return { url, expiresInSeconds };
  }

  /**
   * Best-effort removal of a candidate's object-storage files (§2). Finds the
   * UploadedFile(s) whose parse produced this candidate and deletes their bytes.
   * Tenant-scoped throughout; never throws if a file is already gone.
   */
  private async deleteCandidateFiles(workspaceId: string, candidateId: string): Promise<void> {
    const jobs = await this.prisma.parseJob.findMany({
      where: { workspaceId, candidateId, fileId: { not: null } },
      select: { file: { select: { storageKey: true } } },
    });
    // The profile photo lives on the candidate row, not via a parse job — delete
    // its object too so a PII delete removes everything we stored (§2).
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, workspaceId },
      select: { photoKey: true },
    });
    const keys = [
      ...new Set(
        [
          ...jobs.map((j) => j.file?.storageKey),
          candidate?.photoKey,
        ].filter((k): k is string => Boolean(k)),
      ),
    ];
    if (keys.length === 0) return;

    try {
      await this.storage.deleteMany(workspaceId, keys);
    } catch (err) {
      // Don't block the DB delete on a storage hiccup / already-gone object (§2).
      this.logger.warn(
        `file delete partial ws=${workspaceId} candidate=${candidateId} keys=${keys.length} err=${
          err instanceof Error ? err.name : "unknown"
        }`,
      );
    }
  }

  async export(workspaceId: string, id: string): Promise<CandidateExportDto> {
    const row = await this.prisma.candidate.findFirst({
      where: { id, workspaceId },
      include: {
        applications: { orderBy: { createdAt: "asc" } },
        placements: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("candidate not found");

    const applications: ApplicationDto[] = row.applications.map((a) => ({
      id: a.id,
      candidateId: a.candidateId,
      jobId: a.jobId,
      stage: a.stage as PipelineStage,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    const now = new Date();
    const placements: PlacementDto[] = row.placements.map((p) => ({
      id: p.id,
      candidateId: p.candidateId,
      jobId: p.jobId,
      feeAmount: p.feeAmount.toString(), // Decimal → string, never a float (§3)
      currency: p.currency,
      placedAt: p.placedAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
      guaranteeDays: p.guaranteeDays,
      clearsAt: p.clearsAt.toISOString(),
      status: effectivePlacementStatus(p.status, p.clearsAt, now),
      replacesPlacementId: p.replacesPlacementId,
    }));

    this.logger.log(`export candidate ws=${workspaceId} id=${id}`); // ids only (§2)
    return {
      candidate: await toCandidateDto(row, workspaceId, this.storage),
      applications,
      placements,
      exportedAt: new Date().toISOString(),
    };
  }
}

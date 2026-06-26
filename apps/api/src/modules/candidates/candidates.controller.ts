import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  CandidateDto,
  CandidateExportDto,
  CandidateJobHistoryDto,
  CandidateListItemDto,
  Paginated,
  NoteDto,
  SignedUrlDto,
} from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
  type AuthedRequest,
} from "../../common/guards.js";
import { CandidatesService } from "./candidates.service.js";
import { AddNoteDto, ListCandidatesQuery, UpdateCandidateDto } from "./candidates.dto.js";

// One multipart part as exposed by @fastify/multipart. Structural type so we don't
// depend on a `fastify` import — same approach as UploadsController/AuthController.
// We touch only fieldname/mimetype/toBuffer.
interface MultipartPart {
  fieldname: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

// The Fastify request augmented by @fastify/multipart.
interface MultipartRequest {
  isMultipart(): boolean;
  files(): AsyncIterableIterator<MultipartPart>;
}

// Photos are capped well below the global 25MB multipart limit — a profile photo
// doesn't need more (§2 — bound what we store). Matches the avatar cap.
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

// Mounted under the workspace; full guard stack on the class (CLAUDE.md §1).
@Controller("workspaces/:workspaceId/candidates")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get()
  @RequirePermission("read", "candidate")
  list(
    @Param("workspaceId") workspaceId: string,
    @Query() query: ListCandidatesQuery,
  ): Promise<Paginated<CandidateListItemDto>> {
    return this.candidates.list(workspaceId, {
      search: query.search,
      semantic: query.semantic === "true",
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(":id")
  @RequirePermission("read", "candidate")
  get(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<CandidateDto> {
    return this.candidates.getById(workspaceId, id);
  }

  @Get(":id/export")
  @RequirePermission("read", "candidate")
  export(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<CandidateExportDto> {
    return this.candidates.export(workspaceId, id);
  }

  // Signed URL to view the candidate's original upload (§2). Candidate-centric so
  // the web only needs the candidate id (it doesn't track fileIds).
  @Get(":id/file")
  @RequirePermission("read", "candidate")
  fileUrl(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<SignedUrlDto> {
    return this.candidates.getFileUrl(workspaceId, id);
  }

  // The candidate's internal pipeline history — the jobs in this workspace they've
  // been attached to (§1). Candidate-centric so the web only needs the candidate id.
  @Get(":id/applications")
  @RequirePermission("read", "candidate")
  applications(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<CandidateJobHistoryDto[]> {
    return this.candidates.applications(workspaceId, id);
  }

  // Free-form recruiter notes on the candidate — candidate-level or scoped to one
  // of their positions (§1, candidate-centric so the web only needs the candidate
  // id). The note body and candidate data are PII (§2).
  @Get(":id/notes")
  @RequirePermission("read", "candidate")
  notes(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
  ): Promise<NoteDto[]> {
    return this.candidates.listNotes(workspaceId, id);
  }

  @Post(":id/notes")
  @RequirePermission("write", "candidate")
  addNote(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Req() req: AuthedRequest,
    @Body() dto: AddNoteDto,
  ): Promise<NoteDto> {
    // authorId from the authenticated principal (set by AuthGuard), never the body.
    // Nullable column, so null is a safe fallback if the principal is absent.
    return this.candidates.addNote(workspaceId, id, dto, req.user?.id ?? null);
  }

  @Delete(":id/notes/:noteId")
  @RequirePermission("write", "candidate")
  @HttpCode(204)
  async removeNote(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Param("noteId") noteId: string,
  ): Promise<void> {
    await this.candidates.removeNote(workspaceId, id, noteId);
  }

  // Multipart profile-photo upload (field "file"). Reuses the @fastify/multipart
  // pattern from UploadsController/AuthController; the workspace-namespaced storage
  // key is resolved in the service from the route param, never a body (§1).
  @Post(":id/photo")
  @RequirePermission("write", "candidate")
  async uploadPhoto(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Req() req: MultipartRequest,
  ): Promise<CandidateDto> {
    if (!req.isMultipart()) {
      throw new BadRequestException("expected multipart/form-data");
    }

    // Take the "file" part. We hold bytes only long enough to store them (§2).
    for await (const part of req.files()) {
      if (part.fieldname !== "file") continue;
      const buffer = await part.toBuffer();
      if (buffer.length > PHOTO_MAX_BYTES) {
        throw new BadRequestException("photo must be 2MB or smaller");
      }
      return this.candidates.setPhoto(workspaceId, id, { mimetype: part.mimetype, buffer });
    }

    throw new BadRequestException("no photo file in upload");
  }

  @Patch(":id")
  @RequirePermission("write", "candidate")
  update(
    @Param("workspaceId") workspaceId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCandidateDto,
  ): Promise<CandidateDto> {
    return this.candidates.update(workspaceId, id, dto);
  }

  @Delete(":id")
  @RequirePermission("delete", "candidate")
  @HttpCode(204)
  async remove(@Param("workspaceId") workspaceId: string, @Param("id") id: string): Promise<void> {
    await this.candidates.remove(workspaceId, id);
  }
}

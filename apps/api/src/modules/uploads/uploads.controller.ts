import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { BulkIngestResponse, SignedUrlDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../common/guards.js";
import { UploadsService, type IncomingFile } from "./uploads.service.js";

// One multipart part as exposed by @fastify/multipart. Structural type so we
// don't depend on a `fastify` import (it isn't a direct dep — same approach as
// the guards' AuthedRequest). We touch only filename/mimetype/toBuffer.
interface MultipartPart {
  filename: string;
  mimetype: string;
  toBuffer(): Promise<Buffer>;
}

// The Fastify request augmented by @fastify/multipart.
interface MultipartRequest {
  isMultipart(): boolean;
  files(): AsyncIterableIterator<MultipartPart>;
}

// Multipart upload entry point for the CV-parse pipeline. Full guard stack;
// workspaceId comes from the route, never the body (CLAUDE.md §1). Writing
// candidates requires write perms.
@Controller("workspaces/:workspaceId/uploads")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @RequirePermission("write", "candidate")
  async upload(
    @Param("workspaceId") workspaceId: string,
    @Req() req: MultipartRequest,
    // Job-centric inbound (§2A, F7): ?jobId targets a position; verified in-tenant
    // in the service. Comes via query (the multipart body carries the files).
    @Query("jobId") jobId: string | undefined,
    // Client-chunked folder drop: the web client splits a big folder into
    // byte-bounded requests. The first carries ?grouped=1 to force a batch; the
    // rest carry ?batchId to append to it. Both are tenant-verified in the service.
    @Query("batchId") batchId: string | undefined,
    @Query("grouped") grouped: string | undefined,
  ): Promise<BulkIngestResponse> {
    if (!req.isMultipart()) {
      throw new BadRequestException("expected multipart/form-data");
    }

    // Buffer each part in turn (limits enforced by @fastify/multipart in main.ts).
    // We hold bytes only long enough to hash + store — never log them (§2).
    const files: IncomingFile[] = [];
    for await (const part of req.files()) {
      const buffer = await part.toBuffer();
      files.push({
        filename: part.filename,
        mimetype: part.mimetype,
        buffer,
      });
    }

    if (files.length === 0) {
      throw new BadRequestException("no files in upload");
    }

    return this.uploads.ingest(workspaceId, files, jobId, {
      batchId,
      grouped: grouped === "1" || grouped === "true",
    });
  }

  // Short-lived signed URL to view an uploaded original (§2). The UploadedFile
  // lookup is tenant-scoped and the key is verified in-workspace before signing.
  @Get(":fileId/url")
  @RequirePermission("read", "candidate")
  signedUrl(
    @Param("workspaceId") workspaceId: string,
    @Param("fileId") fileId: string,
  ): Promise<SignedUrlDto> {
    return this.uploads.signedUrl(workspaceId, fileId);
  }
}

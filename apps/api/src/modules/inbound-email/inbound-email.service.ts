import { randomBytes } from "node:crypto";
import { HttpException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { InboundEmailPayload, InboxAddressDto } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { UploadsService, type IncomingFile } from "../uploads/uploads.service.js";
import { IngestService } from "../ingest/ingest.service.js";
import { parseInboxAddress } from "./address.js";

const DEFAULT_INBOX_DOMAIN = "inbox.hiredesq.com";

@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly ingest: IngestService,
  ) {}

  private inboxDomain(): string {
    return process.env.INBOX_DOMAIN || DEFAULT_INBOX_DOMAIN;
  }

  /**
   * Ingest one forwarded email (F9). The address token is the tenant key — there is
   * NO authenticated session here, so we resolve the workspace from the (unguessable)
   * inboxToken and then scope EVERYTHING to it (§1). Attachments take precedence
   * (the CV); a body-only email is parsed as a paste. Job-addressed mail routes via
   * F7. Reuses the shipped upload/paste pipeline verbatim. Logs ids/counts only (§2).
   *
   * Always resolves (never throws to the caller) so the email front doesn't retry a
   * permanent condition — unknown address / over-quota / empty are accepted-and-dropped.
   */
  async resolveAndIngest(payload: InboundEmailPayload): Promise<{ accepted: boolean; reason?: string }> {
    const parsed = parseInboxAddress(payload.to ?? "", this.inboxDomain());
    if (!parsed) return { accepted: false, reason: "unrecognized_address" };

    const ws = await this.prisma.workspace.findFirst({
      where: { inboxToken: parsed.inboxToken },
      select: { id: true },
    });
    if (!ws) {
      this.logger.warn("inbound drop reason=unknown_inbox"); // no token logged (capability, §2/§6)
      return { accepted: false, reason: "unknown_inbox" };
    }
    const workspaceId = ws.id;

    // F7 routing: only honor the plus-addressed job if it's in THIS workspace (§1);
    // otherwise fall back to the global pool rather than reject the email.
    let jobId: string | undefined;
    if (parsed.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: parsed.jobId, workspaceId },
        select: { id: true },
      });
      jobId = job?.id;
    }

    const attachments = payload.attachments ?? [];
    try {
      if (attachments.length > 0) {
        // Attachments win — the CV is the attachment. Reuse the upload pipeline.
        const files: IncomingFile[] = attachments.map((a) => ({
          filename: a.filename || "attachment",
          mimetype: a.contentType || "application/octet-stream",
          buffer: Buffer.from(a.contentBase64, "base64"),
        }));
        await this.uploads.ingest(workspaceId, files, jobId);
      } else if (payload.text && payload.text.trim()) {
        // Body-only — a forwarded chat / CV in the body. Reuse the paste pipeline.
        await this.ingest.ingest(workspaceId, {
          kind: "text",
          payload: payload.text,
          source: "email_forward",
          jobId,
        });
      } else {
        return { accepted: false, reason: "empty" };
      }
    } catch (err) {
      // Over-quota (402) or a transient enqueue hiccup: accept + drop so the email
      // front doesn't retry forever. The recruiter still has the in-app path; a
      // bounce/notify is a future enhancement. Never log content (§2).
      const reason = err instanceof HttpException ? "quota_or_http" : "error";
      this.logger.warn(`inbound drop ws=${workspaceId} reason=${reason}`);
      return { accepted: false, reason };
    }

    this.logger.log(
      `inbound accepted ws=${workspaceId} attachments=${attachments.length} job=${jobId ? "yes" : "no"}`,
    ); // ids/counts only (§2)
    return { accepted: true };
  }

  /** The workspace's forwarding address, minting the token on first request. */
  async getOrCreateAddress(workspaceId: string): Promise<InboxAddressDto> {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { inboxToken: true },
    });
    if (!ws) throw new NotFoundException("workspace not found");

    if (!ws.inboxToken) {
      // Mint only if still unset (inbox_token IS NULL in the WHERE). Two concurrent
      // first-calls would otherwise both generate and the second would overwrite the
      // first, orphaning any address already handed out. The loser updates zero rows;
      // we then re-read so BOTH callers return the token that actually persisted.
      const minted = randomBytes(12).toString("hex"); // 96-bit, lowercase — the capability
      await this.prisma.workspace.updateMany({
        where: { id: workspaceId, inboxToken: null },
        data: { inboxToken: minted },
      });
      const persisted = await this.prisma.workspace.findFirst({
        where: { id: workspaceId },
        select: { inboxToken: true },
      });
      return { address: `${persisted?.inboxToken ?? minted}@${this.inboxDomain()}` };
    }
    return { address: `${ws.inboxToken}@${this.inboxDomain()}` };
  }

  /** Rotate the token — invalidates the old address (e.g. after it leaked). */
  async regenerate(workspaceId: string): Promise<InboxAddressDto> {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!ws) throw new NotFoundException("workspace not found");

    const token = randomBytes(12).toString("hex");
    await this.prisma.workspace.updateMany({ where: { id: workspaceId }, data: { inboxToken: token } });
    this.logger.log(`inbox token rotated ws=${workspaceId}`); // ids only — never the token (§6)
    return { address: `${token}@${this.inboxDomain()}` };
  }
}

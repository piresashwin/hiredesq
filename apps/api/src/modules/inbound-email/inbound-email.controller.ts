import { timingSafeEqual } from "node:crypto";
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { InboxAddressDto } from "@hiredesq/shared";
import { AuthGuard, TenantGuard, PermissionsGuard, RequirePermission } from "../../common/guards.js";
import { InboundEmailService } from "./inbound-email.service.js";
import { InboundEmailDto } from "./inbound-email.dto.js";

/**
 * PUBLIC inbound-email webhook (F9). NOT under workspaces/:id and NOT behind the
 * user guard stack — the sender is an email forwarder, not an authenticated user.
 * It is authenticated instead by a SHARED SECRET the email front (Cloudflare Email
 * Worker) holds; the workspace is resolved from the address token in the service.
 * This is the same deliberate §1 exception pattern as the public submission-share
 * endpoint — the boundary is the secret + the token→workspace resolve.
 */
@Controller("inbound")
export class InboundEmailController {
  constructor(private readonly service: InboundEmailService) {}

  @Post("email")
  @HttpCode(200) // always 200 (even on drop) so the email front never retries forever
  async email(
    @Headers("authorization") auth: string | undefined,
    @Body() body: InboundEmailDto,
  ): Promise<{ accepted: boolean }> {
    this.assertSecret(auth);
    const result = await this.service.resolveAndIngest(body);
    return { accepted: result.accepted };
  }

  /** Constant-time `Authorization: Bearer <INBOUND_WEBHOOK_SECRET>` check. */
  private assertSecret(auth?: string): void {
    const secret = process.env.INBOUND_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException("inbound webhook not configured");
    const given = Buffer.from(auth ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException("bad inbound signature");
    }
  }
}

/**
 * The recruiter's view/management of their forwarding address. Workspace-scoped,
 * full guard stack (§1) — distinct from the public webhook above.
 */
@Controller("workspaces/:workspaceId/inbox")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class InboxController {
  constructor(private readonly service: InboundEmailService) {}

  @Get()
  @RequirePermission("read", "candidate")
  get(@Param("workspaceId") workspaceId: string): Promise<InboxAddressDto> {
    return this.service.getOrCreateAddress(workspaceId);
  }

  @Post("regenerate")
  @RequirePermission("write", "candidate")
  regenerate(@Param("workspaceId") workspaceId: string): Promise<InboxAddressDto> {
    return this.service.regenerate(workspaceId);
  }
}

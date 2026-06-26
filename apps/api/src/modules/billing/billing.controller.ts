import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { BillingRedirectDto } from "@hiredesq/shared";
import {
  AuthGuard,
  TenantGuard,
  PermissionsGuard,
  RequirePermission,
  type AuthedRequest,
} from "../../common/guards.js";
import { BillingService } from "./billing.service.js";

/**
 * Billing actions for the recruiter. Full guard stack; resource "billing" →
 * PermissionsGuard forces OWNER-only (intended — only the owner pays/manages).
 */
@Controller("workspaces/:workspaceId/billing")
@UseGuards(AuthGuard, TenantGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post("checkout")
  @RequirePermission("write", "billing")
  checkout(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthedRequest,
  ): Promise<BillingRedirectDto> {
    // userId from the authenticated principal (set by AuthGuard), never the body.
    return this.billing.createCheckout(workspaceId, req.user!.id);
  }

  @Post("portal")
  @RequirePermission("write", "billing")
  portal(@Param("workspaceId") workspaceId: string): Promise<BillingRedirectDto> {
    return this.billing.createPortal(workspaceId);
  }
}

/**
 * PUBLIC Stripe webhook (F8). NOT under workspaces/:id and NOT behind the guard
 * stack — Stripe is the caller. Authenticated by Stripe's SIGNATURE over the RAW
 * body (boot enables rawBody); the workspace is resolved from event metadata /
 * the customer mapping in the service. Same deliberate §1 exception pattern as the
 * inbound-email + submission-share webhooks.
 */
@Controller("billing")
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post("stripe-webhook")
  @HttpCode(200)
  async webhook(
    @Req() req: { rawBody?: Buffer },
    @Headers("stripe-signature") signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!req.rawBody || !signature) {
      throw new BadRequestException("missing raw body or signature");
    }
    await this.billing.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}

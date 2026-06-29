import Stripe from "stripe";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { BillingRedirectDto, PlanTier } from "@hiredesq/shared";
import { PrismaService } from "../../common/prisma.service.js";
import { CreditsService } from "../credits/credits.service.js";

/**
 * Stripe billing (F8, MVP-SPEC §4F). Stripe owns the money — we never compute,
 * store, or log monetary amounts or card data (§3/§6); we store only the linking
 * ids and flip `Workspace.plan` from the signed webhook. The plan flip lifts the
 * paid tier's caps via CreditsService (team ≈ unlimited submissions).
 *
 * The client is created lazily so the API boots fine without billing configured;
 * checkout/portal/webhook return a clear error until the keys are set.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripeClient?: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
  ) {}

  private stripe(): Stripe {
    if (!this.stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new BadRequestException("billing not configured");
      this.stripeClient = new Stripe(key);
    }
    return this.stripeClient;
  }

  private appUrl(): string {
    return process.env.APP_URL ?? "http://localhost:3000";
  }

  /**
   * Start a Stripe Checkout for the team plan; returns the hosted URL to redirect to.
   * TODO: when Solo Pro checkout ships, add STRIPE_SOLO_PRICE_ID → solo_pro here
   * (accept a `plan` param and route to the right price id). applyPlanAllotment already
   * reads the allotment from the Plan table for any PlanTier, so the credit side is ready.
   */
  async createCheckout(workspaceId: string, userId: string): Promise<BillingRedirectDto> {
    const priceId = process.env.STRIPE_TEAM_PRICE_ID;
    if (!priceId) throw new BadRequestException("billing not configured");

    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { id: true, stripeCustomerId: true },
    });
    if (!ws) throw new NotFoundException("workspace not found");

    // Reuse the workspace's Stripe customer, or create one keyed by workspaceId.
    let customerId = ws.stripeCustomerId;
    if (!customerId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      const customer = await this.stripe().customers.create({
        email: user?.email,
        metadata: { workspaceId },
      });
      customerId = customer.id;
      await this.prisma.workspace.updateMany({
        where: { id: workspaceId },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await this.stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${this.appUrl()}/settings/billing?upgrade=success`,
      cancel_url: `${this.appUrl()}/settings/billing?upgrade=cancelled`,
      client_reference_id: workspaceId,
      metadata: { workspaceId },
      subscription_data: { metadata: { workspaceId } },
    });
    if (!session.url) throw new BadRequestException("could not start checkout");
    this.logger.log(`checkout session ws=${workspaceId}`); // ids only (§6 — no amounts)
    return { url: session.url };
  }

  /** Open the Stripe billing portal so the recruiter can manage/cancel. */
  async createPortal(workspaceId: string): Promise<BillingRedirectDto> {
    const ws = await this.prisma.workspace.findFirst({
      where: { id: workspaceId },
      select: { stripeCustomerId: true },
    });
    if (!ws?.stripeCustomerId) throw new BadRequestException("no billing account yet");

    const session = await this.stripe().billingPortal.sessions.create({
      customer: ws.stripeCustomerId,
      return_url: `${this.appUrl()}/settings/billing`,
    });
    return { url: session.url };
  }

  /**
   * Verify + handle a Stripe webhook (F8). Signature-checked against the raw body
   * (the boot wires rawBody). Maps the event to a workspace and flips the plan —
   * idempotent (Stripe redelivers; set-state operations are safe to repeat).
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new BadRequestException("billing webhook not configured");

    let event: Stripe.Event;
    try {
      event = this.stripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new BadRequestException("bad stripe signature");
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Resolve the workspace from the VERIFIED customer mapping (stored in
        // createCheckout before checkout), NOT from request-supplied
        // metadata/client_reference_id — never trust a body field as the tenant key,
        // even inside a signed Stripe payload (§1). This also avoids overwriting
        // another workspace's stripeCustomerId.
        await this.setPlanByCustomer(idOf(session.customer), "team", idOf(session.subscription) ?? null);
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const active = sub.status === "active" || sub.status === "trialing";
        await this.setPlanByCustomer(idOf(sub.customer), active ? "team" : "free", sub.id);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await this.setPlanByCustomer(idOf(sub.customer), "free", sub.id);
        break;
      }
      default:
        break; // ignore the rest
    }
    this.logger.log(`stripe webhook type=${event.type}`); // type only — no PII/amounts (§6)
  }

  /** Flip a workspace's plan + linking ids, then lift/lower its credit caps (§4). */
  private async setPlan(
    workspaceId: string,
    plan: PlanTier,
    ids: { stripeCustomerId?: string; stripeSubscriptionId?: string | null },
  ): Promise<void> {
    await this.prisma.workspace.updateMany({
      where: { id: workspaceId },
      data: {
        plan,
        ...(ids.stripeCustomerId ? { stripeCustomerId: ids.stripeCustomerId } : {}),
        ...(ids.stripeSubscriptionId !== undefined ? { stripeSubscriptionId: ids.stripeSubscriptionId } : {}),
      },
    });
    await this.credits.applyPlanAllotment(workspaceId, plan);
  }

  /** Resolve the workspace by its Stripe customer id, then flip the plan. */
  private async setPlanByCustomer(
    customerId: string | null | undefined,
    plan: PlanTier,
    subscriptionId: string | null,
  ): Promise<void> {
    if (!customerId) return;
    const ws = await this.prisma.workspace.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, stripeSubscriptionId: true },
    });
    if (!ws) return; // unknown customer — not ours; ignore

    if (plan === "free") {
      // Downgrade only for the workspace's CURRENT subscription — a redelivered or
      // out-of-order delete/cancel for an old, already-replaced subscription must
      // not downgrade an active subscriber (event ordering isn't guaranteed).
      if (subscriptionId && ws.stripeSubscriptionId && subscriptionId !== ws.stripeSubscriptionId) {
        return;
      }
      await this.setPlan(ws.id, "free", { stripeSubscriptionId: null });
      return;
    }
    // TODO: when Solo Pro checkout ships, map STRIPE_SOLO_PRICE_ID → "solo_pro" here.
    // Inspect the subscription's price id and pass the correct PlanTier to setPlan.
    // applyPlanAllotment already handles all PlanTier values via the Plan table.
    await this.setPlan(ws.id, "team", { stripeSubscriptionId: subscriptionId });
  }
}

/** Pull the id out of a Stripe field that may be an id string or an expanded object. */
function idOf(
  value: string | { id: string } | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CreditBalanceDto, PlanTier } from "@hiredesq/shared";
import { CreditAccount, canParseFree } from "@hiredesq/core";
import { PrismaService } from "../../common/prisma.service.js";
import { isNewMonth, startOfNextMonth, monthKey } from "./period.js";

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lazily renew the free-tier monthly allotment at a UTC calendar-month boundary
   * (CLAUDE.md §4). The balance is mutated ONLY through the CreditAccount aggregate
   * (load state → renew → persist) — never a raw `balance:` write. Locks the
   * account row FOR UPDATE so a concurrent grant/reserve can't double-apply, and is
   * idempotent within a month (a second call in the same month is a no-op). Ledger
   * entries are left untouched (a grant resets the available balance, not history).
   *
   * NOTE: reset boundary is UTC calendar-month (v1 simplification — not billing-anchored).
   * Leave this comment here so reviewers know this is a conscious choice.
   */
  async ensureMonthlyGrant(workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Row lock — predicate carries workspace_id (§1). Serializes grant vs the
      // worker's reserve/settle on the same account under Read-Committed.
      await tx.$queryRaw`SELECT id FROM credit_account WHERE workspace_id = ${workspaceId} FOR UPDATE`;

      const account = await tx.creditAccount.findUnique({
        where: { workspaceId },
        select: { balance: true, monthlyAllotment: true, lastGrantedAt: true },
      });
      // No account (shouldn't happen for a live workspace) — nothing to renew.
      if (!account) return;

      const now = new Date();
      if (!isNewMonth(account.lastGrantedAt, now)) return; // already granted this month

      const entries = await tx.creditLedgerEntry.findMany({ where: { workspaceId } });
      const agg = new CreditAccount(
        workspaceId,
        account.balance,
        new Map(
          entries.map((e) => [
            e.reservationKey,
            { key: e.reservationKey, cost: e.cost, status: e.status },
          ]),
        ),
      );
      agg.renew(account.monthlyAllotment);

      await tx.creditAccount.update({
        where: { workspaceId },
        data: { balance: agg.available, lastGrantedAt: now },
      });
    });
  }

  async getBalance(workspaceId: string): Promise<CreditBalanceDto> {
    // Renew first so the reported balance reflects a crossed month boundary.
    await this.ensureMonthlyGrant(workspaceId);

    // Tenant-scoped: the account is keyed by workspaceId (§1).
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        creditAccount: {
          select: { balance: true, monthlyAllotment: true, ingestUsed: true, ingestPeriodKey: true },
        },
      },
    });
    if (!workspace) throw new NotFoundException("workspace not found");

    // Read the ingest ceiling and period from the Plan reference table.
    const planRow = await this.prisma.plan.findUnique({
      where: { tier: workspace.plan },
      select: { ingestFreeLimit: true, ingestPeriod: true },
    });
    if (!planRow) {
      this.logger.warn(`plan row missing for tier=${workspace.plan}; defaulting ingest fields to null`);
    }
    // null = unmetered ingest for this tier (paid plans).
    const ingestFreeLimit = planRow?.ingestFreeLimit ?? null;
    const ingestPeriod = (planRow?.ingestPeriod ?? null) as "lifetime" | "monthly" | null;

    const balance = workspace.creditAccount?.balance ?? 0;
    const monthlyAllotment = workspace.creditAccount?.monthlyAllotment ?? 0;

    // Compute ingest used for the CURRENT period.
    // If the account's ingestPeriodKey doesn't match the plan's desired key, the
    // period has rolled — this workspace starts fresh (0 used this period).
    const now = new Date();
    let ingestUsed = workspace.creditAccount?.ingestUsed ?? 0;
    if (ingestPeriod !== null && ingestFreeLimit !== null) {
      const desiredKey = ingestPeriod === "monthly" ? monthKey(now) : "lifetime";
      const storedKey = workspace.creditAccount?.ingestPeriodKey ?? "lifetime";
      if (storedKey !== desiredKey) {
        ingestUsed = 0; // stale period key → fresh period for display purposes
      }
    }

    return {
      balance,
      monthlyAllotment,
      used: Math.max(0, monthlyAllotment - balance),
      resetsAt: startOfNextMonth(now).toISOString(),
      plan: workspace.plan,
      // Model B ingest meter (§F3): resume parsing is free up to ingestFreeLimit per period.
      // null = unmetered (paid tiers).
      ingestUsed,
      ingestFreeLimit,
      ingestPeriod,
    };
  }

  /**
   * Advisory pre-check for the MONTHLY credit meter (§4) — used by the submission
   * generation path (Model B: the monthly credits gate generation, not ingest).
   * Renews any due grant, then reports whether the workspace can afford `cost`.
   * The synchronous reserve in the submissions service remains the true gate.
   */
  async hasCreditsFor(workspaceId: string, cost: number): Promise<boolean> {
    await this.ensureMonthlyGrant(workspaceId);
    const account = await this.prisma.creditAccount.findUnique({
      where: { workspaceId },
      select: { balance: true },
    });
    return (account?.balance ?? 0) >= cost;
  }

  /**
   * Advisory pre-check for the INGEST (parse) paths (Model B, §F3). Parsing is free,
   * but metered tiers are capped per period — so a backlog dump never paywalls on day 1,
   * while abuse hits a ceiling. Paid plans (ingestFreeLimit = null) are unmetered.
   * The worker's `reserveIngestSlot` is the true gate; this enables a graceful 402
   * with the right copy.
   */
  async hasIngestQuota(workspaceId: string): Promise<boolean> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { workspaceId },
      select: {
        ingestUsed: true,
        ingestPeriodKey: true,
        workspace: { select: { plan: true } },
      },
    });
    if (!account) return false;

    // Read the ceiling and period from the Plan table; null = unmetered.
    const planRow = await this.prisma.plan.findUnique({
      where: { tier: account.workspace.plan },
      select: { ingestFreeLimit: true, ingestPeriod: true },
    });
    const limit = planRow?.ingestFreeLimit ?? null;
    if (limit === null) return true; // unmetered tier (paid)

    const ingestPeriod = planRow?.ingestPeriod ?? null;
    const now = new Date();
    const desiredKey = ingestPeriod === "monthly" ? monthKey(now) : "lifetime";

    // If the account's period key is stale, the period has rolled → 0 used this period.
    const usedThisPeriod = account.ingestPeriodKey !== desiredKey ? 0 : account.ingestUsed;
    return canParseFree(usedThisPeriod, limit);
  }

  /**
   * Reserve `cost` MONTHLY credits for a generative action (Model B: submission
   * generation, §4). Balance is mutated ONLY through the CreditAccount aggregate;
   * the account row is locked FOR UPDATE so concurrent reserves can't oversell, and
   * it's idempotent on `key`. Renews any due monthly grant first. Throws
   * InsufficientCreditsError when the monthly allotment is exhausted.
   */
  async reserve(workspaceId: string, key: string, cost: number): Promise<void> {
    await this.ensureMonthlyGrant(workspaceId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM credit_account WHERE workspace_id = ${workspaceId} FOR UPDATE`;
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { workspaceId } });
      const entries = await tx.creditLedgerEntry.findMany({ where: { workspaceId } });
      const agg = new CreditAccount(
        workspaceId,
        account.balance,
        new Map(
          entries.map((e) => [e.reservationKey, { key: e.reservationKey, cost: e.cost, status: e.status }]),
        ),
      );
      agg.reserve(key, cost); // throws InsufficientCreditsError; idempotent on key
      await tx.creditAccount.update({ where: { workspaceId }, data: { balance: agg.available } });
      await tx.creditLedgerEntry.upsert({
        where: { workspaceId_reservationKey: { workspaceId, reservationKey: key } },
        create: { accountId: account.id, workspaceId, reservationKey: key, cost, status: "reserved" },
        update: {},
      });
    });
  }

  /**
   * Read a reservation's current status (or null if none) — lets a caller make a
   * generative action idempotent: if the deterministic key already `committed`, the
   * work already happened, so return the existing result instead of charging again
   * (§4 idempotency; a random per-call key used to double-charge retries).
   */
  async getReservationStatus(workspaceId: string, key: string): Promise<string | null> {
    const entry = await this.prisma.creditLedgerEntry.findUnique({
      where: { workspaceId_reservationKey: { workspaceId, reservationKey: key } },
      select: { status: true },
    });
    return entry?.status ?? null;
  }

  /** Settle a reservation — commit (success) or refund (failure; never charge work with no result, §4). */
  async settle(workspaceId: string, key: string, action: "commit" | "refund"): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM credit_account WHERE workspace_id = ${workspaceId} FOR UPDATE`;
      const account = await tx.creditAccount.findUniqueOrThrow({ where: { workspaceId } });
      const entries = await tx.creditLedgerEntry.findMany({ where: { workspaceId } });
      // Idempotent settle (§4): a reservation settles exactly once. A retried or
      // concurrent settle of an already-finalized entry is a no-op — never throw,
      // never double-apply. (The aggregate still guards the live reserved→terminal
      // transition below; this guard just makes a repeat harmless.)
      const entry = entries.find((e) => e.reservationKey === key);
      if (!entry || entry.status !== "reserved") return;
      const agg = new CreditAccount(
        workspaceId,
        account.balance,
        new Map(
          entries.map((e) => [e.reservationKey, { key: e.reservationKey, cost: e.cost, status: e.status }]),
        ),
      );
      if (action === "commit") agg.commit(key);
      else agg.refund(key);
      await tx.creditAccount.update({ where: { workspaceId }, data: { balance: agg.available } });
      await tx.creditLedgerEntry.update({
        where: { workspaceId_reservationKey: { workspaceId, reservationKey: key } },
        data: { status: action === "commit" ? "committed" : "refunded", settledAt: new Date() },
      });
    });
  }

  /**
   * Set the monthly submission allotment to match a plan (F8). Called by the billing
   * webhook when a workspace changes plan so the new tier's limits take effect
   * immediately. Reads the allotment from the Plan reference table — no hardcoded
   * constants. Goes through the CreditAccount aggregate's renew() — never a raw
   * balance write (§4) — so an in-flight reservation survives the change.
   *
   * Supports all PlanTier values including solo_pro. When a STRIPE_SOLO_PRICE_ID →
   * solo_pro mapping ships, the billing webhook can call this with plan="solo_pro"
   * and the correct allotment is already in the Plan table.
   * TODO: add STRIPE_SOLO_PRICE_ID → solo_pro mapping in billing.service.ts when
   * Solo Pro checkout ships (the createCheckout + setPlanByCustomer paths).
   */
  async applyPlanAllotment(workspaceId: string, plan: PlanTier): Promise<void> {
    // Read the monthly allotment from the Plan reference table. Throw clearly if the
    // plan row is missing (a seed/config error, not a runtime invariant).
    const planRow = await this.prisma.plan.findUnique({
      where: { tier: plan },
      select: { monthlySubmissionAllotment: true },
    });
    if (!planRow) {
      throw new NotFoundException(`plan row missing for tier=${plan}; run the seed to populate the plan table`);
    }
    const allotment = planRow.monthlySubmissionAllotment;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM credit_account WHERE workspace_id = ${workspaceId} FOR UPDATE`;
      const account = await tx.creditAccount.findUnique({ where: { workspaceId } });
      if (!account) return;
      const entries = await tx.creditLedgerEntry.findMany({ where: { workspaceId } });
      const agg = new CreditAccount(
        workspaceId,
        account.balance,
        new Map(
          entries.map((e) => [e.reservationKey, { key: e.reservationKey, cost: e.cost, status: e.status }]),
        ),
      );
      agg.renew(allotment); // balance = allotment − outstanding reservations
      await tx.creditAccount.update({
        where: { workspaceId },
        data: { monthlyAllotment: allotment, balance: agg.available, lastGrantedAt: new Date() },
      });
    });
  }
}

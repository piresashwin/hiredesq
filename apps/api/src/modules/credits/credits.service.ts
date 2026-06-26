import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreditBalanceDto, PlanTier } from "@hiredesq/shared";
import { CreditAccount, canParseFree, INGEST_FREE_LIMIT } from "@hiredesq/core";
import { PrismaService } from "../../common/prisma.service.js";
import { isNewDay, startOfNextDay } from "./day-period.js";

// Free tier: 5 submission generations/day (Model B, §F3). Team: effectively
// unlimited for a small team — the meter stays honest (still reserve→commit) but
// never caps real use. Ingest is already unmetered for non-free (hasIngestQuota).
const FREE_DAILY_ALLOTMENT = 5;
const TEAM_DAILY_ALLOTMENT = 10_000;

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lazily renew the free-tier daily allotment at a UTC calendar-day boundary
   * (CLAUDE.md §4). The balance is mutated ONLY through the CreditAccount aggregate
   * (load state → renew → persist) — never a raw `balance:` write. Locks the
   * account row FOR UPDATE so a concurrent grant/reserve can't double-apply, and is
   * idempotent within a day (a second call in the same day is a no-op). Ledger
   * entries are left untouched (a grant resets the available balance, not history).
   */
  async ensureDailyGrant(workspaceId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Row lock — predicate carries workspace_id (§1). Serializes grant vs the
      // worker's reserve/settle on the same account under Read-Committed.
      await tx.$queryRaw`SELECT id FROM credit_account WHERE workspace_id = ${workspaceId} FOR UPDATE`;

      const account = await tx.creditAccount.findUnique({
        where: { workspaceId },
        select: { balance: true, dailyAllotment: true, lastGrantedAt: true },
      });
      // No account (shouldn't happen for a live workspace) — nothing to renew.
      if (!account) return;

      const now = new Date();
      if (!isNewDay(account.lastGrantedAt, now)) return; // already granted today

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
      agg.renew(account.dailyAllotment);

      await tx.creditAccount.update({
        where: { workspaceId },
        data: { balance: agg.available, lastGrantedAt: now },
      });
    });
  }

  async getBalance(workspaceId: string): Promise<CreditBalanceDto> {
    // Renew first so the reported balance reflects a crossed day boundary.
    await this.ensureDailyGrant(workspaceId);

    // Tenant-scoped: the account is keyed by workspaceId (§1).
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        creditAccount: {
          select: { balance: true, dailyAllotment: true, ingestUsedLifetime: true },
        },
      },
    });
    if (!workspace) throw new NotFoundException("workspace not found");

    const balance = workspace.creditAccount?.balance ?? 0;
    const dailyAllotment = workspace.creditAccount?.dailyAllotment ?? 0;
    return {
      balance,
      dailyAllotment,
      used: Math.max(0, dailyAllotment - balance),
      resetsAt: startOfNextDay(new Date()).toISOString(),
      plan: workspace.plan,
      // Model B ingest meter (§F3): resume parsing is free up to this lifetime cap.
      ingestUsedLifetime: workspace.creditAccount?.ingestUsedLifetime ?? 0,
      ingestFreeLimit: INGEST_FREE_LIMIT,
    };
  }

  /**
   * Advisory pre-check for the DAILY credit meter (§4) — used by the submission
   * generation path (Model B: the daily credits gate generation, not ingest).
   * Renews any due grant, then reports whether the workspace can afford `cost`.
   * The synchronous reserve in the submissions service remains the true gate.
   */
  async hasCreditsFor(workspaceId: string, cost: number): Promise<boolean> {
    await this.ensureDailyGrant(workspaceId);
    const account = await this.prisma.creditAccount.findUnique({
      where: { workspaceId },
      select: { balance: true },
    });
    return (account?.balance ?? 0) >= cost;
  }

  /**
   * Advisory pre-check for the INGEST (parse) paths (Model B, §F3). Parsing is free,
   * but the free tier is capped by a lifetime onboarding/abuse quota — so a backlog
   * dump never paywalls on day 1, while abuse hits a ceiling. Paid plans are
   * unmetered. The worker's `reserveIngestSlot` is the true gate; this enables a
   * graceful 402 with the right copy.
   */
  async hasIngestQuota(workspaceId: string): Promise<boolean> {
    const account = await this.prisma.creditAccount.findUnique({
      where: { workspaceId },
      select: { ingestUsedLifetime: true, workspace: { select: { plan: true } } },
    });
    if (!account) return false;
    if (account.workspace.plan !== "free") return true; // paid: unmetered
    return canParseFree(account.ingestUsedLifetime);
  }

  /**
   * Reserve `cost` DAILY credits for a generative action (Model B: submission
   * generation, §4). Balance is mutated ONLY through the CreditAccount aggregate;
   * the account row is locked FOR UPDATE so concurrent reserves can't oversell, and
   * it's idempotent on `key`. Renews any due daily grant first. Throws
   * InsufficientCreditsError when the daily allotment is exhausted.
   */
  async reserve(workspaceId: string, key: string, cost: number): Promise<void> {
    await this.ensureDailyGrant(workspaceId);
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
   * Set the daily submission allotment to match a plan (F8). Called by the billing
   * webhook when a workspace flips free↔team so the paid tier actually delivers
   * (free = 5/day; team ≈ unlimited). Goes through the CreditAccount aggregate's
   * renew() — never a raw balance write (§4) — so an in-flight reservation survives
   * the change, and applies the new balance immediately (the upgrade is instant).
   */
  async applyPlanAllotment(workspaceId: string, plan: PlanTier): Promise<void> {
    const allotment = plan === "team" ? TEAM_DAILY_ALLOTMENT : FREE_DAILY_ALLOTMENT;
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
        data: { dailyAllotment: allotment, balance: agg.available, lastGrantedAt: new Date() },
      });
    });
  }
}

/**
 * Credit ledger aggregate (CLAUDE.md §4). Guards its own invariants so no service
 * can just decrement a balance:
 *   - balance never goes negative
 *   - reserve → commit / refund lifecycle (a reservation settles exactly once)
 *   - idempotent by reservation key (a retried parse doesn't double-charge)
 *
 * This is pure domain logic. Persistence (loading the account, appending ledger
 * rows in a transaction) lives in a repository in apps/api or apps/worker — the
 * repo loads state into this aggregate, calls a method, and persists the result.
 */

export class InsufficientCreditsError extends Error {
  constructor(available: number, requested: number) {
    super(`insufficient credits: have ${available}, need ${requested}`);
    this.name = "InsufficientCreditsError";
  }
}

export type ReservationStatus = "reserved" | "committed" | "refunded";

export interface Reservation {
  key: string; // idempotency key — e.g. the parse job's content hash
  cost: number;
  status: ReservationStatus;
}

export class CreditAccount {
  constructor(
    readonly workspaceId: string,
    private balance: number,
    private readonly reservations: Map<string, Reservation>,
  ) {}

  get available(): number {
    return this.balance;
  }

  /** Reserve `cost` credits. Idempotent on `key`: a repeat returns the existing one. */
  reserve(key: string, cost: number): Reservation {
    const existing = this.reservations.get(key);
    if (existing) return existing; // idempotent — no double charge on retry

    if (cost > this.balance) {
      throw new InsufficientCreditsError(this.balance, cost);
    }
    this.balance -= cost;
    const reservation: Reservation = { key, cost, status: "reserved" };
    this.reservations.set(key, reservation);
    return reservation;
  }

  /**
   * Renew the free-tier allotment — reset the available balance to the allotment
   * (use-it-or-lose-it: yesterday's consumption is wiped, credits do NOT roll
   * over). The CALLER decides *when* (a new period — a new UTC day — tracked by
   * lastGrantedAt); the aggregate just applies it, so balance is still only ever
   * mutated through the domain, never a direct row write (§4).
   *
   * Outstanding (still-`reserved`) credits are subtracted from the renewed pool
   * so the invariant `available + Σ outstanding reservations == allotment` holds
   * across the renewal — otherwise a parse reserved before the reset would, on
   * its later commit/refund, mint or lose a credit (it deducted from the old
   * balance the reset just overwrote). Never goes negative.
   */
  renew(allotment: number): void {
    if (allotment < 0) throw new Error("allotment cannot be negative");
    let outstanding = 0;
    for (const r of this.reservations.values()) {
      if (r.status === "reserved") outstanding += r.cost;
    }
    this.balance = Math.max(0, allotment - outstanding);
  }

  /** Finalize the charge for a successful action. */
  commit(key: string): void {
    const r = this.requireReserved(key);
    r.status = "committed";
  }

  /** Return credits for a failed action — never charge for work with no result. */
  refund(key: string): void {
    const r = this.requireReserved(key);
    this.balance += r.cost;
    r.status = "refunded";
  }

  private requireReserved(key: string): Reservation {
    const r = this.reservations.get(key);
    if (!r) throw new Error(`no reservation for key ${key}`);
    if (r.status !== "reserved") {
      throw new Error(`reservation ${key} already ${r.status}`);
    }
    return r;
  }
}

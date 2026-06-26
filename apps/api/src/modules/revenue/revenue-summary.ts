import { Prisma } from "@hiredesq/database";
import type { PlacementStatus } from "@hiredesq/shared";
import { Money } from "@hiredesq/core";
import { effectivePlacementStatus, isLive } from "../placements/guarantee.js";

// Pure revenue-summary math (no Prisma I/O) so recognition + month bucketing are
// deterministically unit-testable with a fixed `now`. All sums go through the Money
// value object (Decimal, never JS float — CLAUDE.md §3), so every reported number
// reconciles EXACTLY with the placement rows behind it.

/** The fields of a placement row the summary needs. */
export interface PlacementForSummary {
  feeAmount: Prisma.Decimal;
  placedAt: Date;
  status: PlacementStatus;
  clearsAt: Date;
  /** Pro-rated amount retained on a fall-through (earned); null otherwise. */
  retainedAmount: Prisma.Decimal | null;
}

export interface Recognition {
  /** EARNED: cleared fees + the retained portion of fall-throughs. The only "final" number. */
  revenueCleared: string;
  /** Booked but still inside the guarantee window. Not yet earned (§2E). */
  revenueAtRisk: string;
  /** Live placements (cleared + at-risk) created in `now`'s calendar month. */
  placementsThisMonth: number;
  /** Mean fee across live placements, "0.00" when none. */
  avgFee: string;
}

/** "YYYY-MM" key for a date in UTC (months are UTC calendar months for v1). */
export function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = `${d.getUTCMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

function fixed2(money: Money): string {
  // Money.toString() drops trailing zeros; the boundary always pads to the
  // currency's 2 minor digits ("0.00", "12000.00").
  return new Prisma.Decimal(money.round().toString()).toFixed(2);
}

/**
 * Guarantee-aware recognition (§2E / CLAUDE.md §3). Per placement, by EFFECTIVE
 * status (an at_risk placement past its window reads as cleared):
 *   - cleared   → fee counts as EARNED.
 *   - at_risk   → fee counts as AT-RISK (booked, not earned).
 *   - fell_through → only the RETAINED (pro-rated) portion is earned; the rest is
 *                    reversed. Full reversal retains nothing.
 *   - replaced  → contributes nothing (its fee was carried to the replacement, so
 *                 the chain's fee is counted exactly once, on the live replacement).
 * avgFee/count are over LIVE placements only (cleared + at-risk).
 */
export function recognition(
  placements: PlacementForSummary[],
  currency: string,
  now: Date,
): Recognition {
  const key = monthKey(now);
  let cleared = Money.zero(currency);
  let atRisk = Money.zero(currency);
  let liveTotal = Money.zero(currency);
  let liveCount = 0;
  let monthCount = 0;

  for (const p of placements) {
    const fee = Money.of(p.feeAmount.toString(), currency);
    const eff = effectivePlacementStatus(p.status, p.clearsAt, now);

    if (eff === "cleared") {
      cleared = cleared.add(fee);
    } else if (eff === "at_risk") {
      atRisk = atRisk.add(fee);
    } else if (eff === "fell_through") {
      // The retained portion of a pro-rated refund is settled, earned money.
      const retained = p.retainedAmount
        ? Money.of(p.retainedAmount.toString(), currency)
        : Money.zero(currency);
      cleared = cleared.add(retained);
    }
    // `replaced` contributes nothing.

    if (isLive(eff)) {
      liveTotal = liveTotal.add(fee);
      liveCount += 1;
      if (monthKey(p.placedAt) === key) monthCount += 1;
    }
  }

  const avg = liveCount === 0 ? Money.zero(currency) : liveTotal.times(new Prisma.Decimal(1).div(liveCount));
  return {
    revenueCleared: fixed2(cleared),
    revenueAtRisk: fixed2(atRisk),
    placementsThisMonth: monthCount,
    avgFee: fixed2(avg),
  };
}

/**
 * Booked revenue per month for the last 6 calendar months, oldest → newest, over
 * LIVE placements only (reversed/superseded fees excluded). Every month in the
 * window is present (zero-filled) so the trend chart has no gaps.
 */
export function monthlyTrend(
  placements: PlacementForSummary[],
  currency: string,
  now: Date,
): { month: string; revenue: string }[] {
  const months: string[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d));
  }

  const sums = new Map<string, Money>();
  for (const m of months) sums.set(m, Money.zero(currency));
  for (const p of placements) {
    if (!isLive(effectivePlacementStatus(p.status, p.clearsAt, now))) continue;
    const acc = sums.get(monthKey(p.placedAt));
    if (!acc) continue; // outside the 6-month window
    sums.set(monthKey(p.placedAt), acc.add(Money.of(p.feeAmount.toString(), currency)));
  }

  return months.map((m) => ({ month: m, revenue: fixed2(sums.get(m) as Money) }));
}

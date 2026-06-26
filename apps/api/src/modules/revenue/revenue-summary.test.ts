import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@hiredesq/database";
import type { PlacementStatus } from "@hiredesq/shared";
import { monthKey, monthlyTrend, recognition, type PlacementForSummary } from "./revenue-summary.js";

// Guarantee-aware recognition (§2E) + month bucketing, with a FIXED `now`. Sums go
// through Money (Decimal, never float — §3), so cleared/at-risk reconcile EXACTLY
// with the placement rows: a fall-through reverses to the cent, a replacement
// carries the fee exactly once.

// Fixed reference point: mid-June 2026.
const NOW = new Date("2026-06-16T12:00:00.000Z");

function p(
  feeAmount: string,
  placedAt: string,
  opts: { status?: PlacementStatus; clearsAt?: string; retained?: string } = {},
): PlacementForSummary {
  const placed = new Date(placedAt);
  return {
    feeAmount: new Prisma.Decimal(feeAmount),
    placedAt: placed,
    status: opts.status ?? "at_risk",
    clearsAt: new Date(opts.clearsAt ?? new Date(placed.getTime() + 30 * 86_400_000).toISOString()),
    retainedAmount: opts.retained ? new Prisma.Decimal(opts.retained) : null,
  };
}

describe("monthKey", () => {
  it("buckets by UTC calendar month", () => {
    assert.equal(monthKey(new Date("2026-06-30T23:59:59.000Z")), "2026-06");
    assert.equal(monthKey(new Date("2026-01-05T00:00:00.000Z")), "2026-01");
  });
});

describe("recognition", () => {
  it("splits cleared (window elapsed) vs at-risk (within window)", () => {
    const rec = recognition(
      [
        p("12000.00", "2026-04-01T00:00:00.000Z", { clearsAt: "2026-05-01T00:00:00.000Z" }), // past → cleared
        p("8000.00", "2026-06-10T00:00:00.000Z", { clearsAt: "2026-07-10T00:00:00.000Z" }), // within → at-risk
      ],
      "USD",
      NOW,
    );
    assert.equal(rec.revenueCleared, "12000.00");
    assert.equal(rec.revenueAtRisk, "8000.00");
  });

  it("recognizes an at_risk placement past its window as cleared (no stored flip needed)", () => {
    const rec = recognition(
      [p("5000.00", "2026-04-01T00:00:00.000Z", { status: "at_risk", clearsAt: "2026-05-01T00:00:00.000Z" })],
      "USD",
      NOW,
    );
    assert.equal(rec.revenueCleared, "5000.00");
    assert.equal(rec.revenueAtRisk, "0.00");
  });

  it("fully reverses a fall-through (nothing retained → earns nothing)", () => {
    const rec = recognition([p("10000.00", "2026-06-05T00:00:00.000Z", { status: "fell_through" })], "USD", NOW);
    assert.equal(rec.revenueCleared, "0.00");
    assert.equal(rec.revenueAtRisk, "0.00");
  });

  it("keeps the retained portion of a pro-rated fall-through as earned, to the cent", () => {
    const rec = recognition(
      [p("10000.00", "2026-06-05T00:00:00.000Z", { status: "fell_through", retained: "4000.00" })],
      "USD",
      NOW,
    );
    assert.equal(rec.revenueCleared, "4000.00"); // retained = earned
    assert.equal(rec.revenueAtRisk, "0.00"); // the reversed 6000 is gone
  });

  it("counts a replacement's fee exactly once — original replaced=0, replacement carries it", () => {
    const rec = recognition(
      [
        p("20000.00", "2026-05-01T00:00:00.000Z", { status: "replaced", clearsAt: "2026-06-01T00:00:00.000Z" }),
        p("20000.00", "2026-06-12T00:00:00.000Z", { status: "at_risk", clearsAt: "2026-07-12T00:00:00.000Z" }), // carried
      ],
      "USD",
      NOW,
    );
    assert.equal(rec.revenueCleared, "0.00"); // replaced contributes nothing
    assert.equal(rec.revenueAtRisk, "20000.00"); // counted once, on the live replacement
  });

  it("avg + this-month count are over LIVE placements only (reversed excluded)", () => {
    const rec = recognition(
      [
        p("12000.00", "2026-06-02T00:00:00.000Z"), // at_risk, this month, live
        p("8000.00", "2026-06-15T00:00:00.000Z"), // at_risk, this month, live
        p("5000.00", "2026-06-05T00:00:00.000Z", { status: "fell_through" }), // this month, NOT live
      ],
      "USD",
      NOW,
    );
    assert.equal(rec.placementsThisMonth, 2);
    assert.equal(rec.avgFee, "10000.00"); // (12000 + 8000) / 2, fell-through excluded
  });
});

describe("monthlyTrend", () => {
  it("returns 6 zero-filled months oldest→newest, live placements only", () => {
    const trend = monthlyTrend(
      [
        p("1000.00", "2026-06-10T00:00:00.000Z"), // 2026-06 at_risk
        p("2000.00", "2026-06-20T00:00:00.000Z"), // 2026-06 at_risk (sums)
        p("3000.00", "2026-04-01T00:00:00.000Z", { status: "fell_through" }), // reversed → excluded
        p("9999.00", "2025-12-31T00:00:00.000Z"), // outside the window
      ],
      "USD",
      NOW,
    );
    assert.deepEqual(
      trend.map((m) => m.month),
      ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"],
    );
    assert.equal(trend.find((m) => m.month === "2026-06")?.revenue, "3000.00");
    assert.equal(trend.find((m) => m.month === "2026-04")?.revenue, "0.00"); // fell-through excluded
  });
});

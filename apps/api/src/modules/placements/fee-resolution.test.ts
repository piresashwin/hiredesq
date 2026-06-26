import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FeeResolutionError, resolveFee } from "./fee-resolution.js";

// Fee resolution goes through the Money value object (Decimal, never JS float —
// CLAUDE.md §3). The resolved string is what's stored in Placement.feeAmount, so
// these values are exactly what the revenue hero sums back up.
describe("resolveFee", () => {
  it("resolves a flat fee, padded to 2dp", () => {
    assert.equal(resolveFee({ basis: "flat", currency: "USD", amount: "12000" }), "12000.00");
    assert.equal(resolveFee({ basis: "flat", currency: "USD", amount: "12000.50" }), "12000.50");
  });

  it("resolves percent_of_salary without float drift", () => {
    // 8.33% of 120000 = 9996.00 exactly (float would drift).
    assert.equal(
      resolveFee({ basis: "percent_of_salary", currency: "USD", salary: "120000", percent: "8.33" }),
      "9996.00",
    );
    // 15% of 90000 = 13500.00.
    assert.equal(
      resolveFee({ basis: "percent_of_salary", currency: "USD", salary: "90000", percent: "15" }),
      "13500.00",
    );
  });

  it("rounds half-up to 2dp", () => {
    // 33.333% of 100 = 33.333 → 33.33.
    assert.equal(
      resolveFee({ basis: "percent_of_salary", currency: "USD", salary: "100", percent: "33.333" }),
      "33.33",
    );
    // 12.5% of 101 = 12.625 → 12.63 (half-up).
    assert.equal(
      resolveFee({ basis: "percent_of_salary", currency: "USD", salary: "101", percent: "12.5" }),
      "12.63",
    );
  });

  it("rejects a flat fee with no amount", () => {
    assert.throws(() => resolveFee({ basis: "flat", currency: "USD" }), FeeResolutionError);
  });

  it("rejects a percent_of_salary fee missing salary or percent", () => {
    assert.throws(
      () => resolveFee({ basis: "percent_of_salary", currency: "USD", salary: "90000" }),
      FeeResolutionError,
    );
    assert.throws(
      () => resolveFee({ basis: "percent_of_salary", currency: "USD", percent: "10" }),
      FeeResolutionError,
    );
  });
});

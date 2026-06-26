import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Money } from "./money.js";

// Money value object — Decimal arithmetic, never JS float (CLAUDE.md §3). These
// cover the math the weighted pipeline value relies on (fee × stage probability
// × count), where naive float would drift (0.1 + 0.2 !== 0.3). Money.toString()
// is the canonical (unpadded) Decimal serialization; boundary padding to the
// currency minor unit happens in the API layer.
describe("Money", () => {
  it("scales by a factor without float drift (times)", () => {
    // 10000 × 0.1 (sourced probability) = 1000 exactly.
    assert.equal(Money.of("10000.00", "USD").times(0.1).round().toString(), "1000");
    // 5000 × 0.3 (submitted) = 1500.
    assert.equal(Money.of("5000.00", "USD").times(0.3).round().toString(), "1500");
  });

  it("sums weighted contributions exactly (the pipeline-value shape)", () => {
    const fee = Money.of("10000.00", "USD");
    // 2 sourced (0.1) + 1 interview (0.6): 2×1000 + 1×6000 = 8000.
    const total = Money.zero("USD")
      .add(fee.times(0.1).times(2))
      .add(fee.times(0.6).times(1));
    assert.equal(total.round().toString(), "8000");
  });

  it("rounds half-up to the minor unit", () => {
    // 333.33 × 0.1 = 33.333 → 33.33.
    assert.equal(Money.of("333.33", "USD").times(0.1).round().toString(), "33.33");
    // 100.05 × 0.5 = 50.025 → 50.03 (half-up).
    assert.equal(Money.of("100.05", "USD").times(0.5).round().toString(), "50.03");
  });

  it("keeps currency through scaling", () => {
    assert.equal(Money.of("100", "EUR").times(0.6).currency, "EUR");
  });

  it("zero scales to zero (a null-fee job)", () => {
    assert.equal(Money.zero("GBP").times(0.6).round().toString(), "0");
  });
});

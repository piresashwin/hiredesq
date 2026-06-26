import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeClearsAt, effectivePlacementStatus, isLive } from "./guarantee.js";

describe("computeClearsAt", () => {
  it("adds the guarantee window to placedAt", () => {
    const placed = new Date("2026-06-01T00:00:00.000Z");
    assert.equal(computeClearsAt(placed, 30).toISOString(), "2026-07-01T00:00:00.000Z");
  });
});

describe("effectivePlacementStatus", () => {
  const clearsAt = new Date("2026-06-15T00:00:00.000Z");

  it("reads at_risk as cleared once the window has elapsed (no stored flip)", () => {
    const after = new Date("2026-06-16T00:00:00.000Z");
    assert.equal(effectivePlacementStatus("at_risk", clearsAt, after), "cleared");
  });

  it("keeps at_risk while still inside the window", () => {
    const before = new Date("2026-06-14T00:00:00.000Z");
    assert.equal(effectivePlacementStatus("at_risk", clearsAt, before), "at_risk");
  });

  it("passes terminal/explicit states through unchanged", () => {
    const after = new Date("2026-06-16T00:00:00.000Z");
    assert.equal(effectivePlacementStatus("fell_through", clearsAt, after), "fell_through");
    assert.equal(effectivePlacementStatus("replaced", clearsAt, after), "replaced");
    assert.equal(effectivePlacementStatus("cleared", clearsAt, after), "cleared");
  });
});

describe("isLive", () => {
  it("treats cleared + at_risk as live; reversed/superseded as not", () => {
    assert.equal(isLive("at_risk"), true);
    assert.equal(isLive("cleared"), true);
    assert.equal(isLive("fell_through"), false);
    assert.equal(isLive("replaced"), false);
  });
});

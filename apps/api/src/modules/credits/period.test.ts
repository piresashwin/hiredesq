import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dayKey, isNewDay, startOfNextDay, monthKey, isNewMonth, startOfNextMonth } from "./period.js";

// ─── Day helpers (kept for any future daily-bounded feature) ──────────────

describe("dayKey", () => {
  it("formats a UTC YYYY-MM-DD key", () => {
    assert.equal(dayKey(new Date("2026-06-17T12:00:00Z")), "2026-06-17");
    assert.equal(dayKey(new Date("2026-01-01T00:00:00Z")), "2026-01-01");
  });

  it("uses UTC, not local time, at the day boundary", () => {
    // 2026-07-01T00:30+02:00 is still June 30 in UTC (2026-06-30T22:30Z).
    assert.equal(dayKey(new Date("2026-07-01T00:30:00+02:00")), "2026-06-30");
  });
});

describe("isNewDay", () => {
  it("is true when never granted", () => {
    assert.equal(isNewDay(null, new Date("2026-06-17T00:00:00Z")), true);
  });

  it("is false within the same UTC day (idempotent re-grant guard)", () => {
    const last = new Date("2026-06-17T00:00:01Z");
    const now = new Date("2026-06-17T23:59:59Z");
    assert.equal(isNewDay(last, now), false);
  });

  it("is true once the UTC day rolls over", () => {
    const last = new Date("2026-06-17T23:59:59Z");
    const now = new Date("2026-06-18T00:00:00Z");
    assert.equal(isNewDay(last, now), true);
  });

  it("crosses a month boundary", () => {
    assert.equal(
      isNewDay(new Date("2026-06-30T23:59:59Z"), new Date("2026-07-01T00:00:00Z")),
      true,
    );
  });

  it("crosses a year boundary", () => {
    assert.equal(
      isNewDay(new Date("2026-12-31T23:59:59Z"), new Date("2027-01-01T00:00:00Z")),
      true,
    );
  });
});

describe("startOfNextDay", () => {
  it("returns the first instant of the next UTC day", () => {
    assert.equal(
      startOfNextDay(new Date("2026-06-17T12:00:00Z")).toISOString(),
      "2026-06-18T00:00:00.000Z",
    );
  });

  it("rolls over the month at the end of the month", () => {
    assert.equal(
      startOfNextDay(new Date("2026-06-30T23:59:59Z")).toISOString(),
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("rolls over the year on December 31", () => {
    assert.equal(
      startOfNextDay(new Date("2026-12-31T23:59:59Z")).toISOString(),
      "2027-01-01T00:00:00.000Z",
    );
  });
});

// ─── Month helpers ────────────────────────────────────────────────────────

describe("monthKey", () => {
  it("formats a UTC YYYY-MM key", () => {
    assert.equal(monthKey(new Date("2026-06-17T12:00:00Z")), "2026-06");
    assert.equal(monthKey(new Date("2026-01-01T00:00:00Z")), "2026-01");
    assert.equal(monthKey(new Date("2026-12-31T23:59:59Z")), "2026-12");
  });

  it("uses UTC, not local time, at a month boundary", () => {
    // 2026-07-01T00:30+02:00 is still June in UTC (2026-06-30T22:30Z).
    assert.equal(monthKey(new Date("2026-07-01T00:30:00+02:00")), "2026-06");
  });

  it("pads single-digit months", () => {
    assert.equal(monthKey(new Date("2026-03-15T00:00:00Z")), "2026-03");
  });
});

describe("isNewMonth", () => {
  it("is true when never granted", () => {
    assert.equal(isNewMonth(null, new Date("2026-06-17T00:00:00Z")), true);
  });

  it("is false within the same UTC month (idempotent re-grant guard)", () => {
    const last = new Date("2026-06-01T00:00:01Z");
    const now = new Date("2026-06-30T23:59:59Z");
    assert.equal(isNewMonth(last, now), false);
  });

  it("is true once the UTC month rolls over", () => {
    const last = new Date("2026-06-30T23:59:59Z");
    const now = new Date("2026-07-01T00:00:00Z");
    assert.equal(isNewMonth(last, now), true);
  });

  it("crosses a year boundary", () => {
    assert.equal(
      isNewMonth(new Date("2026-12-31T23:59:59Z"), new Date("2027-01-01T00:00:00Z")),
      true,
    );
  });

  it("is false on the same day the grant was made (within-month idempotency)", () => {
    const last = new Date("2026-06-15T08:00:00Z");
    const now = new Date("2026-06-15T09:00:00Z");
    assert.equal(isNewMonth(last, now), false);
  });
});

describe("startOfNextMonth", () => {
  it("returns the first instant of the next UTC month", () => {
    assert.equal(
      startOfNextMonth(new Date("2026-06-17T12:00:00Z")).toISOString(),
      "2026-07-01T00:00:00.000Z",
    );
  });

  it("rolls over the year on December", () => {
    assert.equal(
      startOfNextMonth(new Date("2026-12-31T23:59:59Z")).toISOString(),
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("handles end-of-month correctly (no off-by-one)", () => {
    assert.equal(
      startOfNextMonth(new Date("2026-01-31T23:59:59Z")).toISOString(),
      "2026-02-01T00:00:00.000Z",
    );
  });

  it("handles February → March correctly", () => {
    assert.equal(
      startOfNextMonth(new Date("2028-02-29T12:00:00Z")).toISOString(),
      "2028-03-01T00:00:00.000Z",
    );
  });
});

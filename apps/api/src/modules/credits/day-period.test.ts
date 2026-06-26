import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dayKey, isNewDay, startOfNextDay } from "./day-period.js";

// Day-boundary helpers for the lazy daily credit grant (CLAUDE.md §4).
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

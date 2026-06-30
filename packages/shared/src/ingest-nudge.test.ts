import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ingestNudgeLevel,
  ingestBannerThresholdCount,
  INGEST_NUDGE_SUBTLE,
  INGEST_NUDGE_BANNER,
} from "./ingest-nudge.js";

// Escalating ingest-quota upgrade nudge (CLAUDE.md §4/§5): none → subtle → banner → wall.
describe("ingestNudgeLevel", () => {
  it("never nudges an unmetered (paid) workspace", () => {
    assert.equal(ingestNudgeLevel(0, null), "none");
    assert.equal(ingestNudgeLevel(10_000, null), "none");
    // A nonsensical zero/negative ceiling is treated as unmetered, not div-by-zero.
    assert.equal(ingestNudgeLevel(5, 0), "none");
  });

  it("stays quiet below the subtle threshold", () => {
    // 500-parse free ceiling: 74% < 75% → none.
    assert.equal(ingestNudgeLevel(370, 500), "none");
  });

  it("shows the subtle meter from 75% up to (not incl.) the banner threshold", () => {
    assert.equal(ingestNudgeLevel(375, 500), "subtle"); // exactly 75%
    assert.equal(ingestNudgeLevel(449, 500), "subtle"); // 89.8%
  });

  it("escalates to the banner at/above 90% and below the ceiling", () => {
    assert.equal(ingestNudgeLevel(450, 500), "banner"); // exactly 90%
    assert.equal(ingestNudgeLevel(499, 500), "banner");
  });

  it("hits the wall at and beyond the ceiling", () => {
    assert.equal(ingestNudgeLevel(500, 500), "wall");
    assert.equal(ingestNudgeLevel(640, 500), "wall");
  });

  it("uses the configured ratios (not hard-coded counts) for any tier", () => {
    // solo_pro monthly ceiling of 200.
    assert.equal(ingestNudgeLevel(Math.ceil(200 * INGEST_NUDGE_SUBTLE), 200), "subtle"); // 150
    assert.equal(ingestNudgeLevel(Math.ceil(200 * INGEST_NUDGE_BANNER), 200), "banner"); // 180
  });
});

describe("ingestBannerThresholdCount", () => {
  it("is the first integer count that reaches the banner ratio", () => {
    assert.equal(ingestBannerThresholdCount(500), 450); // ceil(450)
    assert.equal(ingestBannerThresholdCount(200), 180);
    // ceil rounds a fractional threshold up, so the count it returns is itself "banner".
    assert.equal(ingestBannerThresholdCount(333), 300); // ceil(299.7)
    assert.equal(ingestNudgeLevel(ingestBannerThresholdCount(333), 333), "banner");
  });
});

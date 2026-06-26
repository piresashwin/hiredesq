import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verdictLabel, verdictToStage, verdictToTrailKind } from "./verdict.js";

// Client-feedback loop (§2D, F5): a verdict auto-nudges the stage FORWARD only.
describe("verdictToStage", () => {
  it("moves an early live stage forward to interview on advance/interview", () => {
    assert.equal(verdictToStage("sourced", "advance"), "interview");
    assert.equal(verdictToStage("submitted", "interview"), "interview");
    assert.equal(verdictToStage("submitted", "advance"), "interview");
  });

  it("moves any non-placed application to rejected on reject", () => {
    assert.equal(verdictToStage("submitted", "reject"), "rejected");
    assert.equal(verdictToStage("interview", "reject"), "rejected");
  });

  it("never disturbs a booked win", () => {
    assert.equal(verdictToStage("placed", "reject"), null);
    assert.equal(verdictToStage("placed", "advance"), null);
  });

  it("does not re-open or redundantly move a closed/later stage", () => {
    assert.equal(verdictToStage("interview", "advance"), null); // already there
    assert.equal(verdictToStage("rejected", "reject"), null); // already rejected
    assert.equal(verdictToStage("rejected", "advance"), null); // don't auto-reopen
  });
});

describe("verdictToTrailKind", () => {
  it("qualifies on a positive verdict, disqualifies on reject", () => {
    assert.equal(verdictToTrailKind("advance"), "qualified");
    assert.equal(verdictToTrailKind("interview"), "qualified");
    assert.equal(verdictToTrailKind("reject"), "disqualified");
  });
});

describe("verdictLabel", () => {
  it("labels each verdict", () => {
    assert.equal(verdictLabel("advance"), "Advance");
    assert.equal(verdictLabel("interview"), "Interview");
    assert.equal(verdictLabel("reject"), "Reject");
  });
});

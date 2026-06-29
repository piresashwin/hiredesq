import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canParseFree, ingestQuotaRemaining, INGEST_FREE_LIMIT } from "./ingest-quota.js";

// Model B: ingest is free under a lifetime ceiling (the onboarding/abuse quota).
// canParseFree / ingestQuotaRemaining require an explicit limit — callers must
// null-check Plan.ingestFreeLimit first (null = unmetered, never call these).
describe("ingest quota", () => {
  it("allows parsing while under the limit (the backlog dump never paywalls)", () => {
    assert.equal(canParseFree(0, INGEST_FREE_LIMIT), true);
    assert.equal(canParseFree(INGEST_FREE_LIMIT - 1, INGEST_FREE_LIMIT), true);
  });

  it("stops free parsing once the lifetime limit is reached", () => {
    assert.equal(canParseFree(INGEST_FREE_LIMIT, INGEST_FREE_LIMIT), false);
    assert.equal(canParseFree(INGEST_FREE_LIMIT + 50, INGEST_FREE_LIMIT), false);
  });

  it("reports remaining quota, floored at zero", () => {
    assert.equal(ingestQuotaRemaining(0, INGEST_FREE_LIMIT), INGEST_FREE_LIMIT);
    assert.equal(ingestQuotaRemaining(INGEST_FREE_LIMIT - 10, INGEST_FREE_LIMIT), 10);
    assert.equal(ingestQuotaRemaining(INGEST_FREE_LIMIT + 5, INGEST_FREE_LIMIT), 0);
  });

  it("honors a custom limit (e.g. from Plan table for a different tier)", () => {
    assert.equal(canParseFree(5, 5), false);
    assert.equal(canParseFree(4, 5), true);
  });
});

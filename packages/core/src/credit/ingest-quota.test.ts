import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canParseFree, ingestQuotaRemaining, INGEST_FREE_LIMIT } from "./ingest-quota.js";

// Model B: ingest is free under a lifetime ceiling (the onboarding/abuse quota).
describe("ingest quota", () => {
  it("allows parsing while under the limit (the backlog dump never paywalls)", () => {
    assert.equal(canParseFree(0), true);
    assert.equal(canParseFree(INGEST_FREE_LIMIT - 1), true);
  });

  it("stops free parsing once the lifetime limit is reached", () => {
    assert.equal(canParseFree(INGEST_FREE_LIMIT), false);
    assert.equal(canParseFree(INGEST_FREE_LIMIT + 50), false);
  });

  it("reports remaining quota, floored at zero", () => {
    assert.equal(ingestQuotaRemaining(0), INGEST_FREE_LIMIT);
    assert.equal(ingestQuotaRemaining(INGEST_FREE_LIMIT - 10), 10);
    assert.equal(ingestQuotaRemaining(INGEST_FREE_LIMIT + 5), 0);
  });

  it("honors a custom limit (paid tiers / config)", () => {
    assert.equal(canParseFree(5, 5), false);
    assert.equal(canParseFree(4, 5), true);
  });
});

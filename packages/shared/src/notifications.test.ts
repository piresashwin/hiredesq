import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNotification } from "./notifications.js";

// buildNotification is the ONE shared copy/payload builder (api + worker). Copy is
// counts/ids only — never PII (§2). These guard the ingest-limit nudge case.
describe("buildNotification: ingest_limit_approaching", () => {
  it("frames the free (lifetime) ceiling as a permanent milestone to grow past", () => {
    const n = buildNotification("ingest_limit_approaching", {
      used: 450,
      limit: 500,
      period: "lifetime",
    });
    assert.equal(n.type, "ingest_limit_approaching");
    assert.match(n.body, /450 of 500/);
    assert.equal(n.data.link, "/settings/billing");
    assert.equal(n.data.period, "lifetime");
    // Counts only — no PII fields leak into the payload (§2).
    assert.deepEqual(Object.keys(n.data).sort(), ["limit", "link", "period", "used"]);
  });

  it("frames the monthly (solo_pro) ceiling as a resetting busy-month signal", () => {
    const n = buildNotification("ingest_limit_approaching", {
      used: 180,
      limit: 200,
      period: "monthly",
    });
    assert.match(n.body, /this month/);
    assert.match(n.body, /180 of 200/);
    assert.equal(n.data.period, "monthly");
  });
});

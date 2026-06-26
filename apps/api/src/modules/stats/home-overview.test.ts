import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clearingSoonWindow, CLEARING_SOON_DAYS } from "./home-overview.js";

describe("clearingSoonWindow", () => {
  const now = new Date("2026-06-23T00:00:00.000Z");

  it("starts at `now` so already-elapsed (effectively cleared) windows are excluded", () => {
    assert.deepEqual(clearingSoonWindow(now).gte, now);
  });

  it("ends `days` later (default 7)", () => {
    const { lt } = clearingSoonWindow(now);
    assert.deepEqual(lt, new Date("2026-06-30T00:00:00.000Z"));
    assert.equal((lt.getTime() - now.getTime()) / 86_400_000, CLEARING_SOON_DAYS);
  });

  it("honours a custom horizon", () => {
    const { lt } = clearingSoonWindow(now, 3);
    assert.deepEqual(lt, new Date("2026-06-26T00:00:00.000Z"));
  });
});

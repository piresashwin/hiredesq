import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CreditAccount, InsufficientCreditsError, type Reservation } from "./credit-ledger.js";

// Credit ledger aggregate invariants (CLAUDE.md §4).
function account(balance: number, entries: Reservation[] = []) {
  return new CreditAccount("ws_1", balance, new Map(entries.map((e) => [e.key, e])));
}

describe("CreditAccount", () => {
  it("reserves credits and decrements the balance", () => {
    const acct = account(10);
    const r = acct.reserve("hash-a", 1);
    assert.equal(r.status, "reserved");
    assert.equal(acct.available, 9);
  });

  it("is idempotent on the reservation key — a retry does not double-charge", () => {
    const acct = account(10);
    acct.reserve("hash-a", 1);
    acct.reserve("hash-a", 1); // same key again (a pg-boss retry)
    assert.equal(acct.available, 9); // charged once, not twice
  });

  it("never lets the balance go negative", () => {
    const acct = account(1);
    acct.reserve("hash-a", 1);
    assert.throws(() => acct.reserve("hash-b", 1), InsufficientCreditsError);
    assert.equal(acct.available, 0);
  });

  it("commit finalizes without changing the (already-debited) balance", () => {
    const acct = account(10);
    acct.reserve("hash-a", 3);
    acct.commit("hash-a");
    assert.equal(acct.available, 7);
  });

  it("refund returns the credits for a failed parse", () => {
    const acct = account(10);
    acct.reserve("hash-a", 3);
    acct.refund("hash-a");
    assert.equal(acct.available, 10); // never charged for work with no result
  });

  it("a reservation settles exactly once", () => {
    const acct = account(10);
    acct.reserve("hash-a", 1);
    acct.commit("hash-a");
    assert.throws(() => acct.commit("hash-a"), /already committed/);
    assert.throws(() => acct.refund("hash-a"), /already committed/);
  });

  it("rejects settling an unknown reservation", () => {
    const acct = account(10);
    assert.throws(() => acct.commit("nope"), /no reservation/);
  });

  it("renew resets the balance to the daily allotment (use-it-or-lose-it)", () => {
    const acct = account(2); // partly spent today
    acct.renew(5);
    assert.equal(acct.available, 5); // reset to the full daily allotment, not added
  });

  it("renew rejects a negative allotment", () => {
    const acct = account(5);
    assert.throws(() => acct.renew(-1), /allotment cannot be negative/);
    assert.equal(acct.available, 5); // unchanged on rejection
  });

  it("renew preserves an outstanding reservation across the daily reset", () => {
    // A parse reserved before the day boundary must survive the reset: the
    // renewed pool is allotment minus what's still reserved, so the later
    // commit/refund settles to exactly the allotment (no minted/lost credit).
    const acct = account(5);
    acct.reserve("in-flight", 1); // balance 5 → 4, entry `reserved`
    acct.renew(5); // new day — reset, but the reservation is still live
    assert.equal(acct.available, 4); // 5 allotment − 1 outstanding, not a blind 5
    acct.refund("in-flight"); // the in-flight parse failed
    assert.equal(acct.available, 5); // settles to exactly the allotment, no extra credit
  });

  it("renew wipes yesterday's committed consumption (no rollover)", () => {
    const acct = account(5);
    acct.reserve("spent", 4);
    acct.commit("spent"); // balance 1, committed (consumed yesterday)
    acct.renew(5); // new day → fresh allotment, yesterday's commits don't reduce it
    assert.equal(acct.available, 5);
  });
});

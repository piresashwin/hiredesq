import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseInboxAddress } from "./address.js";

const DOMAIN = "inbox.hiredesq.com";

describe("parseInboxAddress", () => {
  it("parses a plain inbox address into its token", () => {
    assert.deepEqual(parseInboxAddress("ab12cd@inbox.hiredesq.com", DOMAIN), { inboxToken: "ab12cd" });
  });

  it("parses plus-addressing into token + jobId (job-centric inbound)", () => {
    assert.deepEqual(parseInboxAddress("ab12cd+job_77@inbox.hiredesq.com", DOMAIN), {
      inboxToken: "ab12cd",
      jobId: "job_77",
    });
  });

  it("unwraps a 'Display Name <addr>' form", () => {
    assert.deepEqual(parseInboxAddress("Recruiter <ab12cd@inbox.hiredesq.com>", DOMAIN), {
      inboxToken: "ab12cd",
    });
  });

  it("folds case on the domain and token", () => {
    assert.deepEqual(parseInboxAddress("AB12CD@Inbox.Hiredesq.Com", DOMAIN), { inboxToken: "ab12cd" });
  });

  it("rejects a foreign domain", () => {
    assert.equal(parseInboxAddress("ab12cd@example.com", DOMAIN), null);
  });

  it("rejects malformed / empty addresses", () => {
    assert.equal(parseInboxAddress("not-an-address", DOMAIN), null);
    assert.equal(parseInboxAddress("@inbox.hiredesq.com", DOMAIN), null);
    assert.equal(parseInboxAddress("", DOMAIN), null);
    assert.equal(parseInboxAddress("+job@inbox.hiredesq.com", DOMAIN), null); // no token
  });
});

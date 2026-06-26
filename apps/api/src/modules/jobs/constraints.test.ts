import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkConstraints,
  type CandidateConstraintFields,
  type JobConstraints,
} from "./constraints.js";

// Deterministic qualification filter (§2C). Pure data comparison — no AI, no credit.
const noConstraints: JobConstraints = {
  requiredNationalities: [],
  residenceTransferableRequired: false,
  requiredLicenses: [],
};
const blankCandidate: CandidateConstraintFields = {
  nationality: null,
  residenceTransferable: null,
  licenses: [],
};

describe("checkConstraints", () => {
  it("returns summary 'none' and no flags when the job sets no constraints", () => {
    const r = checkConstraints(noConstraints, { ...blankCandidate, nationality: "Indian" });
    assert.equal(r.summary, "none");
    assert.equal(r.flags.length, 0);
  });

  it("passes nationality when the candidate is in the accepted set (case-insensitive)", () => {
    const r = checkConstraints(
      { ...noConstraints, requiredNationalities: ["Filipino", "Indian"] },
      { ...blankCandidate, nationality: "indian" },
    );
    assert.equal(r.summary, "pass");
    assert.equal(r.flags[0]!.status, "pass");
  });

  it("fails nationality when the candidate is outside the set", () => {
    const r = checkConstraints(
      { ...noConstraints, requiredNationalities: ["Filipino"] },
      { ...blankCandidate, nationality: "Indian" },
    );
    assert.equal(r.summary, "fail");
    assert.equal(r.flags[0]!.status, "fail");
  });

  it("marks a set constraint as unknown when the candidate has no data (never a guess)", () => {
    const r = checkConstraints(
      { ...noConstraints, requiredNationalities: ["Filipino"] },
      blankCandidate,
    );
    assert.equal(r.summary, "unknown");
    assert.equal(r.flags[0]!.status, "unknown");
    assert.equal(r.flags[0]!.candidate, "Unknown");
  });

  it("checks residence transferability true/false/unknown", () => {
    const job = { ...noConstraints, residenceTransferableRequired: true };
    assert.equal(checkConstraints(job, { ...blankCandidate, residenceTransferable: true }).summary, "pass");
    assert.equal(checkConstraints(job, { ...blankCandidate, residenceTransferable: false }).summary, "fail");
    assert.equal(checkConstraints(job, blankCandidate).summary, "unknown");
  });

  it("requires ALL licenses and reports the missing ones", () => {
    const job = { ...noConstraints, requiredLicenses: ["BLS", "ACLS"] };
    const pass = checkConstraints(job, { ...blankCandidate, licenses: ["acls", "bls", "PALS"] });
    assert.equal(pass.summary, "pass");

    const fail = checkConstraints(job, { ...blankCandidate, licenses: ["BLS"] });
    assert.equal(fail.summary, "fail");
    assert.match(fail.flags[0]!.candidate, /Missing: ACLS/);
  });

  it("worst flag wins: any fail → fail, else any unknown → unknown", () => {
    const job: JobConstraints = {
      requiredNationalities: ["Filipino"],
      residenceTransferableRequired: true,
      requiredLicenses: ["BLS"],
    };
    // nationality fail + transferable unknown + license pass → overall fail.
    const r = checkConstraints(job, {
      nationality: "Indian",
      residenceTransferable: null,
      licenses: ["BLS"],
    });
    assert.equal(r.summary, "fail");
    assert.equal(r.flags.length, 3);
  });
});

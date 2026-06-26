import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mapRow } from "./csv-map.js";
import type { ImportRow } from "./extract.js";

// CSV/XLSX smart-map (INGEST PROTOCOL v2): a clean row maps to a CandidateProfile
// with no AI call; a row with no name is unmappable (null → AI text path).

describe("mapRow", () => {
  it("maps a clean row to a CandidateProfile", () => {
    const row: ImportRow = {
      Name: "Sarah Chen",
      Email: "Sarah@Example.com",
      Phone: "+1 (415) 555-0100",
      Title: "Staff Engineer",
      Company: "Acme",
      Location: "San Francisco",
      Skills: "TypeScript, Go; Postgres",
    };
    const profile = mapRow(row);
    assert.ok(profile);
    assert.equal(profile.fullName, "Sarah Chen");
    assert.equal(profile.email, "Sarah@Example.com");
    assert.equal(profile.phone, "+1 (415) 555-0100");
    assert.equal(profile.currentTitle, "Staff Engineer");
    assert.equal(profile.currentCompany, "Acme");
    assert.equal(profile.location, "San Francisco");
    assert.deepEqual(profile.skills, ["TypeScript", "Go", "Postgres"]);
    assert.deepEqual(profile.experience, []);
    assert.deepEqual(profile.education, []);
  });

  it("returns null when the row has no recognizable name column", () => {
    const row: ImportRow = {
      Email: "x@example.com",
      Notes: "knows React, prev at BigCo, based in Berlin — messy free text",
    };
    assert.equal(mapRow(row), null);
  });

  it("returns null when the name cell is blank", () => {
    const row: ImportRow = { Name: "   ", Email: "x@example.com" };
    assert.equal(mapRow(row), null);
  });

  it("aliases headers case-insensitively and across naming styles", () => {
    const row: ImportRow = {
      "FULL NAME": "Devon Marsh",
      "e-mail": "devon@x.io",
      mobile_number: "07700 900123",
      Designation: "Recruiter",
      Employer: "TalentCo",
      City: "London",
    };
    const profile = mapRow(row);
    assert.ok(profile);
    assert.equal(profile.fullName, "Devon Marsh");
    assert.equal(profile.email, "devon@x.io");
    assert.equal(profile.phone, "07700 900123");
    assert.equal(profile.currentTitle, "Recruiter");
    assert.equal(profile.currentCompany, "TalentCo");
    assert.equal(profile.location, "London");
  });

  it("leaves optional fields undefined and skills empty when absent", () => {
    const row: ImportRow = { name: "Min Park" };
    const profile = mapRow(row);
    assert.ok(profile);
    assert.equal(profile.fullName, "Min Park");
    assert.equal(profile.email, undefined);
    assert.equal(profile.phone, undefined);
    assert.deepEqual(profile.skills, []);
  });
});

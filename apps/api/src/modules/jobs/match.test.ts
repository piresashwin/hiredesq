import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMatches, type MatchCandidateRow, type RankedRow } from "./match.js";
import type { JobConstraints } from "./constraints.js";

// The candidate-match ranking algorithm (§5) — "best of cosine, relevant only". The
// ANN recall + distance gate run in SQL (only RELEVANT candidates reach buildMatches);
// this is the pure ordering core: qualified before near-misses, similarity preserved,
// near-misses demoted but NOT hidden. (The §1 tenant boundary is enforced by the
// workspace_id predicates in jobs.service + the TenantGuard covered in guards.spec.)

const NATIONALITY_REQ: JobConstraints = {
  requiredNationalities: ["Indian"],
  residenceTransferableRequired: false,
  requiredLicenses: [],
};

function row(id: string, nationality: string | null): MatchCandidateRow {
  return {
    id,
    fullName: `Cand ${id}`,
    location: null,
    currentTitle: "ICU Nurse",
    currentCompany: "Hospital",
    skills: [],
    source: "manual",
    createdAt: new Date("2026-06-25T00:00:00.000Z"),
    updatedAt: new Date("2026-06-25T00:00:00.000Z"),
    nationality,
    residenceTransferable: null,
    licenses: [],
  };
}

function byId(...rows: MatchCandidateRow[]): Map<string, MatchCandidateRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

describe("buildMatches (job→candidate ranking)", () => {
  it("orders qualified before a near-miss, even when the near-miss is CLOSER", () => {
    // c2 is the closest (distance 0.10) but FAILS nationality; c1/c3 qualify. The
    // qualified pair must lead, then the near-miss — relevance gated, not hidden.
    const ranked: RankedRow[] = [
      { id: "c2", distance: 0.1 }, // British → fail
      { id: "c1", distance: 0.3 }, // Indian → pass
      { id: "c3", distance: 0.4 }, // unknown → not a fail
    ];
    const out = buildMatches(
      NATIONALITY_REQ,
      ranked,
      byId(row("c1", "Indian"), row("c2", "British"), row("c3", null)),
      10,
    );
    assert.deepEqual(
      out.map((m) => m.candidate.id),
      ["c1", "c3", "c2"],
    );
    assert.equal(out[0]!.constraintSummary, "pass");
    assert.equal(out[1]!.constraintSummary, "unknown"); // unknown is NOT a fail
    assert.equal(out[2]!.constraintSummary, "fail");
  });

  it("computes similarity as 1 - distance, clamped to [0,1]", () => {
    const out = buildMatches(
      { requiredNationalities: [], residenceTransferableRequired: false, requiredLicenses: [] },
      [
        { id: "a", distance: 0.3 },
        { id: "b", distance: 1.4 }, // > 1 → clamps to 0
      ],
      byId(row("a", null), row("b", null)),
      10,
    );
    assert.ok(Math.abs(out[0]!.similarity - 0.7) < 1e-9);
    assert.equal(out[1]!.similarity, 0);
    // No constraints set → summary "none" for every match.
    assert.equal(out[0]!.constraintSummary, "none");
  });

  it("truncates to the requested count (qualified take precedence in the cut)", () => {
    const ranked: RankedRow[] = [
      { id: "f", distance: 0.05 }, // fail, closest
      { id: "p1", distance: 0.2 }, // pass
      { id: "p2", distance: 0.25 }, // pass
    ];
    const out = buildMatches(
      NATIONALITY_REQ,
      ranked,
      byId(row("f", "British"), row("p1", "Indian"), row("p2", "Indian")),
      2,
    );
    // Two qualified come first and fill the cut; the closer-but-failing one drops.
    assert.deepEqual(
      out.map((m) => m.candidate.id),
      ["p1", "p2"],
    );
  });

  it("skips ranked ids missing from the hydrate map", () => {
    const out = buildMatches(
      NATIONALITY_REQ,
      [
        { id: "present", distance: 0.2 },
        { id: "ghost", distance: 0.1 },
      ],
      byId(row("present", "Indian")),
      10,
    );
    assert.deepEqual(
      out.map((m) => m.candidate.id),
      ["present"],
    );
  });

  it("returns PII-lean candidate rows (no email/phone fields)", () => {
    const out = buildMatches(
      NATIONALITY_REQ,
      [{ id: "c1", distance: 0.2 }],
      byId(row("c1", "Indian")),
      10,
    );
    assert.ok(!("email" in out[0]!.candidate));
    assert.ok(!("phone" in out[0]!.candidate));
  });
});

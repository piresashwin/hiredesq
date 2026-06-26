import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findDuplicate,
  normalizeEmail,
  normalizePhone,
  normalizeName,
  type ExistingCandidate,
} from "./identity.js";
import type { CandidateProfile } from "@hiredesq/shared";

// Candidate identity / dedup (CLAUDE.md §5): resume + chat = one person.
function profile(p: Partial<CandidateProfile>): CandidateProfile {
  return { fullName: "Sarah Chen", skills: [], experience: [], education: [], ...p };
}

describe("normalizers", () => {
  it("lowercases/trims email, rejects non-emails", () => {
    assert.equal(normalizeEmail("  Sarah@Example.COM "), "sarah@example.com");
    assert.equal(normalizeEmail("not-an-email"), null);
    assert.equal(normalizeEmail(undefined), null);
  });

  it("reduces a phone to its last 10 digits", () => {
    assert.equal(normalizePhone("+1 (415) 555-0199"), "4155550199");
    assert.equal(normalizePhone("123"), null); // too short to match on
  });

  it("collapses whitespace and casing in names", () => {
    assert.equal(normalizeName("  Sarah   CHEN "), "sarah chen");
  });
});

describe("findDuplicate", () => {
  const existing: ExistingCandidate[] = [
    { id: "c_email", normalizedEmail: "sarah@example.com", normalizedPhone: null, normalizedName: "sarah chen" },
    { id: "c_phone", normalizedEmail: null, normalizedPhone: "4155550199", normalizedName: "different name" },
  ];

  it("matches on email first (strongest signal)", () => {
    const m = findDuplicate(profile({ email: "Sarah@example.com" }), existing);
    assert.deepEqual(m, { candidateId: "c_email", matchedOn: "email" });
  });

  it("falls back to phone when email does not match", () => {
    const m = findDuplicate(profile({ phone: "415-555-0199", fullName: "Nobody" }), existing);
    assert.deepEqual(m, { candidateId: "c_phone", matchedOn: "phone" });
  });

  it("falls back to a name-only weak match", () => {
    const m = findDuplicate(profile({ fullName: "sarah chen" }), existing);
    assert.deepEqual(m, { candidateId: "c_email", matchedOn: "name" });
  });

  it("returns null when nothing matches (a genuinely new person)", () => {
    assert.equal(findDuplicate(profile({ fullName: "Brand New", email: "new@x.com" }), existing), null);
  });
});

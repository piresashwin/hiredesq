import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maskCandidate, redactContactText } from "./masking.js";

// Contact masking is the §2 guard on the client-facing artifact: it must NEVER
// carry raw email/phone, even if the model smuggled one into free text.
describe("maskCandidate", () => {
  it("drops email and phone entirely — there is no field for them", () => {
    const masked = maskCandidate({
      fullName: "Asha Rao",
      email: "asha@example.com",
      phone: "+965 1234 5678",
      currentTitle: "ICU Nurse",
    });
    const serialized = JSON.stringify(masked);
    assert.ok(!serialized.includes("asha@example.com"));
    assert.ok(!serialized.includes("1234 5678"));
    const bag = masked as unknown as Record<string, unknown>;
    assert.equal(bag.email, undefined);
    assert.equal(bag.phone, undefined);
    assert.equal(masked.contactMasked, true);
  });

  it("keeps the non-contact fields the client needs", () => {
    const masked = maskCandidate({
      fullName: "Asha Rao",
      location: "Dubai",
      currentTitle: "ICU Nurse",
      currentCompany: "City Hospital",
      skills: ["ICU", "ACLS"],
    });
    assert.equal(masked.fullName, "Asha Rao");
    assert.equal(masked.currentCompany, "City Hospital");
    assert.deepEqual(masked.skills, ["ICU", "ACLS"]);
  });

  it("scrubs contact details that leaked into an experience summary", () => {
    const masked = maskCandidate({
      fullName: "Asha Rao",
      experience: [
        {
          company: "City Hospital",
          title: "Nurse",
          summary: "Reach me on asha@example.com or +965 1234 5678 anytime.",
        },
      ],
    });
    const summary = masked.experience[0]!.summary!;
    assert.ok(!summary.includes("asha@example.com"));
    assert.ok(!summary.includes("1234 5678"));
    assert.ok(summary.includes("[contact hidden]"));
  });

  it("scrubs contact details leaked into ANY free-text field, not just summary", () => {
    const masked = maskCandidate({
      fullName: "Asha Rao",
      location: "Dubai — call me@firm.io",
      currentCompany: "Acme (jane@x.com)",
      skills: ["ICU", "ping +1 212 555 0199"],
      experience: [{ company: "City Hospital — hr@city.org", title: "Nurse" }],
      education: [{ institution: "Uni (admin@uni.edu)" }],
    });
    const serialized = JSON.stringify(masked);
    for (const leak of ["me@firm.io", "jane@x.com", "555 0199", "hr@city.org", "admin@uni.edu"]) {
      assert.ok(!serialized.includes(leak), `leaked: ${leak}`);
    }
  });

  it("does NOT pass through a stray model-added key (allow-list, no spread)", () => {
    const masked = maskCandidate({
      fullName: "Asha Rao",
      // a model could emit an extra field; it must not reach the artifact
      experience: [{ company: "City", title: "Nurse", contact: "a@b.com" } as never],
    });
    assert.equal((masked.experience[0] as unknown as Record<string, unknown>).contact, undefined);
  });
});

describe("redactContactText", () => {
  it("redacts emails and phone numbers from free text", () => {
    const out = redactContactText("Call +1 (212) 555-0199 or email me@firm.io");
    assert.ok(!out.includes("555-0199"));
    assert.ok(!out.includes("me@firm.io"));
  });

  it("redacts a standalone parenthesized phone number (no leading +)", () => {
    const out = redactContactText("Reach the desk at (212) 555-0199 during hours");
    assert.ok(!out.includes("555-0199"));
  });

  it("leaves clean prose untouched", () => {
    const text = "Ten years in critical care with strong leadership.";
    assert.equal(redactContactText(text), text);
  });
});

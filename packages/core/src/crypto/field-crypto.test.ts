import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptField, decryptField } from "./field-crypto.js";

// PII field encryption (CLAUDE.md §2). A 32-byte key, base64-encoded, like prod.
before(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("field-crypto", () => {
  it("round-trips a value", () => {
    const enc = encryptField("priya@example.com");
    assert.notEqual(enc, "priya@example.com"); // not stored in plaintext
    assert.ok(enc?.startsWith("v1:"));
    assert.equal(decryptField(enc), "priya@example.com");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    assert.notEqual(encryptField("+91 98765 43210"), encryptField("+91 98765 43210"));
  });

  it("treats null/undefined/empty as null", () => {
    assert.equal(encryptField(null), null);
    assert.equal(encryptField(undefined), null);
    assert.equal(encryptField(""), null);
    assert.equal(decryptField(null), null);
  });

  it("tolerates legacy plaintext (no v1 prefix) during backfill", () => {
    assert.equal(decryptField("legacy-plaintext@old.com"), "legacy-plaintext@old.com");
  });

  it("fails closed on a tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptField("secret")!;
    // Flip a byte in the ciphertext payload — GCM verification must reject it.
    const raw = Buffer.from(enc.slice(3), "base64");
    raw[20] = (raw[20] ?? 0) ^ 0xff;
    const flipped = "v1:" + raw.toString("base64");
    assert.throws(() => decryptField(flipped));
  });

  it("throws when the key is missing", () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    assert.throws(() => encryptField("x"), /ENCRYPTION_KEY/);
    process.env.ENCRYPTION_KEY = saved;
  });
});

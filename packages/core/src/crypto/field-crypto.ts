import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for candidate PII at rest (CLAUDE.md §2). Email and
 * phone are encrypted before they touch the DB and decrypted only at the API
 * boundary for display. AES-256-GCM (authenticated) keyed by ENCRYPTION_KEY.
 *
 * This lives in packages/core (server-only domain) and is never imported by the
 * web app, so node:crypto never reaches a client bundle. Pure utility — no
 * Prisma/Nest/AI import, so it respects the core boundary.
 *
 * Wire format: `v1:` + base64( iv[12] | authTag[16] | ciphertext ). The version
 * prefix lets us rotate algorithms later; decrypt tolerates legacy plaintext so
 * a backfill can run incrementally.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const TAG_BYTES = 16;
const PREFIX = "v1:";

function loadKey(): Buffer {
  const encoded = process.env.ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("ENCRYPTION_KEY is not set — cannot encrypt/decrypt PII");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to 32 bytes (base64 of a 256-bit key)");
  }
  return key;
}

/** Encrypt a PII field for storage. Returns null for empty/absent input. */
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt a stored PII field. Tolerates legacy plaintext (returns it as-is). */
export function decryptField(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy/plaintext during backfill
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

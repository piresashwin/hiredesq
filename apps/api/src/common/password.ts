import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing with node:crypto only (no external deps). Stored format:
//   scrypt$<saltB64>$<hashB64>
// scrypt is memory-hard; verify uses timingSafeEqual to avoid timing leaks (§6).

const KEYLEN = 64;
const SCHEME = "scrypt";

export function hash(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN);
  return `${SCHEME}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verify(password: string, stored: string | null | undefined): boolean {
  // A provider-only account (e.g. Google) has no passwordHash — any password fails.
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== SCHEME) return false;
  const [, saltB64, hashB64] = parts as [string, string, string];
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = scryptSync(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

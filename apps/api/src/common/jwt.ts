import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal HS256 JWT with node:crypto only (no external deps). Signed with
// JWT_SECRET (§6 — never logged, never committed). Payload carries { sub }.

export interface JwtPayload {
  sub: string;
}

const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY ?? "15m";
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY ?? "30d";
// A 2FA login-challenge token is short-lived: it only bridges the password step
// and the code step of a single sign-in.
const CHALLENGE_EXPIRY = process.env.JWT_2FA_CHALLENGE_EXPIRY ?? "5m";
// Marks a token's purpose so a challenge token can never be used as an access
// token (or vice-versa). Access/refresh tokens carry no `pur` claim.
const CHALLENGE_PURPOSE = "2fa";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Parse a duration like "15m" / "30d" / "3600" into seconds.
function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (!match) throw new Error(`invalid JWT expiry: ${value}`);
  const n = Number(match[1]);
  switch (match[2]) {
    case "s":
    case undefined:
      return n;
    case "m":
      return n * 60;
    case "h":
      return n * 3600;
    case "d":
      return n * 86_400;
    default:
      throw new Error(`invalid JWT expiry unit: ${value}`);
  }
}

function sign(payload: object, expiresIn: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + durationToSeconds(expiresIn) };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedBody = base64url(JSON.stringify(body));
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const signature = base64url(createHmac("sha256", secret()).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

export function signAccess(payload: JwtPayload): string {
  return sign(payload, ACCESS_EXPIRY);
}

export function signRefresh(payload: JwtPayload): string {
  return sign(payload, REFRESH_EXPIRY);
}

/**
 * A short-lived token that proves the password step of a 2FA login succeeded.
 * Carries `pur: "2fa"` so it can't be replayed as an access/refresh token.
 */
export function signTwoFactorChallenge(sub: string): string {
  return sign({ sub, pur: CHALLENGE_PURPOSE }, CHALLENGE_EXPIRY);
}

// Verify signature + expiry, returning the decoded body. Throws on any
// invalid/expired token. Shared by verifyToken and verifyTwoFactorChallenge.
function decode(token: string): { sub?: string; exp?: number; pur?: string } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [encodedHeader, encodedBody, signature] = parts as [string, string, string];
  const signingInput = `${encodedHeader}.${encodedBody}`;
  const expected = base64url(createHmac("sha256", secret()).update(signingInput).digest());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("invalid signature");
  }
  const body = JSON.parse(fromBase64url(encodedBody).toString("utf8")) as {
    sub?: string;
    exp?: number;
    pur?: string;
  };
  if (typeof body.exp === "number" && body.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("token expired");
  }
  return body;
}

/** Verify an access/refresh token (no purpose claim). Throws on invalid/expired. */
export function verifyToken(token: string): JwtPayload {
  const body = decode(token);
  // Reject a 2FA challenge token used as a bearer token — it must never grant access.
  if (body.pur) throw new Error("wrong token purpose");
  if (!body.sub) throw new Error("missing subject");
  return { sub: body.sub };
}

/** Verify a 2FA login-challenge token. Throws if it's not a valid, current challenge. */
export function verifyTwoFactorChallenge(token: string): JwtPayload {
  const body = decode(token);
  if (body.pur !== CHALLENGE_PURPOSE) throw new Error("not a 2fa challenge token");
  if (!body.sub) throw new Error("missing subject");
  return { sub: body.sub };
}

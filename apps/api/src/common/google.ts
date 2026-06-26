import { OAuth2Client } from "google-auth-library";

// Google "Sign in with Google" using the authorization-code (popup) flow. The web
// app's custom button hands us a one-time auth code; we exchange it server-side with
// the client secret for the user's tokens, then verify the returned ID token's
// signature/aud/iss/exp against Google's rotating JWKS (google-auth-library handles
// the key rotation — the one sanctioned exception to the node:crypto-only preference,
// since re-implementing RS256 + JWKS by hand would be more code and more risk).
//
// GOOGLE_CLIENT_ID is the OAuth Web client ID (public); GOOGLE_CLIENT_SECRET is a
// secret (§6 — never logged/committed). Both are read at use time, mirroring the
// JWT_SECRET pattern in jwt.ts, and throw if unset.

export interface GoogleIdentity {
  /** Stable Google account subject — persisted as User.googleId. */
  googleId: string;
  email: string;
  /** Google's own verification of the email; we reject false to prevent takeover. */
  emailVerified: boolean;
  /** Display name, may be empty. */
  name: string;
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set");
  return id;
}

function clientSecret(): string {
  const s = process.env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return s;
}

let cached: OAuth2Client | undefined;
function client(): OAuth2Client {
  // redirect_uri "postmessage" is the sentinel for the JS popup auth-code flow
  // (@react-oauth/google useGoogleLogin) — there is no server redirect URI.
  if (!cached) cached = new OAuth2Client(clientId(), clientSecret(), "postmessage");
  return cached;
}

/**
 * Exchanges a one-time Google authorization code for the user's identity. Throws if
 * the code is invalid/expired or Google returns no ID token. Never log the code,
 * tokens, or the returned PII.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleIdentity> {
  const { tokens } = await client().getToken(code);
  if (!tokens.id_token) throw new Error("Google token response missing id_token");

  // The id_token came straight from Google's token endpoint over TLS, but we still
  // verify it (signature + audience) as defence in depth.
  const ticket = await client().verifyIdToken({ idToken: tokens.id_token, audience: clientId() });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google token missing subject or email");
  }
  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name ?? "",
  };
}

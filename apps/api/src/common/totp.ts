import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";

// TOTP (RFC 6238) for two-factor auth, on otplib's functional API. Secrets are
// base32; we store them encrypted at rest (encryptField, §2/§6) and never log them.

// The label shown in the user's authenticator app.
const ISSUER = "Hiredesq";

// Tolerate ±1 time-step (30s) of clock skew between server and authenticator.
const EPOCH_TOLERANCE_SECONDS = 30;

/** Generate a fresh base32 TOTP secret. */
export function generateTotpSecret(): string {
  return generateSecret();
}

/** Build the otpauth:// provisioning URI an authenticator app scans. */
export function totpKeyUri(accountEmail: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: accountEmail, secret });
}

/** Render an otpauth URI to a PNG data URL for display as a QR code. */
export function totpQrDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

/**
 * Verify a user-entered 6-digit code against the secret. Tolerant of small clock
 * skew. Returns false on any malformed input or error.
 */
export async function verifyTotp(code: string, secret: string): Promise<boolean> {
  if (!code || !secret) return false;
  try {
    const result = await verify({
      secret,
      token: code.trim(),
      epochTolerance: EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid;
  } catch {
    return false;
  }
}

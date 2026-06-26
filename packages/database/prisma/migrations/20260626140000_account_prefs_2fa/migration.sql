-- AlterTable
-- User-level timezone/currency preferences + TOTP two-factor fields. All have
-- defaults or are nullable, so this is a safe expand-only migration (no backfill,
-- no downtime). The TOTP secret is stored encrypted at rest (encryptField, §2/§6).
ALTER TABLE "user" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "totp_secret_encrypted" TEXT,
ADD COLUMN     "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false;

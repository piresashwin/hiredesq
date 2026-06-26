-- Passwordless login (magic-link). Stores only the SHA-256 HASH of the emailed
-- login token (never the token itself, §6) plus a short expiry; both are cleared
-- atomically when the link is claimed, so a link is single-use. Nullable and
-- additive — backward compatible, zero-downtime; existing rows are simply NULL
-- (no active login link), no backfill needed.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "login_token_hash" TEXT,
ADD COLUMN     "login_token_expires_at" TIMESTAMP(3);

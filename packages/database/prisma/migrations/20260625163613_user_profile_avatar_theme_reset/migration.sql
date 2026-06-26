-- AlterTable
ALTER TABLE "user" ADD COLUMN     "avatar_key" TEXT,
ADD COLUMN     "password_reset_expires_at" TIMESTAMP(3),
ADD COLUMN     "password_reset_token_hash" TEXT,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'system';

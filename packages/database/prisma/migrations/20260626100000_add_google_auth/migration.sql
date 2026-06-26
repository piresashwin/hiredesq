-- Sign in with Google: make password optional (provider-only users have none) and
-- add the stable Google account subject for find-or-create / account linking.
-- Both columns are nullable and additive — backward compatible, zero-downtime.

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_google_id_key" ON "user"("google_id");

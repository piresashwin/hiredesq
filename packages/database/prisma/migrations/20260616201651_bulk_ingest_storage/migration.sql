-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('processing', 'done');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('pending', 'confirmed', 'dismissed');

-- AlterTable
ALTER TABLE "parse_job" ADD COLUMN     "batch_id" TEXT;

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'processing',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duplicate_suggestion" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "duplicate_of_id" TEXT NOT NULL,
    "matchedOn" TEXT NOT NULL,
    "status" "DuplicateStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_batch_workspace_id_status_idx" ON "import_batch"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "duplicate_suggestion_workspace_id_status_idx" ON "duplicate_suggestion"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_suggestion_workspace_id_candidate_id_duplicate_of_key" ON "duplicate_suggestion"("workspace_id", "candidate_id", "duplicate_of_id");

-- CreateIndex
CREATE INDEX "parse_job_workspace_id_batch_id_idx" ON "parse_job"("workspace_id", "batch_id");

-- AddForeignKey
ALTER TABLE "parse_job" ADD CONSTRAINT "parse_job_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_suggestion" ADD CONSTRAINT "duplicate_suggestion_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_suggestion" ADD CONSTRAINT "duplicate_suggestion_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_suggestion" ADD CONSTRAINT "duplicate_suggestion_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

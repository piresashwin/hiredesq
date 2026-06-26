-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('free', 'team');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('sourced', 'submitted', 'interview', 'placed', 'rejected');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('queued', 'processing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "CreditEntryStatus" AS ENUM ('reserved', 'committed', 'refunded');

-- CreateTable
CREATE TABLE "workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'member',

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_account" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credit_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entry" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "reservation_key" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "status" "CreditEntryStatus" NOT NULL DEFAULT 'reserved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "credit_ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email_encrypted" TEXT,
    "phone_encrypted" TEXT,
    "normalized_email" TEXT,
    "normalized_phone" TEXT,
    "normalized_name" TEXT NOT NULL,
    "location" TEXT,
    "current_title" TEXT,
    "current_company" TEXT,
    "skills" TEXT[],
    "experience" JSONB NOT NULL DEFAULT '[]',
    "education" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "client" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'sourced',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "fee_amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "placed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_file" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploaded_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parse_job" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "file_id" TEXT,
    "content_hash" TEXT NOT NULL,
    "status" "ParseStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "candidate_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parse_job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "membership_user_id_idx" ON "membership"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_workspace_id_user_id_key" ON "membership"("workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_account_workspace_id_key" ON "credit_account"("workspace_id");

-- CreateIndex
CREATE INDEX "credit_ledger_entry_account_id_idx" ON "credit_ledger_entry"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entry_workspace_id_reservation_key_key" ON "credit_ledger_entry"("workspace_id", "reservation_key");

-- CreateIndex
CREATE INDEX "candidate_workspace_id_normalized_email_idx" ON "candidate"("workspace_id", "normalized_email");

-- CreateIndex
CREATE INDEX "candidate_workspace_id_normalized_phone_idx" ON "candidate"("workspace_id", "normalized_phone");

-- CreateIndex
CREATE INDEX "candidate_workspace_id_normalized_name_idx" ON "candidate"("workspace_id", "normalized_name");

-- CreateIndex
CREATE INDEX "job_workspace_id_status_idx" ON "job"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "application_workspace_id_job_id_stage_idx" ON "application"("workspace_id", "job_id", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "application_workspace_id_candidate_id_job_id_key" ON "application"("workspace_id", "candidate_id", "job_id");

-- CreateIndex
CREATE INDEX "placement_workspace_id_placed_at_idx" ON "placement"("workspace_id", "placed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_file_workspace_id_content_hash_key" ON "uploaded_file"("workspace_id", "content_hash");

-- CreateIndex
CREATE INDEX "parse_job_workspace_id_status_idx" ON "parse_job"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "parse_job_workspace_id_content_hash_key" ON "parse_job"("workspace_id", "content_hash");

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_account" ADD CONSTRAINT "credit_account_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entry" ADD CONSTRAINT "credit_ledger_entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "credit_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate" ADD CONSTRAINT "candidate_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application" ADD CONSTRAINT "application_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement" ADD CONSTRAINT "placement_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_file" ADD CONSTRAINT "uploaded_file_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_job" ADD CONSTRAINT "parse_job_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parse_job" ADD CONSTRAINT "parse_job_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "uploaded_file"("id") ON DELETE SET NULL ON UPDATE CASCADE;

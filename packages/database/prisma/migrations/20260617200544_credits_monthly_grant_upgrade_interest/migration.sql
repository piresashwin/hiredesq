-- AlterTable
ALTER TABLE "credit_account" ADD COLUMN     "last_granted_at" TIMESTAMP(3),
ADD COLUMN     "monthly_allotment" INTEGER NOT NULL DEFAULT 100;

-- CreateTable
CREATE TABLE "upgrade_interest" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upgrade_interest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "upgrade_interest_workspace_id_key" ON "upgrade_interest"("workspace_id");

-- AddForeignKey
ALTER TABLE "upgrade_interest" ADD CONSTRAINT "upgrade_interest_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

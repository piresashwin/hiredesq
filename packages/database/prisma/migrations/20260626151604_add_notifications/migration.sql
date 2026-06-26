-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_workspace_id_user_id_read_at_idx" ON "notification"("workspace_id", "user_id", "read_at");

-- CreateIndex
CREATE INDEX "notification_workspace_id_created_at_idx" ON "notification"("workspace_id", "created_at");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

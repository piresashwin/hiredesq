-- DropIndex
DROP INDEX "notification_workspace_id_created_at_idx";

-- CreateIndex
CREATE INDEX "notification_workspace_id_user_id_created_at_idx" ON "notification"("workspace_id", "user_id", "created_at");

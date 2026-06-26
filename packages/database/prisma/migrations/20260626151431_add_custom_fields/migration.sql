-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('text', 'number', 'date', 'select', 'boolean');

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "custom_fields" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "custom_field_definition" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'text',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_field_definition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "custom_field_definition_workspace_id_order_idx" ON "custom_field_definition"("workspace_id", "order");

-- AddForeignKey
ALTER TABLE "custom_field_definition" ADD CONSTRAINT "custom_field_definition_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

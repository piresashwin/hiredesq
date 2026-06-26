-- DropIndex
DROP INDEX "job_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "candidate" ADD COLUMN     "photo_key" TEXT;

-- DropIndex
DROP INDEX "candidate_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "candidate" ALTER COLUMN "licenses" DROP DEFAULT;

-- AlterTable
ALTER TABLE "job" ALTER COLUMN "required_nationalities" DROP DEFAULT,
ALTER COLUMN "required_licenses" DROP DEFAULT;

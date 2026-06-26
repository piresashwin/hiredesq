/*
  Warnings:

  - Added the required column `updated_at` to the `job` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "expected_fee" DECIMAL(14,2),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

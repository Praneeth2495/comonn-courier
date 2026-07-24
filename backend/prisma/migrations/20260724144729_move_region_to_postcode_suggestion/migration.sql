/*
  Warnings:

  - You are about to drop the column `region` on the `PostcodeZone` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PostcodeZone_countryCode_region_idx";

-- AlterTable
ALTER TABLE "PostcodeSuggestion" ADD COLUMN     "region" TEXT,
ALTER COLUMN "state" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PostcodeZone" DROP COLUMN "region";

-- CreateIndex
CREATE INDEX "PostcodeSuggestion_countryCode_region_idx" ON "PostcodeSuggestion"("countryCode", "region");

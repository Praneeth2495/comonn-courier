-- AlterTable
ALTER TABLE "PostcodeZone" ADD COLUMN     "region" TEXT;

-- CreateIndex
CREATE INDEX "PostcodeZone_countryCode_region_idx" ON "PostcodeZone"("countryCode", "region");

-- AlterTable
ALTER TABLE "Manifest" ADD COLUMN     "countryCode" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Manifest_countryCode_idx" ON "Manifest"("countryCode");

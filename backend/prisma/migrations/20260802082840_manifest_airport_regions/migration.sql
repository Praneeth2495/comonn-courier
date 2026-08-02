-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_manifestRegionId_fkey";

-- AlterTable
ALTER TABLE "ManifestRegion" ADD COLUMN     "code" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "airportCode" TEXT;

-- AlterTable
ALTER TABLE "PostcodeSuggestion" ADD COLUMN     "airport" TEXT;

-- AlterTable
ALTER TABLE "Zone" DROP COLUMN "manifestRegionId";

-- CreateIndex
CREATE UNIQUE INDEX "ManifestRegion_code_key" ON "ManifestRegion"("code");

-- CreateIndex
CREATE INDEX "Order_airportCode_idx" ON "Order"("airportCode");

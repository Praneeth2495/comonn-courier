-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_manifestRegionId_fkey";

-- AlterTable
ALTER TABLE "ManifestRegion" ADD COLUMN     "code" TEXT;

-- Backfill any ManifestRegion rows created before this migration (airport
-- code wasn't a field yet) — derive from the existing name where possible.
UPDATE "ManifestRegion" SET "code" = UPPER(REGEXP_REPLACE(name, '[^A-Za-z0-9]+', '', 'g')) WHERE "code" IS NULL;

ALTER TABLE "ManifestRegion" ALTER COLUMN "code" SET NOT NULL;

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

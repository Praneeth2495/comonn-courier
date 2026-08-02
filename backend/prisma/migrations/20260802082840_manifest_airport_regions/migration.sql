-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT IF EXISTS "Zone_manifestRegionId_fkey";

-- AlterTable
ALTER TABLE "ManifestRegion" ADD COLUMN IF NOT EXISTS "code" TEXT;

-- Backfill any ManifestRegion rows created before this migration (airport
-- code wasn't a field yet). The one known pre-existing row ("Mel Airport",
-- Melbourne) gets its real IATA code directly; anything else unforeseen
-- falls back to a slugified name so the NOT NULL constraint below can't fail.
UPDATE "ManifestRegion" SET "code" = 'MEL' WHERE "code" IS NULL AND name = 'Mel Airport';
UPDATE "ManifestRegion" SET "code" = UPPER(REGEXP_REPLACE(name, '[^A-Za-z0-9]+', '', 'g')) WHERE "code" IS NULL;

ALTER TABLE "ManifestRegion" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "airportCode" TEXT;

-- AlterTable
ALTER TABLE "PostcodeSuggestion" ADD COLUMN IF NOT EXISTS "airport" TEXT;

-- AlterTable
ALTER TABLE "Zone" DROP COLUMN IF EXISTS "manifestRegionId";

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ManifestRegion_code_key" ON "ManifestRegion"("code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_airportCode_idx" ON "Order"("airportCode");

-- AlterTable
ALTER TABLE "Manifest" ADD COLUMN     "countryCode" TEXT;

-- Backfill any Manifest rows created before this migration (countryCode
-- wasn't a field yet) — derive from their linked region's country where
-- possible, since every pre-existing manifest was created via the
-- single-region flow.
UPDATE "Manifest" m
SET "countryCode" = r."countryCode"
FROM "ManifestRegion" r
WHERE m."regionId" = r.id AND m."countryCode" IS NULL;

ALTER TABLE "Manifest" ALTER COLUMN "countryCode" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Manifest_countryCode_idx" ON "Manifest"("countryCode");

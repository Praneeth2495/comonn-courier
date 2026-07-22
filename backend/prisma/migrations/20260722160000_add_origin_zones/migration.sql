-- Zone: distinguish destination zones (matched via CountryZone) from origin
-- zones (matched via PostcodeZone) so the two dropdowns in admin never mix.
ALTER TABLE "Zone" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'destination';

-- RateCard: optional origin-zone dimension alongside the existing
-- destination zone. NULL keeps every existing rate card matching any
-- origin (unchanged behavior).
ALTER TABLE "RateCard" ADD COLUMN "fromZoneId" TEXT;
CREATE INDEX "RateCard_fromZoneId_idx" ON "RateCard"("fromZoneId");
ALTER TABLE "RateCard" ADD CONSTRAINT "RateCard_fromZoneId_fkey" FOREIGN KEY ("fromZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Postcode -> origin Zone mapping (India-only pickup classification).
CREATE TABLE "PostcodeZone" (
    "id" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "PostcodeZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PostcodeZone_countryCode_postcode_key" ON "PostcodeZone"("countryCode", "postcode");
ALTER TABLE "PostcodeZone" ADD CONSTRAINT "PostcodeZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

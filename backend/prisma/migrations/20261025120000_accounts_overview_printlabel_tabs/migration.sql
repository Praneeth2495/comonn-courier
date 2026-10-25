ALTER TABLE "User" ADD COLUMN "allowedAccountsTabs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "allowedOverviewTabs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "allowedPrintLabelTabs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: carry over existing canViewOverviewBreakdown=true accounts so
-- they keep seeing both Overview breakdown tabs after the boolean is
-- replaced by the per-tab array.
UPDATE "User" SET "allowedOverviewTabs" = ARRAY['staff','region']::TEXT[] WHERE "canViewOverviewBreakdown" = true;

ALTER TABLE "User" DROP COLUMN "canViewOverviewBreakdown";

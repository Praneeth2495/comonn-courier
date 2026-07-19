-- Replace the single shared "visible to staff" flag on Zone with explicit
-- per-staff-member zone assignments, so admin can divide zones among
-- individual staff accounts (and reassign/swap them later) instead of
-- one flag shared by every staff account.
ALTER TABLE "Zone" DROP COLUMN "visibleToStaff";

CREATE TABLE "StaffZoneAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffZoneAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffZoneAssignment_userId_zoneId_key" ON "StaffZoneAssignment"("userId", "zoneId");

ALTER TABLE "StaffZoneAssignment" ADD CONSTRAINT "StaffZoneAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffZoneAssignment" ADD CONSTRAINT "StaffZoneAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

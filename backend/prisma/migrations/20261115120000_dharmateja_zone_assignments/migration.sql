-- DharmaTeja Kuditipudi (STAFF) had zero StaffZoneAssignment rows, so the
-- Orders page's Bookings/Delivery/Unconfirmed/Manifest tabs (all scoped by
-- destination zone for STAFF) showed nothing for him — only Pickup (scoped
-- by region instead) worked. Grants him every current destination zone,
-- the same "full initial visibility" a fresh STAFF promotion normally gets
-- (see setUserRole's zone auto-assign in admin.controller.js).
INSERT INTO "StaffZoneAssignment" ("id", "userId", "zoneId", "createdAt")
SELECT gen_random_uuid(), '3d3d562d-e20f-4376-952b-3fcff32cb47a', z.id, CURRENT_TIMESTAMP
FROM "Zone" z
WHERE z.kind = 'destination'
  AND NOT EXISTS (
    SELECT 1 FROM "StaffZoneAssignment" sza
    WHERE sza."userId" = '3d3d562d-e20f-4376-952b-3fcff32cb47a' AND sza."zoneId" = z.id
  );

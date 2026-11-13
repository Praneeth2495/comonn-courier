-- Replaces the original 3-hub rollout (HYD / Vijayawada / Vizag) with one
-- real Hub per India region (PostcodeSuggestion.region — e.g. "Krishna",
-- "Hyderabad") now that the admin branch-cost/rider-filter logic resolves
-- hubs by region directly (see admin.controller.js's loadBranchKeys /
-- loadRegionPostcodeMap), rather than the old 3 hardcoded state/postcode-
-- set cases.

-- 1. One Hub row per distinct India region, named exactly after it (same
--    convention the original 3 hubs used: name = a short place label,
--    address = the same label, since there's no separate real postal
--    address for a region-as-hub).
INSERT INTO "Hub" ("id", "name", "address", "isActive", "createdAt")
SELECT gen_random_uuid(), region, region, true, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT region FROM "PostcodeSuggestion" WHERE "countryCode" = 'IN' AND region IS NOT NULL) r
WHERE NOT EXISTS (SELECT 1 FROM "Hub" WHERE "Hub".name = r.region);

-- 2. Reassign the real staff/billing records currently on the old "HYD"
--    hub to the new "Hyderabad" region-hub (HYD covered the whole of
--    Telangana before; Hyderabad is Telangana's own region/district in
--    the postcode data, the closest real equivalent).
UPDATE "EmployeeProfile" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Hyderabad')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'HYD');
UPDATE "PartyInvoice" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Hyderabad')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'HYD');
UPDATE "Manifest" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Hyderabad')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'HYD');

-- 3. Same for "Vijayawada" -> "Krishna" (Vijayawada city is in Krishna
--    district, which is the actual region name in the postcode data).
UPDATE "EmployeeProfile" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Krishna')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'Vijayawada');
UPDATE "PartyInvoice" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Krishna')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'Vijayawada');
UPDATE "Manifest" SET "hubId" = (SELECT id FROM "Hub" WHERE name = 'Krishna')
WHERE "hubId" = (SELECT id FROM "Hub" WHERE name = 'Vijayawada');

-- "Vizag" had zero real employees/invoices/manifests referencing it, so
-- nothing to reassign before dropping it below.

-- 4. Drop the old 3 hubs now that nothing references them.
DELETE FROM "Hub" WHERE name IN ('HYD', 'Vijayawada', 'Vizag');

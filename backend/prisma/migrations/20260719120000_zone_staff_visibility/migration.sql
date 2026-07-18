-- Admin-controlled visibility: which zones STAFF can see/filter orders by
-- in the Pickup/Delivery orders section.
ALTER TABLE "Zone" ADD COLUMN "visibleToStaff" BOOLEAN NOT NULL DEFAULT true;

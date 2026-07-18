-- "Not sure, book pickup" flow: order books with no price, courier assesses
-- weight/dimensions and collects cash at pickup.
ALTER TABLE "Order" ADD COLUMN "pricingPending" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "PaymentStatus" ADD VALUE 'CASH_PENDING';

-- Dedicated pseudo-service for pickup bookings. It intentionally has no
-- RateCard rows, so it's automatically skipped by the normal multi-service
-- quote comparison (getInstantQuote treats RATE_CARD_NOT_FOUND as "skip").
INSERT INTO "Service" ("id", "code", "name", "description", "transitDaysMin", "transitDaysMax", "volumetricDivisor", "isActive")
VALUES ('8a309059-b483-4432-994b-889bd3c0a0ea', 'PICKUP', 'Pickup Booking', 'Weight and price assessed in person at pickup — pay by cash on collection.', 3, 7, 5000, true)
ON CONFLICT ("code") DO NOTHING;

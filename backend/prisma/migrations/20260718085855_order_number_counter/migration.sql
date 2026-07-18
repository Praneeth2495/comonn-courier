-- CreateTable
CREATE TABLE "OrderNumberCounter" (
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderNumberCounter_pkey" PRIMARY KEY ("year")
);

-- Seed each year's counter from the highest existing orderNumber suffix for
-- that year, so numbering continues correctly instead of restarting at 1
-- and colliding with real existing orders.
INSERT INTO "OrderNumberCounter" ("year", "value")
SELECT
  CAST(split_part("orderNumber", '-', 2) AS INTEGER) AS year,
  MAX(CAST(split_part("orderNumber", '-', 3) AS INTEGER)) AS value
FROM "Order"
WHERE "orderNumber" LIKE 'CMN-%'
GROUP BY split_part("orderNumber", '-', 2)
ON CONFLICT ("year") DO UPDATE SET "value" = EXCLUDED."value";

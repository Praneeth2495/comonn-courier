-- CreateTable
CREATE TABLE "WarrantyTier" (
    "coverage" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyTier_pkey" PRIMARY KEY ("coverage")
);

-- Seed with the exact brackets previously hardcoded in addonCatalog.js, so
-- this migration changes nothing about live pricing, only where it's read
-- from.
INSERT INTO "WarrantyTier" ("coverage", "price", "updatedAt") VALUES
    (10000, 0, CURRENT_TIMESTAMP),
    (25000, 300, CURRENT_TIMESTAMP),
    (50000, 550, CURRENT_TIMESTAMP),
    (75000, 800, CURRENT_TIMESTAMP),
    (100000, 1050, CURRENT_TIMESTAMP),
    (125000, 1300, CURRENT_TIMESTAMP),
    (150000, 1500, CURRENT_TIMESTAMP);

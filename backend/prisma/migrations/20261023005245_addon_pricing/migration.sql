-- CreateTable
CREATE TABLE "AddonPricing" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "perBox" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddonPricing_pkey" PRIMARY KEY ("code")
);

-- Seed with the values previously hardcoded in services/addonCatalog.js
INSERT INTO "AddonPricing" ("code", "label", "unitPrice", "perBox", "updatedAt") VALUES
    ('CARDBOARD', 'Heavy-duty cardboard', 100.00, true, CURRENT_TIMESTAMP),
    ('PACKING', 'Packing service', 300.00, false, CURRENT_TIMESTAMP),
    ('WRAPPING', 'Wrapping service', 100.00, true, CURRENT_TIMESTAMP);

-- Add new Label columns as nullable first, backfill existing rows, then
-- tighten to NOT NULL + unique. Existing Label rows (pre multi-package
-- support) are treated as package 1 of 1, itemType 'Box'.
ALTER TABLE "Label" ADD COLUMN "packageIndex" INTEGER;
ALTER TABLE "Label" ADD COLUMN "itemType" TEXT;

UPDATE "Label" SET "packageIndex" = 1, "itemType" = 'Box' WHERE "packageIndex" IS NULL;

ALTER TABLE "Label" ALTER COLUMN "packageIndex" SET NOT NULL;
ALTER TABLE "Label" ALTER COLUMN "itemType" SET NOT NULL;

-- DropIndex (orderId was previously unique — one label per order)
DROP INDEX IF EXISTS "Label_orderId_key";

CREATE UNIQUE INDEX "Label_barcodeValue_key" ON "Label"("barcodeValue");
CREATE INDEX "Label_orderId_idx" ON "Label"("orderId");

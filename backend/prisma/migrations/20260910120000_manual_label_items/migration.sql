-- Manual Label batches gain multi-item support: replace the single
-- itemType/actualWeightKg/lengthCm/widthCm/heightCm columns with a JSON
-- `items` array, backfilling every existing batch's single item into a
-- one-element array so no data is lost.
ALTER TABLE "ManualLabelBatch" ADD COLUMN "items" JSONB;

UPDATE "ManualLabelBatch"
SET "items" = jsonb_build_array(
  jsonb_build_object(
    'itemType', "itemType",
    'actualWeightKg', "actualWeightKg",
    'lengthCm', "lengthCm",
    'widthCm', "widthCm",
    'heightCm', "heightCm",
    'quantity', "quantity"
  )
)
WHERE "items" IS NULL;

ALTER TABLE "ManualLabelBatch" ALTER COLUMN "items" SET NOT NULL;

ALTER TABLE "ManualLabelBatch"
  DROP COLUMN "itemType",
  DROP COLUMN "actualWeightKg",
  DROP COLUMN "lengthCm",
  DROP COLUMN "widthCm",
  DROP COLUMN "heightCm";

-- AlterTable
ALTER TABLE "ManualLabelBatch"
  ADD COLUMN "service" TEXT,
  ADD COLUMN "consignmentGenerated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "loadSheetGenerated" BOOLEAN NOT NULL DEFAULT false;

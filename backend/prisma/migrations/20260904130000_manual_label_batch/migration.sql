-- CreateTable
CREATE TABLE "ManualLabelBatch" (
    "id" TEXT NOT NULL,
    "referenceNumber" TEXT NOT NULL,
    "fromAddress" JSONB NOT NULL,
    "toAddress" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "itemType" TEXT NOT NULL,
    "actualWeightKg" DECIMAL(10,3) NOT NULL,
    "lengthCm" DECIMAL(10,2),
    "widthCm" DECIMAL(10,2),
    "heightCm" DECIMAL(10,2),
    "instructions" TEXT,
    "masterFileUrl" TEXT,
    "masterPdfData" BYTEA,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualLabelBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualLabelBatch_referenceNumber_key" ON "ManualLabelBatch"("referenceNumber");

-- CreateIndex
CREATE INDEX "ManualLabelBatch_createdAt_idx" ON "ManualLabelBatch"("createdAt");

-- AlterTable
ALTER TABLE "Label" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "Label_batchId_idx" ON "Label"("batchId");

-- AddForeignKey
ALTER TABLE "ManualLabelBatch" ADD CONSTRAINT "ManualLabelBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ManualLabelBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

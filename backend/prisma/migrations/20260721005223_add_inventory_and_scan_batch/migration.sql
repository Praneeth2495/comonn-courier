-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanBatch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "barcodeValue" TEXT NOT NULL,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "matched" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_name_key" ON "InventoryItem"("name");

-- CreateIndex
CREATE INDEX "ScanBatchItem_batchId_idx" ON "ScanBatchItem"("batchId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanBatch" ADD CONSTRAINT "ScanBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanBatchItem" ADD CONSTRAINT "ScanBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ScanBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

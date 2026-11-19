-- DropForeignKey
ALTER TABLE "Label" DROP CONSTRAINT "Label_orderId_fkey";

-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "loadSheetId" TEXT;

-- CreateTable
CREATE TABLE "LoadSheet" (
    "id" TEXT NOT NULL,
    "loadSheetNumber" TEXT NOT NULL,
    "barcodeValue" TEXT NOT NULL,
    "fromHubId" TEXT NOT NULL,
    "toHubId" TEXT NOT NULL,
    "transferBy" TEXT NOT NULL,
    "reference" TEXT,
    "contactName" TEXT,
    "contactMobile" TEXT,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "totalWeightKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "pdfFileUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoadSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadSheetComment" (
    "id" TEXT NOT NULL,
    "loadSheetId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadSheetComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoadSheet_loadSheetNumber_key" ON "LoadSheet"("loadSheetNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LoadSheet_barcodeValue_key" ON "LoadSheet"("barcodeValue");

-- CreateIndex
CREATE INDEX "LoadSheet_fromHubId_idx" ON "LoadSheet"("fromHubId");

-- CreateIndex
CREATE INDEX "LoadSheet_toHubId_idx" ON "LoadSheet"("toHubId");

-- CreateIndex
CREATE INDEX "LoadSheetComment_loadSheetId_idx" ON "LoadSheetComment"("loadSheetId");

-- CreateIndex
CREATE INDEX "Order_loadSheetId_idx" ON "Order"("loadSheetId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_loadSheetId_fkey" FOREIGN KEY ("loadSheetId") REFERENCES "LoadSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSheet" ADD CONSTRAINT "LoadSheet_fromHubId_fkey" FOREIGN KEY ("fromHubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSheet" ADD CONSTRAINT "LoadSheet_toHubId_fkey" FOREIGN KEY ("toHubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSheet" ADD CONSTRAINT "LoadSheet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSheetComment" ADD CONSTRAINT "LoadSheetComment_loadSheetId_fkey" FOREIGN KEY ("loadSheetId") REFERENCES "LoadSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoadSheetComment" ADD CONSTRAINT "LoadSheetComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "manifestId" TEXT;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "manifestRegionId" TEXT;

-- CreateTable
CREATE TABLE "ManifestRegion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "airportAddress" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManifestRegion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manifest" (
    "id" TEXT NOT NULL,
    "manifestNumber" TEXT NOT NULL,
    "barcodeValue" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "regionId" TEXT,
    "toAddress" TEXT NOT NULL,
    "manifestDate" TIMESTAMP(3) NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "totalWeightKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "pdfFileUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manifest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManifestRegion_countryCode_idx" ON "ManifestRegion"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "Manifest_manifestNumber_key" ON "Manifest"("manifestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Manifest_barcodeValue_key" ON "Manifest"("barcodeValue");

-- CreateIndex
CREATE INDEX "Manifest_regionId_idx" ON "Manifest"("regionId");

-- CreateIndex
CREATE INDEX "Order_manifestId_idx" ON "Order"("manifestId");

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_manifestRegionId_fkey" FOREIGN KEY ("manifestRegionId") REFERENCES "ManifestRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "ManifestRegion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


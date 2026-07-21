-- CreateTable
CREATE TABLE "ScanLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcodeValue" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScanLocation_barcodeValue_key" ON "ScanLocation"("barcodeValue");

-- AddForeignKey
ALTER TABLE "ScanLocation" ADD CONSTRAINT "ScanLocation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `heightCm` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `lengthCm` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `quantity` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `widthCm` on the `Order` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Order" DROP COLUMN "heightCm",
DROP COLUMN "lengthCm",
DROP COLUMN "quantity",
DROP COLUMN "widthCm";

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "actualWeightKg" DECIMAL(10,3) NOT NULL,
    "lengthCm" DECIMAL(10,2) NOT NULL,
    "widthCm" DECIMAL(10,2) NOT NULL,
    "heightCm" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "volumetricWeightKg" DECIMAL(10,3) NOT NULL,
    "chargeableWeightKg" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "PartyInvoiceCategory" AS ENUM ('ORIGIN_CUSTOMS', 'DEST_CUSTOMS', 'AIRLINE', 'HUB', 'DELIVERY', 'STATIONERY', 'COMPANY', 'MISC', 'SALARY');

-- CreateEnum
CREATE TYPE "CostInputMode" AS ENUM ('FLAT', 'PER_KG', 'PERCENT');

-- AlterTable
ALTER TABLE "PartyInvoice" ADD COLUMN     "category" "PartyInvoiceCategory",
ADD COLUMN     "costMode" "CostInputMode",
ADD COLUMN     "costRate" DECIMAL(10,4),
ADD COLUMN     "manifestId" TEXT;

-- AlterTable
ALTER TABLE "Manifest" ADD COLUMN     "fromAirportCode" TEXT,
ADD COLUMN     "fromAirportName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "PartyInvoice_manifestId_category_key" ON "PartyInvoice"("manifestId", "category");

-- AddForeignKey
ALTER TABLE "PartyInvoice" ADD CONSTRAINT "PartyInvoice_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "Manifest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

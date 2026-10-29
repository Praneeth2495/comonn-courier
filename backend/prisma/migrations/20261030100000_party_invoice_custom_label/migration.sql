-- DropIndex
DROP INDEX "PartyInvoice_manifestId_category_key";

-- AlterTable
ALTER TABLE "PartyInvoice" ADD COLUMN     "customLabel" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "PartyInvoice_manifestId_category_customLabel_key" ON "PartyInvoice"("manifestId", "category", "customLabel");

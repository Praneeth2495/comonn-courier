-- DropForeignKey
ALTER TABLE "Manifest" DROP CONSTRAINT "Manifest_hubId_fkey";

-- AlterTable
ALTER TABLE "Manifest" ALTER COLUMN "hubId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PartyInvoice" ADD COLUMN     "hubId" TEXT;

-- AddForeignKey
ALTER TABLE "Manifest" ADD CONSTRAINT "Manifest_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyInvoice" ADD CONSTRAINT "PartyInvoice_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE SET NULL ON UPDATE CASCADE;

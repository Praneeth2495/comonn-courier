-- AlterTable
ALTER TABLE "BoxBooking" ADD COLUMN     "invoiceNumber" TEXT,
ADD COLUMN     "pdfFileUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BoxBooking_invoiceNumber_key" ON "BoxBooking"("invoiceNumber");

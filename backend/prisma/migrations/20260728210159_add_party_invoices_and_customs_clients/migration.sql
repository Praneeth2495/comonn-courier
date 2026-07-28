-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "RecurrenceInterval" AS ENUM ('NONE', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "PartyInvoice" (
    "id" TEXT NOT NULL,
    "direction" "InvoiceDirection" NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "businessName" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paidAt" TIMESTAMP(3),
    "recurrence" "RecurrenceInterval" NOT NULL DEFAULT 'NONE',
    "nextRecurrenceAt" TIMESTAMP(3),
    "parentInvoiceId" TEXT,
    "attachmentName" TEXT,
    "attachmentMime" TEXT,
    "attachmentData" BYTEA,
    "pdfFileUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartyInvoiceComment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartyInvoiceComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomsClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "countryCode" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomsClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartyInvoice_invoiceNumber_key" ON "PartyInvoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "PartyInvoice_direction_idx" ON "PartyInvoice"("direction");

-- CreateIndex
CREATE INDEX "PartyInvoice_status_idx" ON "PartyInvoice"("status");

-- CreateIndex
CREATE INDEX "PartyInvoice_nextRecurrenceAt_idx" ON "PartyInvoice"("nextRecurrenceAt");

-- CreateIndex
CREATE INDEX "PartyInvoiceComment_invoiceId_idx" ON "PartyInvoiceComment"("invoiceId");

-- CreateIndex
CREATE INDEX "CustomsClient_countryCode_idx" ON "CustomsClient"("countryCode");

-- AddForeignKey
ALTER TABLE "PartyInvoice" ADD CONSTRAINT "PartyInvoice_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES "PartyInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyInvoice" ADD CONSTRAINT "PartyInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyInvoiceComment" ADD CONSTRAINT "PartyInvoiceComment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "PartyInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartyInvoiceComment" ADD CONSTRAINT "PartyInvoiceComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomsClient" ADD CONSTRAINT "CustomsClient_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

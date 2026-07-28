-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "merchantId" TEXT,
ADD COLUMN     "merchantInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "apiKeyHash" TEXT NOT NULL,
    "apiKeyPrefix" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantInvoice" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" TEXT,
    "paymentLinkUrl" TEXT,
    "paymentLinkId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantInvoiceComment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantInvoiceComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_apiKeyHash_key" ON "Merchant"("apiKeyHash");

-- CreateIndex
CREATE INDEX "MerchantInvoice_merchantId_idx" ON "MerchantInvoice"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantInvoice_merchantId_invoiceDate_key" ON "MerchantInvoice"("merchantId", "invoiceDate");

-- CreateIndex
CREATE INDEX "MerchantInvoiceComment_invoiceId_idx" ON "MerchantInvoiceComment"("invoiceId");

-- CreateIndex
CREATE INDEX "Order_merchantId_idx" ON "Order"("merchantId");

-- CreateIndex
CREATE INDEX "Order_merchantInvoiceId_idx" ON "Order"("merchantInvoiceId");

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantInvoice" ADD CONSTRAINT "MerchantInvoice_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantInvoiceComment" ADD CONSTRAINT "MerchantInvoiceComment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "MerchantInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantInvoiceComment" ADD CONSTRAINT "MerchantInvoiceComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_merchantInvoiceId_fkey" FOREIGN KEY ("merchantInvoiceId") REFERENCES "MerchantInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WhatsappReply" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappReply_providerMessageId_key" ON "WhatsappReply"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsappReply_orderId_idx" ON "WhatsappReply"("orderId");

-- CreateIndex
CREATE INDEX "WhatsappReply_phone_idx" ON "WhatsappReply"("phone");

-- AddForeignKey
ALTER TABLE "WhatsappReply" ADD CONSTRAINT "WhatsappReply_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappReply" ADD CONSTRAINT "WhatsappReply_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

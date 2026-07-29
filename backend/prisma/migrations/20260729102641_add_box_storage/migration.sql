-- CreateTable
CREATE TABLE "BoxSize" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyRate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoxSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Box" (
    "id" TEXT NOT NULL,
    "boxSizeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxBooking" (
    "id" TEXT NOT NULL,
    "boxSizeId" TEXT NOT NULL,
    "boxId" TEXT,
    "customerId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "monthlyRate" DECIMAL(10,2) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "expiryReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoxBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxPayment" (
    "id" TEXT NOT NULL,
    "boxBookingId" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "providerOrderId" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'REQUIRES_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoxSize_code_key" ON "BoxSize"("code");

-- CreateIndex
CREATE INDEX "Box_status_idx" ON "Box"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Box_boxSizeId_number_key" ON "Box"("boxSizeId", "number");

-- CreateIndex
CREATE INDEX "BoxBooking_customerId_idx" ON "BoxBooking"("customerId");

-- CreateIndex
CREATE INDEX "BoxBooking_status_idx" ON "BoxBooking"("status");

-- CreateIndex
CREATE INDEX "BoxBooking_endDate_idx" ON "BoxBooking"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "BoxPayment_providerOrderId_key" ON "BoxPayment"("providerOrderId");

-- CreateIndex
CREATE INDEX "BoxPayment_boxBookingId_idx" ON "BoxPayment"("boxBookingId");

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_boxSizeId_fkey" FOREIGN KEY ("boxSizeId") REFERENCES "BoxSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxBooking" ADD CONSTRAINT "BoxBooking_boxSizeId_fkey" FOREIGN KEY ("boxSizeId") REFERENCES "BoxSize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxBooking" ADD CONSTRAINT "BoxBooking_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxBooking" ADD CONSTRAINT "BoxBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxPayment" ADD CONSTRAINT "BoxPayment_boxBookingId_fkey" FOREIGN KEY ("boxBookingId") REFERENCES "BoxBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

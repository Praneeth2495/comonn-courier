-- CreateTable
CREATE TABLE "BoxBookingComment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoxBookingComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoxBookingComment_bookingId_idx" ON "BoxBookingComment"("bookingId");

-- AddForeignKey
ALTER TABLE "BoxBookingComment" ADD CONSTRAINT "BoxBookingComment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "BoxBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxBookingComment" ADD CONSTRAINT "BoxBookingComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


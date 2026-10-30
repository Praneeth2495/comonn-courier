-- CreateEnum
CREATE TYPE "StaffLeaveType" AS ENUM ('SICK', 'CASUAL', 'EARNED', 'UNPAID', 'OTHER');

-- CreateTable
CREATE TABLE "StaffLeave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StaffLeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffLeave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffLeave_userId_idx" ON "StaffLeave"("userId");

-- AddForeignKey
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffLeave" ADD CONSTRAINT "StaffLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

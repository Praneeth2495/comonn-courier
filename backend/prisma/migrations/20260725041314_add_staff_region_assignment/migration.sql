-- CreateTable
CREATE TABLE "StaffRegionAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "region" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRegionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffRegionAssignment_userId_state_region_key" ON "StaffRegionAssignment"("userId", "state", "region");

-- AddForeignKey
ALTER TABLE "StaffRegionAssignment" ADD CONSTRAINT "StaffRegionAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

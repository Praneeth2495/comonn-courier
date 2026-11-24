-- CreateTable
CREATE TABLE "SubContractor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "mobile1" TEXT NOT NULL,
    "mobile2" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "cityTown" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "gst" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubContractor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubContractor_countryCode_idx" ON "SubContractor"("countryCode");

-- AddForeignKey
ALTER TABLE "SubContractor" ADD CONSTRAINT "SubContractor_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

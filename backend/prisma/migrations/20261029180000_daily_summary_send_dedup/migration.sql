-- CreateTable
CREATE TABLE "DailySummarySend" (
    "id" TEXT NOT NULL,
    "dateIso" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailySummarySend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailySummarySend_dateIso_key" ON "DailySummarySend"("dateIso");

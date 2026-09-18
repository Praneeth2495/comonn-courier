-- Referral program + customer wallet.
ALTER TABLE "User"
  ADD COLUMN "referralCode" TEXT,
  ADD COLUMN "referredById" TEXT,
  ADD COLUMN "referralRewardGranted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "walletBalance" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "User"
  ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD COLUMN "walletAmountUsed" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "referralCodeUsed" TEXT;

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "orderId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_userId_idx" ON "WalletTransaction"("userId");

ALTER TABLE "WalletTransaction"
  ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "WalletTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WalletTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

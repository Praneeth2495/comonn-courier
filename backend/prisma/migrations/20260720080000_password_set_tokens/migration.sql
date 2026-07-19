-- CreateTable
CREATE TABLE "PasswordSetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordSetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordSetToken_tokenHash_key" ON "PasswordSetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordSetToken_userId_idx" ON "PasswordSetToken"("userId");

-- AddForeignKey
ALTER TABLE "PasswordSetToken" ADD CONSTRAINT "PasswordSetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

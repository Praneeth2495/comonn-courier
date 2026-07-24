-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountSetupEmailSentAt" TIMESTAMP(3),
ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

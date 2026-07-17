-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "currency" SET DEFAULT 'INR';

-- AlterTable
ALTER TABLE "Payment" ALTER COLUMN "currency" SET DEFAULT 'INR';

-- AlterTable
ALTER TABLE "RateCard" ALTER COLUMN "currency" SET DEFAULT 'INR';

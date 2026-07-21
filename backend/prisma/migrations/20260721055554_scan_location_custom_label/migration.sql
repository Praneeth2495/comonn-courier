-- AlterTable
ALTER TABLE "ScanLocation" ALTER COLUMN "status" DROP NOT NULL;
ALTER TABLE "ScanLocation" ADD COLUMN "label" TEXT;

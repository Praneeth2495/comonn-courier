-- AlterTable
ALTER TABLE "WhatsappReply" ADD COLUMN     "attachmentData" BYTEA,
ADD COLUMN     "attachmentFileName" TEXT,
ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "messageType" TEXT NOT NULL DEFAULT 'text';

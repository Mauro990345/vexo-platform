-- AlterTable
ALTER TABLE "InstagramAccount" ADD COLUMN "needsReconnectAt" TIMESTAMP(3),
ADD COLUMN "needsReconnectReason" TEXT;

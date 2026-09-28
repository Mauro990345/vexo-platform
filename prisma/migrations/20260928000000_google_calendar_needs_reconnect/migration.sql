-- AlterTable
ALTER TABLE "GoogleCalendarAccount" ADD COLUMN "needsReconnectAt" TIMESTAMP(3),
ADD COLUMN "needsReconnectReason" TEXT;

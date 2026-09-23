-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "lastSilenceCheckAt" TIMESTAMP(3),
ADD COLUMN "lastSilenceCheckSuggested" BOOLEAN,
ADD COLUMN "lastSilenceCheckReason" TEXT,
ADD COLUMN "lastSilenceCheckModel" TEXT;

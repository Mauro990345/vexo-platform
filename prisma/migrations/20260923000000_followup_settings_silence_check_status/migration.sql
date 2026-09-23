-- AlterTable
ALTER TABLE "FollowUpSettings" ADD COLUMN "lastSilenceCheckAt" TIMESTAMP(3),
ADD COLUMN "lastSilenceCheckError" TEXT;

-- CreateEnum
CREATE TYPE "FollowUpTrigger" AS ENUM ('SILENCE', 'NO_SHOW');

-- DropIndex
DROP INDEX "FollowUpStep_order_key";

-- AlterTable
ALTER TABLE "FollowUpLog" DROP COLUMN "reason",
ADD COLUMN     "trigger" "FollowUpTrigger" NOT NULL;

-- AlterTable
ALTER TABLE "FollowUpStep" ADD COLUMN     "trigger" "FollowUpTrigger" NOT NULL;

-- CreateTable
CREATE TABLE "FollowUpSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "silenceHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpStep_trigger_order_key" ON "FollowUpStep"("trigger", "order");


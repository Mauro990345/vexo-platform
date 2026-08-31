-- AlterTable
ALTER TABLE "FollowUpLog" ADD COLUMN     "lastStepIndex" INTEGER,
ADD COLUMN     "lastStepSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "FollowUpStep" (
    "id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpStep_order_key" ON "FollowUpStep"("order");

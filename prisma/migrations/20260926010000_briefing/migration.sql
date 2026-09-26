-- CreateEnum
CREATE TYPE "BriefingRevenueRange" AS ENUM ('UNDER_20K', 'FROM_20K_TO_50K', 'FROM_50K_TO_100K', 'OVER_100K');

-- CreateEnum
CREATE TYPE "BriefingVexoGoal" AS ENUM ('SCHEDULE_MORE_EVALUATIONS', 'REDUCE_NO_SHOW', 'STOP_DEPENDING_ON_PAID_ADS', 'OTHER');

-- CreateTable
CREATE TABLE "BriefingLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientDisplayName" TEXT NOT NULL,
    "clinicDisplayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BriefingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "flagshipService" TEXT NOT NULL,
    "currentlyAdvertises" BOOLEAN NOT NULL,
    "advertisingMonthlySpend" TEXT,
    "revenueRange" "BriefingRevenueRange" NOT NULL,
    "whatTried" TEXT NOT NULL,
    "hasSecretary" BOOLEAN NOT NULL,
    "aiPersonaName" TEXT NOT NULL,
    "competitorInstagram1" TEXT,
    "competitorInstagram2" TEXT,
    "vexoGoal" "BriefingVexoGoal" NOT NULL,
    "vexoGoalOther" TEXT,
    "averageTicket" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BriefingLink_clinicId_key" ON "BriefingLink"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingLink_token_key" ON "BriefingLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_clinicId_key" ON "Briefing"("clinicId");

-- AddForeignKey
ALTER TABLE "BriefingLink" ADD CONSTRAINT "BriefingLink_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefing" ADD CONSTRAINT "Briefing_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

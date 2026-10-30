-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "skipGoogleCalendarSync" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReactivationShowcaseBackup" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "originalScheduledAt" TIMESTAMP(3) NOT NULL,
    "originalReturnPeriodDays" INTEGER,
    "originalReturnPeriodNone" BOOLEAN NOT NULL,
    "originalSkipGoogleCalendarSync" BOOLEAN NOT NULL,
    "originalLeadPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactivationShowcaseBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReactivationShowcaseBackup_appointmentId_key" ON "ReactivationShowcaseBackup"("appointmentId");

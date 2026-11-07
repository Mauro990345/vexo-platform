-- CreateTable
CREATE TABLE "ReactivationReturnDemoBackup" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "cardSlotId" TEXT,
    "originalSentAt" TIMESTAMP(3),
    "createdAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactivationReturnDemoBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReactivationReturnDemoBackup_createdAppointmentId_key" ON "ReactivationReturnDemoBackup"("createdAppointmentId");

-- CreateIndex
CREATE INDEX "ReactivationReturnDemoBackup_clinicId_idx" ON "ReactivationReturnDemoBackup"("clinicId");

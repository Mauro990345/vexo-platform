-- Relatório de resultados (quinzenal/mensal) com envio automático por
-- WhatsApp, administrado pela página "Contas" (admin) — ver DESIGN.md e
-- src/lib/clinic-reports.ts. Puramente aditivo: 2 tabelas novas (uma 1:1
-- com Clinic, outra de histórico de envios), nenhuma coluna existente
-- alterada, nenhum backfill.

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('MONTHLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "ReportMonthlyDayMode" AS ENUM ('LAST_DAY', 'FIXED_DAY');

-- CreateEnum
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportDeliveryTrigger" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "ClinicReportConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "whatsappNumber" TEXT,
    "frequency" "ReportFrequency" NOT NULL DEFAULT 'MONTHLY',
    "monthlyDayMode" "ReportMonthlyDayMode" NOT NULL DEFAULT 'LAST_DAY',
    "monthlyFixedDay" INTEGER,
    "sendHour" INTEGER NOT NULL DEFAULT 17,
    "sendMinute" INTEGER NOT NULL DEFAULT 0,
    "autoSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicReportDelivery" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "periodType" "ReportFrequency" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "token" TEXT,
    "trigger" "ReportDeliveryTrigger" NOT NULL DEFAULT 'AUTO',
    "status" "ReportDeliveryStatus",
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicReportDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicReportConfig_clinicId_key" ON "ClinicReportConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicReportDelivery_token_key" ON "ClinicReportDelivery"("token");

-- CreateIndex
CREATE INDEX "ClinicReportDelivery_clinicId_periodStart_idx" ON "ClinicReportDelivery"("clinicId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicReportDelivery_clinicId_periodType_periodStart_key" ON "ClinicReportDelivery"("clinicId", "periodType", "periodStart");

-- AddForeignKey
ALTER TABLE "ClinicReportConfig" ADD CONSTRAINT "ClinicReportConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicReportDelivery" ADD CONSTRAINT "ClinicReportDelivery_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tabela nova (ReactivationConfig, 1:1 com Clinic, mesmo padrão de
-- ReminderConfig) + uma coluna nullable em Appointment. Nenhuma linha
-- existente é reescrita: a tabela nasce vazia (nada pra popular, zero
-- backfill) e a coluna nova em Appointment entra NULL em todo agendamento
-- já existente, sem valor obrigatório.
-- CreateTable
CREATE TABLE "ReactivationConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL DEFAULT 150,
    "message1" TEXT,
    "message2" TEXT,
    "message3" TEXT,
    "message4" TEXT,
    "message5" TEXT,
    "sequenceCounter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReactivationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReactivationConfig_clinicId_key" ON "ReactivationConfig"("clinicId");

-- AddForeignKey
ALTER TABLE "ReactivationConfig" ADD CONSTRAINT "ReactivationConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "reactivationMessageSlot" INTEGER;

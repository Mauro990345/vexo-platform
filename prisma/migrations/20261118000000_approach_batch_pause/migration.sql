-- Pausa de lote (a cada N envios, pausa por algumas horas) e tempos
-- configuráveis da Fila de abordagem (espera entre mensagens, tamanho do
-- lote, duração da pausa) — ver DESIGN.md. Puramente aditivo.

-- AlterTable
ALTER TABLE "ApproachQueueConfig" ADD COLUMN "batchSentCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ApproachQueueConfig" ADD COLUMN "batchPausedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApproachTimingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "waitMinMinutes" INTEGER NOT NULL DEFAULT 1,
    "waitMaxMinutes" INTEGER NOT NULL DEFAULT 2,
    "batchSize" INTEGER NOT NULL DEFAULT 30,
    "batchPauseHours" INTEGER NOT NULL DEFAULT 2,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachTimingSettings_pkey" PRIMARY KEY ("id")
);

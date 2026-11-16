-- Horário permitido da Fila de abordagem, agora configurável (antes fixo
-- 7h-20h no código) — singleton global, mesma convenção de FollowUpSettings.
-- Puramente aditivo: 1 tabela nova, nenhuma coluna existente alterada.

-- CreateTable
CREATE TABLE "ApproachWindowSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "startMinute" INTEGER NOT NULL DEFAULT 420,
    "endMinute" INTEGER NOT NULL DEFAULT 1200,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachWindowSettings_pkey" PRIMARY KEY ("id")
);

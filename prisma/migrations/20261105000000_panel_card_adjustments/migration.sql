-- Ajustes nos cards do Painel (Faltou D30, Não agendou D10, âncora
-- congelada do "Não agendou") — puramente aditivo: 3 colunas novas, todas
-- nullable, nenhum backfill, nenhuma coluna existente alterada.

-- AlterTable
ALTER TABLE "NoShowCardSettings" ADD COLUMN "day30Content" TEXT;

-- AlterTable
ALTER TABLE "NeverScheduledCardSettings" ADD COLUMN "day10Content" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "neverScheduledAnchorAt" TIMESTAMP(3);

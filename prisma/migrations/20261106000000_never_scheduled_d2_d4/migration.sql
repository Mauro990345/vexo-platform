-- Card "Não agendou": novos passos D2 e D4 (além de D10/D30/D60
-- existentes) — puramente aditivo, 2 colunas novas, nullable, sem
-- backfill, nenhuma coluna existente alterada.

-- AlterTable
ALTER TABLE "NeverScheduledCardSettings" ADD COLUMN "day2Content" TEXT;
ALTER TABLE "NeverScheduledCardSettings" ADD COLUMN "day4Content" TEXT;

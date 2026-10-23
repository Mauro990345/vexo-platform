-- Reativação ganha um canal próprio (Instagram, além do WhatsApp já
-- existente) com seu próprio conjunto de 5 mensagens e seu próprio
-- contador de rotação. Puramente aditivo: 6 colunas novas, todas opcionais
-- ou com DEFAULT — nenhuma coluna existente é alterada/removida, sem
-- backfill (Reativação ainda não tem nenhum dado real em produção).
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramMessage1" TEXT;
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramMessage2" TEXT;
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramMessage3" TEXT;
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramMessage4" TEXT;
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramMessage5" TEXT;
ALTER TABLE "ReactivationConfig" ADD COLUMN "instagramSequenceCounter" INTEGER NOT NULL DEFAULT 0;

-- Prazo de retorno passa a ser por AGENDAMENTO (botão "Retorno", marcado
-- pela secretária ou, sem marcação, os prazos padrão da clínica) em vez de
-- uma lista única e global por clínica (thresholdDaysList). O Quente ganha
-- uma cadência fixa de 3 passos (2/4/30 dias desde a última mensagem do
-- lead) em vez de um card único por conversa. Ainda não existe nenhum
-- dado real de Reativação/Quente em produção (nenhuma clínica configurou/
-- usou nenhum dos dois até agora) — por isso dá pra trocar/remover as
-- colunas antigas sem nenhum backfill, mesmo precedente das migrations
-- 20261023010000_reactivation_multi_period/20261024010000_reactivation_instagram_channel.

-- Appointment: prazo de retorno marcado pela secretária no botão
-- "Retorno" (ver RetornoButton.tsx) — só o NÚMERO de dias (ou "nenhum"),
-- nunca texto livre nem dado clínico (LGPD). null em returnPeriodDays +
-- false em returnPeriodNone = "ainda não marcou" (usa os prazos padrão da
-- clínica).
ALTER TABLE "Appointment" ADD COLUMN "returnPeriodDays" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN "returnPeriodNone" BOOLEAN NOT NULL DEFAULT false;

-- ReactivationConfig: thresholdDaysList (período único global, com canal
-- fixo por período) sai; entram os prazos DISPONÍVEIS/PADRÃO por clínica
-- (ver RETURN_PERIOD_OPTIONS, reactivation.ts) e o limite diário
-- compartilhado de WhatsApp (Reativação + Faltou). As 5 mensagens do
-- Instagram (conjunto separado) saem — canal agora é sempre resolvido
-- pelo telefone do lead (WhatsApp com fallback de Instagram), um
-- conjunto ÚNICO de mensagens serve os dois.
ALTER TABLE "ReactivationConfig" ADD COLUMN "availablePeriods" INTEGER[] NOT NULL DEFAULT ARRAY[30,60,90,120,150,180,210,240,270]::INTEGER[];
ALTER TABLE "ReactivationConfig" ADD COLUMN "defaultPeriods" INTEGER[] NOT NULL DEFAULT ARRAY[30,60]::INTEGER[];
ALTER TABLE "ReactivationConfig" ADD COLUMN "dailyWhatsappLimit" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "ReactivationConfig" DROP COLUMN "thresholdDaysList";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramMessage1";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramMessage2";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramMessage3";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramMessage4";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramMessage5";
ALTER TABLE "ReactivationConfig" DROP COLUMN "instagramSequenceCounter";

-- HotLeadConfig: as 5 mensagens/contador únicos saem; entram até 3
-- variações de texto POR PASSO (3 passos fixos) e um contador de rotação
-- por passo (cada passo roda sua própria sequência entre leads).
ALTER TABLE "HotLeadConfig" ADD COLUMN "step1Message1" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step1Message2" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step1Message3" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step2Message1" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step2Message2" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step2Message3" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step3Message1" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step3Message2" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step3Message3" TEXT;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step1SequenceCounter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step2SequenceCounter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HotLeadConfig" ADD COLUMN "step3SequenceCounter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HotLeadConfig" DROP COLUMN "message1";
ALTER TABLE "HotLeadConfig" DROP COLUMN "message2";
ALTER TABLE "HotLeadConfig" DROP COLUMN "message3";
ALTER TABLE "HotLeadConfig" DROP COLUMN "message4";
ALTER TABLE "HotLeadConfig" DROP COLUMN "message5";
ALTER TABLE "HotLeadConfig" DROP COLUMN "sequenceCounter";

-- HotLeadCardSlot: até TRÊS linhas por conversa agora (uma por passo, ver
-- HOT_LEAD_STEP_DAYS, hot-lead-cards.ts), chave composta
-- (conversationId, step) no lugar de conversationId único. sequenceAnchorAt
-- congela Conversation.lastLeadMessageAt no momento em que a sequência
-- daquela conversa começou — os 3 passos de uma mesma conversa guardam o
-- MESMO valor (é o que permite detectar "o lead respondeu depois que a
-- sequência começou" sem precisar reiniciar os prazos). DEFAULT
-- CURRENT_TIMESTAMP/1 só pra satisfazer NOT NULL em linha pré-existente
-- (nenhuma hoje, mas seguro mesmo que existisse) — removido logo depois,
-- toda escrita nova sempre informa os dois valores explicitamente.
ALTER TABLE "HotLeadCardSlot" ADD COLUMN "step" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HotLeadCardSlot" ADD COLUMN "sequenceAnchorAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "HotLeadCardSlot" ALTER COLUMN "step" DROP DEFAULT;
ALTER TABLE "HotLeadCardSlot" ALTER COLUMN "sequenceAnchorAt" DROP DEFAULT;

DROP INDEX "HotLeadCardSlot_conversationId_key";
CREATE UNIQUE INDEX "HotLeadCardSlot_conversationId_step_key" ON "HotLeadCardSlot"("conversationId", "step");

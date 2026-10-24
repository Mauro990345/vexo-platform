-- Registra o clique no botão de ação (WhatsApp/Instagram) de um card de
-- Reativação, pra marcar aquele acompanhamento como enviado na tela.
-- Puramente aditiva: 1 coluna nova, opcional (sem DEFAULT) — nenhuma
-- coluna existente é alterada/removida, sem backfill (toda linha
-- existente de ReactivationCardSlot já nasce com sentAt NULL = pendente,
-- comportamento idêntico ao de antes desta coluna existir).
ALTER TABLE "ReactivationCardSlot" ADD COLUMN "sentAt" TIMESTAMP(3);

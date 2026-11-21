-- Botão "Descartar" pra mensagens FAILED sem conserto (fora da janela de
-- 24h da Meta, token permanentemente expirado) ou que o usuário decidiu
-- não reenviar mais. Puramente aditivo: NUNCA muda `status`/`failReason`
-- de nenhuma linha — a Message continua FAILED de verdade, com o erro
-- visível no histórico da conversa; só sai da contagem do badge e da
-- listagem de falhas (dispatch-status, global e por clínica), que agora
-- filtram `dismissedAt IS NULL`.
--
-- NULL em toda linha já existente (comportamento de hoje: toda FAILED
-- continua contando/listada normalmente até alguém descartar).

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "dismissedAt" TIMESTAMP(3);

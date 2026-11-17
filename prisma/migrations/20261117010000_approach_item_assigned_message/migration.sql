-- A mensagem sorteada passa a ser atribuída e guardada no item assim que
-- ele vira o card ativo (não mais sorteada só no instante do envio) —
-- corrige o toque em "Enviar mensagem" não abrir o Instagram no Safari/iOS
-- (o gesto do usuário que autoriza clipboard/nova aba expirava enquanto a
-- mensagem era sorteada no servidor). Puramente aditivo.

-- AlterTable
ALTER TABLE "ApproachQueueItem" ADD COLUMN "assignedMessage" TEXT;
ALTER TABLE "ApproachQueueItem" ADD COLUMN "assignedMessageSlot" INTEGER;

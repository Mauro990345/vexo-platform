-- Só adição de coluna nullable, sem backfill nem reescrita de nenhuma
-- linha existente — marca quando o cartão de contato da clínica foi
-- enviado nesta conversa, pra cortar a janela do classificador (mesmo
-- papel de Conversation.humanReviewedAt) e pro cooldown contra reenvio
-- (ver Conversation.clinicContactCardSentAt, schema.prisma).
ALTER TABLE "Conversation" ADD COLUMN "clinicContactCardSentAt" TIMESTAMP(3);

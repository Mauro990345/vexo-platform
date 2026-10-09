-- Só adição de coluna nullable, sem backfill nem reescrita de nenhuma
-- linha existente — carrega o JSON do cartão de contato da clínica
-- (clinicId/clinicName/whatsappE164) só nas Message que o sistema cria
-- como o cartão em si (ver Message.clinicContactCard, schema.prisma).
ALTER TABLE "Message" ADD COLUMN "clinicContactCard" TEXT;

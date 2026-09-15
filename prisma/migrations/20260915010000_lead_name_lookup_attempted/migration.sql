-- Marca se já tentamos buscar o nome do lead via getInstagramUserProfile
-- pelo menos uma vez — evita repetir a chamada em toda mensagem quando o
-- resultado já veio vazio de forma consistente.
ALTER TABLE "Lead" ADD COLUMN "nameLookupAttempted" BOOLEAN NOT NULL DEFAULT false;

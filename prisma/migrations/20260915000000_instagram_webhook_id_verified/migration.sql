-- Marca se o igUserId salvo já foi confirmado contra um evento de webhook
-- real (ver comentário no schema) — contas já existentes assumem true
-- (já verificadas, se estão funcionando), contas novas recebem false no
-- momento do OAuth e só viram true quando um webhook real confirma ou
-- corrige o valor.
ALTER TABLE "InstagramAccount" ADD COLUMN "webhookIdVerified" BOOLEAN NOT NULL DEFAULT true;

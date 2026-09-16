-- Antes de criar o índice único, limpa duplicatas que porventura já
-- existam (mensagens que uma reentrega do webhook do Instagram, sem
-- proteção nenhuma até agora, processou como se fossem uma mensagem nova)
-- — mantém o igMessageId só na ocorrência mais antiga, zera nas demais.
-- Não apaga nenhuma mensagem, só o vínculo duplicado com o mesmo mid.
UPDATE "Message" m
SET "igMessageId" = NULL
WHERE m."igMessageId" IS NOT NULL
  AND m."id" <> (
    SELECT m2."id" FROM "Message" m2
    WHERE m2."igMessageId" = m."igMessageId"
    ORDER BY m2."createdAt" ASC, m2."id" ASC
    LIMIT 1
  );

-- CreateIndex
ALTER TABLE "Message" ADD CONSTRAINT "Message_igMessageId_key" UNIQUE ("igMessageId");

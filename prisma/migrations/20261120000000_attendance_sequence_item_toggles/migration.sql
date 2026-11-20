-- Caixinha "Enviar" individual por item da sequência de confirmação de
-- presença (ver DESIGN.md) — antes, a sequência inteira (apresentação,
-- vídeo, cafezinho, mensagem final) dependia só de Clinic.confirmationVideoUrl
-- existir; a mensagem final (confirmação do agendamento) não tem relação
-- com o vídeo e não devia ficar presa a ele.
--
-- Puramente aditivo, sem apagar nenhuma coluna. Preserva o comportamento
-- de toda clínica já existente:
--   - DEFAULT true (abaixo) deixa as 4 caixinhas ligadas por padrão —
--     igual ao comportamento de hoje pra clínica que JÁ TEM vídeo
--     cadastrado (sequência completa saindo).
--   - O UPDATE seguinte desliga as 4 pra clínica que NÃO TEM vídeo — hoje
--     nada saía pra essas clínicas, e não queremos que cafezinho/
--     mensagem final passem a sair sozinhos sem ninguém ter decidido isso.
-- Clínica nova (criada depois desta migration) nasce com as 4 true
-- (DEFAULT), sem precisar de nenhuma linha extra aqui.

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN "confirmationVideoCaptionEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN "confirmationVideoEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN "attendanceTipEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN "attendanceFinalEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: clínica já existente SEM vídeo cadastrado mantém as 4
-- desligadas (comportamento de hoje — nada saía).
UPDATE "Clinic"
SET "confirmationVideoCaptionEnabled" = false,
    "confirmationVideoEnabled" = false,
    "attendanceTipEnabled" = false,
    "attendanceFinalEnabled" = false
WHERE "confirmationVideoUrl" IS NULL;

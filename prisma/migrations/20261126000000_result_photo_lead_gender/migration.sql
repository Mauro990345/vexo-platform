-- Gênero do lead e da foto de resultado (ver Gender, Lead.gender,
-- ResultPhoto.gender no schema) — nunca inferido automaticamente, só
-- cadastrado manualmente; usado só para decidir se uma foto de resultado
-- pode ser enviada a um lead (ver canSendResultPhoto, result-photo-message.ts).

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "gender" "Gender";

-- AlterTable
ALTER TABLE "ResultPhoto" ADD COLUMN "gender" "Gender";

-- Pedido explícito: a frase padrão sugerida no placeholder do campo de
-- legenda ("Separei um resultado real de um procedimento parecido com o
-- que você quer") dizia que o resultado era "parecido com o que você
-- quer" sem nenhuma garantia disso — vira "Separei um resultado real pra
-- você ver" (sem essa promessa). Dado histórico (clínicas que já
-- cadastraram a legenda sugerida) precisa ser corrigido aqui também, não
-- só o texto sugerido daqui pra frente na tela — ver agente-ia/page.tsx.
UPDATE "ResultPhoto"
SET "caption" = 'Separei um resultado real pra você ver' ||
  substring("caption" from char_length('Separei um resultado real de um procedimento parecido com o que você quer') + 1)
WHERE "caption" ILIKE 'Separei um resultado real de um procedimento parecido com o que você quer%';

UPDATE "ResultPhoto"
SET "caption" = 'Separei um resultado real pra você ver' ||
  substring("caption" from char_length('Separei um resultado real parecido com o que você quer') + 1)
WHERE "caption" ILIKE 'Separei um resultado real parecido com o que você quer%'
  AND "caption" NOT ILIKE 'Separei um resultado real de um procedimento parecido com o que você quer%';

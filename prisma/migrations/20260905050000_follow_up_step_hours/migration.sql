-- Unifica as duas sequências de follow-up (SILENCE e NO_SHOW) em horas.
-- O valor já armazenado era interpretado como DIAS pelo dispatcher
-- (dispatchFollowUpSteps em src/lib/follow-up.ts usava addDays), então a
-- conversão multiplica por 24 pra preservar o tempo real já configurado
-- (ex: um passo com offsetDays = 3 continua valendo "3 dias" depois da
-- migração, agora armazenado como offsetHours = 72).
ALTER TABLE "FollowUpStep" RENAME COLUMN "offsetDays" TO "offsetHours";
UPDATE "FollowUpStep" SET "offsetHours" = "offsetHours" * 24;

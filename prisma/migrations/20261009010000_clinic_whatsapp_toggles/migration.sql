-- Só adição de colunas nullable-equivalentes (NOT NULL com DEFAULT false,
-- aplicado a toda linha existente pelo próprio Postgres sem reescrever a
-- tabela) — sem backfill manual, sem dropar nada, sem tocar em nenhum
-- outro campo. Interruptores por clínica, padrão desligado (ver
-- Clinic.notifyWhatsappEnabled/remindersWhatsappEnabled, schema.prisma).
ALTER TABLE "Clinic" ADD COLUMN "notifyWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN "remindersWhatsappEnabled" BOOLEAN NOT NULL DEFAULT false;

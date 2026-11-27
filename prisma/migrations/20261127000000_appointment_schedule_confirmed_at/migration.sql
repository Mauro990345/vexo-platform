-- scheduleConfirmedAt (ver Appointment.scheduleConfirmedAt no schema) — usado
-- por processReminders (reminders.ts) pra saber com quanta antecedência o
-- lead marcou o horário, e decidir se o lembrete mais longo ainda faz
-- sentido mandar.

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "scheduleConfirmedAt" TIMESTAMP(3);

-- Agendamentos já existentes: sem um instante de confirmação de verdade
-- registrado, createdAt (quando o registro foi criado) é a melhor
-- aproximação disponível.
UPDATE "Appointment" SET "scheduleConfirmedAt" = "createdAt" WHERE "scheduleConfirmedAt" IS NULL;

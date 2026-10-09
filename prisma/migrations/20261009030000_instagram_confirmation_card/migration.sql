-- Só adição de colunas nullable, sem backfill nem reescrita de nenhuma
-- linha existente — confirmação de agendamento por Instagram (cartão,
-- Generic Template sem botão) independente da confirmação por WhatsApp já
-- existente (Appointment.whatsappConfirmationSentAt). Ver
-- Appointment.instagramConfirmationSentAt e Message.instagramConfirmationCard,
-- schema.prisma.
ALTER TABLE "Appointment" ADD COLUMN "instagramConfirmationSentAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "instagramConfirmationCard" TEXT;

-- NOT NULL com DEFAULT false, aplicado a toda linha existente pelo
-- próprio Postgres sem reescrever a tabela (mesmo padrão de
-- Clinic.notifyWhatsappEnabled/remindersWhatsappEnabled, ver migration
-- 20261009010000_clinic_whatsapp_toggles) — marca só as Messages novas de
-- confirmação de agendamento por WhatsApp; toda linha existente vira
-- false, preservando o comportamento de sempre (sem retry) pra elas.
ALTER TABLE "Message" ADD COLUMN "isAppointmentConfirmation" BOOLEAN NOT NULL DEFAULT false;

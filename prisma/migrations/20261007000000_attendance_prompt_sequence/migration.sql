-- Só adição de colunas nullable — sem default, sem backfill, sem dropar
-- nada (Appointment.attendanceConfirmedAt fica na tabela, só parou de ser
-- usada no fluxo novo, ver comentário em prisma/schema.prisma).
ALTER TABLE "Appointment" ADD COLUMN "attendancePromptSentAt" TIMESTAMP(3);
ALTER TABLE "Clinic" ADD COLUMN "attendanceTipMessage" TEXT;

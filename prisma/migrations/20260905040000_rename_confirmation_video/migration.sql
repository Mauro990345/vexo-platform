-- Renomeia campos ligados ao "vídeo de boas-vindas" pra refletir o que
-- eles realmente fazem: o vídeo é enviado APÓS o agendamento ser
-- confirmado na conversa, não como saudação genérica no início.
ALTER TABLE "Clinic" RENAME COLUMN "welcomeVideoUrl" TO "confirmationVideoUrl";
ALTER TABLE "Appointment" RENAME COLUMN "welcomeVideoSentAt" TO "confirmationVideoSentAt";

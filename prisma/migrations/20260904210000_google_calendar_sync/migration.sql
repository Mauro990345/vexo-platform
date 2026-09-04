-- AlterTable: campos usados pela sincronização de leitura do Google Calendar
ALTER TABLE "Appointment" ADD COLUMN "manualTitle" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "syncedFromGoogle" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GoogleCalendarAccount" ADD COLUMN "syncToken" TEXT;

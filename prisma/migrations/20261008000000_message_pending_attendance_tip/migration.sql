-- Só adição de coluna nullable — sem default, sem backfill, sem dropar
-- nada. Metadado puro no Postgres (não reescreve a tabela, não trava
-- linhas existentes).
ALTER TABLE "Message" ADD COLUMN "pendingAttendanceTip" TEXT;

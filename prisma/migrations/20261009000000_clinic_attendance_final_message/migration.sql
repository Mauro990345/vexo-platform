-- Só adição de coluna nullable — sem default, sem backfill, sem dropar
-- nada. Metadado puro no Postgres (não reescreve a tabela, não trava
-- linhas existentes). Message.pendingAttendanceTip -> pendingAttendanceStep
-- (schema.prisma) é só um rename de campo no Prisma Client via @map,
-- mantendo a coluna física "pendingAttendanceTip" intacta — não precisa
-- de nenhuma instrução SQL aqui.
ALTER TABLE "Clinic" ADD COLUMN "attendanceFinalMessage" TEXT;

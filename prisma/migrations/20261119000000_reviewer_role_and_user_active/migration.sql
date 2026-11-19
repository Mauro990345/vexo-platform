-- Login "Revisor" pro App Review da Meta (ver DESIGN.md) — puramente
-- aditivo: um novo valor de enum (UserRole) e uma coluna nova em User com
-- default true, que preserva 100% o comportamento de toda linha já
-- existente (Admin/Equipe/Cliente continuam ativos sem precisar de
-- backfill nenhum).

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'REVIEWER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

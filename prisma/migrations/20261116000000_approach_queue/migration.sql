-- Fila de abordagem (1ª mensagem manual, pelo Instagram do celular) — ver
-- DESIGN.md e src/lib/approach-queue.ts. Puramente aditivo: um novo valor de
-- enum (UserRole), uma tabela de liberação por clínica (ApproachAccess,
-- ainda sem nenhuma rota lendo dela — reservada pro futuro papel
-- APPROACH_AGENT), 3 tabelas novas da fila em si, e uma coluna nova opcional
-- em ApproachLog (link pro item que criou aquela linha, usado só pelo
-- Desfazer). Nenhuma coluna existente alterada, nenhum backfill.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'APPROACH_AGENT';

-- CreateEnum
CREATE TYPE "ApproachQueueItemStatus" AS ENUM ('QUEUED', 'SENT', 'SKIPPED');

-- CreateTable
CREATE TABLE "ApproachAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproachAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachQueueConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 60,
    "activeInQueue" BOOLEAN NOT NULL DEFAULT false,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntil" TIMESTAMP(3),
    "lastMessageSlot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachQueueConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachMessagesConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "message1" TEXT,
    "message2" TEXT,
    "message3" TEXT,
    "message4" TEXT,
    "message5" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApproachMessagesConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApproachQueueItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "name" TEXT,
    "status" "ApproachQueueItemStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "approachLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproachQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApproachAccess_clinicId_idx" ON "ApproachAccess"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachAccess_userId_clinicId_key" ON "ApproachAccess"("userId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachQueueConfig_clinicId_key" ON "ApproachQueueConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachMessagesConfig_clinicId_key" ON "ApproachMessagesConfig"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachQueueItem_approachLogId_key" ON "ApproachQueueItem"("approachLogId");

-- CreateIndex
CREATE UNIQUE INDEX "ApproachQueueItem_clinicId_usernameNormalized_key" ON "ApproachQueueItem"("clinicId", "usernameNormalized");

-- CreateIndex
CREATE INDEX "ApproachQueueItem_clinicId_status_createdAt_idx" ON "ApproachQueueItem"("clinicId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "ApproachAccess" ADD CONSTRAINT "ApproachAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachAccess" ADD CONSTRAINT "ApproachAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachQueueConfig" ADD CONSTRAINT "ApproachQueueConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachMessagesConfig" ADD CONSTRAINT "ApproachMessagesConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachQueueItem" ADD CONSTRAINT "ApproachQueueItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachQueueItem" ADD CONSTRAINT "ApproachQueueItem_approachLogId_fkey" FOREIGN KEY ("approachLogId") REFERENCES "ApproachLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

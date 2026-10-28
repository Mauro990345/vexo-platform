-- Dois novos tipos de card na Reativação do Painel ("Faltou" e "Quente",
-- ver no-show-cards.ts/hot-lead-cards.ts). Puramente aditivo: 4 tabelas
-- novas, nenhuma coluna existente alterada/removida, nenhum backfill
-- (tudo nasce vazio/NULL, comportamento idêntico ao de antes nestas
-- tabelas para qualquer linha já existente em outras tabelas).

-- CreateTable
CREATE TABLE "NoShowCardSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "day3Content" TEXT,
    "day10Content" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoShowCardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoShowCardSlot" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoShowCardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoShowCardSlot_appointmentId_step_key" ON "NoShowCardSlot"("appointmentId", "step");

-- AddForeignKey
ALTER TABLE "NoShowCardSlot" ADD CONSTRAINT "NoShowCardSlot_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "HotLeadConfig" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 5,
    "message1" TEXT,
    "message2" TEXT,
    "message3" TEXT,
    "message4" TEXT,
    "message5" TEXT,
    "sequenceCounter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotLeadConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotLeadConfig_clinicId_key" ON "HotLeadConfig"("clinicId");

-- AddForeignKey
ALTER TABLE "HotLeadConfig" ADD CONSTRAINT "HotLeadConfig_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "HotLeadCardSlot" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotLeadCardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotLeadCardSlot_conversationId_key" ON "HotLeadCardSlot"("conversationId");

-- AddForeignKey
ALTER TABLE "HotLeadCardSlot" ADD CONSTRAINT "HotLeadCardSlot_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

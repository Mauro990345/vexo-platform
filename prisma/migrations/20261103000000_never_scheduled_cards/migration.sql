-- Card "Não agendou" no Painel (ver never-scheduled-cards.ts) — lead que
-- nunca agendou, sem atividade na conversa há 30 (D30) ou 60 (D60) dias.
-- Puramente aditivo: 2 tabelas novas, nenhuma coluna existente alterada,
-- nenhum backfill (tudo nasce vazio, comportamento idêntico ao de antes
-- em qualquer tabela já existente).

-- CreateTable
CREATE TABLE "NeverScheduledCardSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "day30Content" TEXT,
    "day60Content" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeverScheduledCardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeverScheduledCardSlot" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NeverScheduledCardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NeverScheduledCardSlot_conversationId_step_key" ON "NeverScheduledCardSlot"("conversationId", "step");

-- AddForeignKey
ALTER TABLE "NeverScheduledCardSlot" ADD CONSTRAINT "NeverScheduledCardSlot_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

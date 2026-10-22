-- Reativação passa a suportar vários períodos marcados ao mesmo tempo
-- (30/60/90/120/150 dias, cada um independente) em vez de um só. Ainda não
-- existe nenhum dado real de Reativação em produção (feature recém
-- mesclada, nunca configurada por nenhuma clínica) — por isso dá pra
-- trocar/remover as colunas antigas sem nenhum backfill: não há linha pra
-- migrar, só a forma da coluna muda.

-- ReactivationConfig.thresholdDays (Int único) -> thresholdDaysList
-- (Int[], suporta vários períodos marcados). A coluna nova entra com
-- DEFAULT ARRAY[150] em toda linha já existente (nenhuma hoje, mas seguro
-- mesmo que existisse), a antiga é descartada.
ALTER TABLE "ReactivationConfig" ADD COLUMN "thresholdDaysList" INTEGER[] NOT NULL DEFAULT ARRAY[150]::INTEGER[];
ALTER TABLE "ReactivationConfig" DROP COLUMN "thresholdDays";

-- Appointment.reactivationMessageSlot (Int único, um valor por agendamento)
-- não bastava mais: com vários períodos marcados, o MESMO agendamento pode
-- ter um card por período. Substituído pela tabela ReactivationCardSlot
-- abaixo, chaveada por (appointmentId, thresholdDays).
ALTER TABLE "Appointment" DROP COLUMN "reactivationMessageSlot";

-- CreateTable
CREATE TABLE "ReactivationCardSlot" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "thresholdDays" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactivationCardSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReactivationCardSlot_appointmentId_thresholdDays_key" ON "ReactivationCardSlot"("appointmentId", "thresholdDays");

-- AddForeignKey
ALTER TABLE "ReactivationCardSlot" ADD CONSTRAINT "ReactivationCardSlot_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

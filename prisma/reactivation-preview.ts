import { PrismaClient } from "@prisma/client";
import {
  selectReactivationCandidates,
  buildReactivationCardCandidates,
  type ReactivationSourceAppointment,
} from "@/lib/reactivation";

const prisma = new PrismaClient();

// Script ÚNICO, SOMENTE LEITURA — prévia de quantos cards a faixa
// "Reativação" mostraria HOJE para uma clínica, num ou mais prazos, SEM
// gravar nada (nunca chama getReactivationCards, que atribui e persiste
// slot — só repete a mesma seleção/filtro de janela que ele usa, em modo
// dry-run). Pedido explícito: "sem alterar nada no banco".
//
// Uso:
//   npx tsx prisma/reactivation-preview.ts --clinic=<id> --days=30,60
//   npx tsx prisma/reactivation-preview.ts --clinic=<id>              # usa 30,60,90,120,150

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const daysArg = args.find((a) => a.startsWith("--days="));

  if (!clinicArg) {
    console.log('Uso: npx tsx prisma/reactivation-preview.ts --clinic=<id> [--days=30,60]');
    return;
  }

  const clinicId = clinicArg.slice("--clinic=".length);
  const thresholdDaysList = daysArg
    ? daysArg
        .slice("--days=".length)
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => Number.isFinite(d) && d > 0)
    : [30, 60, 90, 120, 150];

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Nenhuma clínica encontrada com id "${clinicId}".`);
    return;
  }

  const appointments: ReactivationSourceAppointment[] = await prisma.appointment.findMany({
    where: { clinicId, conversationId: { not: null } },
    select: { id: true, leadId: true, conversationId: true, scheduledAt: true, status: true },
  });

  const candidates = selectReactivationCandidates(appointments);
  const now = new Date();

  console.log(`Clínica: ${clinic.name} (${clinic.id})`);
  console.log(`Agendamentos da IA no total: ${appointments.length} — candidatos elegíveis (sem voltar/faltar/cancelar): ${candidates.length}`);
  console.log("");

  for (const thresholdDays of thresholdDaysList) {
    const cards = buildReactivationCardCandidates(candidates, [thresholdDays], now);
    console.log(`${thresholdDays} dias: ${cards.length} card(s) entrariam hoje na faixa.`);
    for (const card of cards) {
      console.log(`  - agendamento ${card.appointmentId} (lead ${card.leadId}), completou em ${card.window.start.toISOString().slice(0, 10)}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

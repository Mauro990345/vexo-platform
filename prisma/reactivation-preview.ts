import { PrismaClient } from "@prisma/client";
import {
  selectReactivationCandidates,
  computeReactivationWindow,
  isWithinReactivationWindow,
  type ReactivationSourceAppointment,
} from "@/lib/reactivation";

const prisma = new PrismaClient();

// Script ÚNICO, SOMENTE LEITURA — prévia de quantos cards a faixa
// "Reativação" mostraria HOJE para uma clínica, num ou mais prazos, SEM
// gravar nada (nunca chama getReactivationCards, que atribui e persiste
// slot — só repete a mesma seleção/filtro de janela que ele usa, em modo
// dry-run). Pedido explícito: "sem alterar nada no banco".
//
// Lista TODO candidato elegível (não só os que já estão na janela hoje),
// com nome do lead, data do agendamento, dias já passados desde então, e
// pra CADA período pedido: quando aquele candidato entraria na faixa
// (data de início da janela de 5 dias úteis) e se isso já passou, está
// acontecendo agora ou ainda vai acontecer.
//
// Uso:
//   npx tsx prisma/reactivation-preview.ts --clinic=<id> --days=7,10,30,60
//   npx tsx prisma/reactivation-preview.ts --clinic=<id>                  # usa 7,10,30,60,90,120,150

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function leadLabel(lead: { name: string | null; igUsername: string | null } | undefined): string {
  if (!lead) return "(lead não encontrado)";
  if (lead.name) return lead.name;
  if (lead.igUsername) return `@${lead.igUsername}`;
  return "(lead sem nome)";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const daysArg = args.find((a) => a.startsWith("--days="));

  if (!clinicArg) {
    console.log("Uso: npx tsx prisma/reactivation-preview.ts --clinic=<id> [--days=7,10,30,60]");
    return;
  }

  const clinicId = clinicArg.slice("--clinic=".length);
  const thresholdDaysList = daysArg
    ? daysArg
        .slice("--days=".length)
        .split(",")
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => Number.isFinite(d) && d > 0)
    : [7, 10, 30, 60, 90, 120, 150];

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

  const leads = await prisma.lead.findMany({
    where: { id: { in: candidates.map((c) => c.leadId) } },
    select: { id: true, name: true, igUsername: true },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  console.log(`Clínica: ${clinic.name} (${clinic.id})`);
  console.log(`Agendamentos da IA no total: ${appointments.length} — candidatos elegíveis (sem voltar/faltar/cancelar): ${candidates.length}`);
  console.log(`Períodos consultados: ${thresholdDaysList.join(", ")} dias`);
  console.log("");

  console.log("--- Resumo: quantos entrariam na faixa HOJE, por período ---");
  for (const thresholdDays of thresholdDaysList) {
    const countToday = candidates.filter((c) => isWithinReactivationWindow(computeReactivationWindow(c.scheduledAt, thresholdDays), now)).length;
    console.log(`  ${thresholdDays} dias: ${countToday} card(s) hoje.`);
  }

  console.log("");
  console.log("--- Candidatos elegíveis (detalhe por período) ---");
  if (candidates.length === 0) {
    console.log("  Nenhum candidato elegível (nenhum agendamento da IA sem voltar/faltar/cancelar).");
  }

  for (const candidate of candidates) {
    const daysElapsed = Math.floor((now.getTime() - candidate.scheduledAt.getTime()) / MS_PER_DAY);
    console.log(
      `\n  ${leadLabel(leadById.get(candidate.leadId))} — agendamento ${candidate.appointmentId} em ${candidate.scheduledAt
        .toISOString()
        .slice(0, 10)} (${daysElapsed} dia(s) atrás)`
    );
    for (const thresholdDays of thresholdDaysList) {
      const window = computeReactivationWindow(candidate.scheduledAt, thresholdDays);
      const startStr = window.start.toISOString().slice(0, 10);
      const endStr = window.end.toISOString().slice(0, 10);
      let statusLabel: string;
      if (isWithinReactivationWindow(window, now)) {
        statusLabel = `NA FAIXA AGORA (até ${endStr})`;
      } else if (now.getTime() < window.start.getTime()) {
        statusLabel = "ainda não chegou";
      } else {
        statusLabel = "já passou";
      }
      console.log(`    ${thresholdDays} dias: entraria em ${startStr} — ${statusLabel}`);
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

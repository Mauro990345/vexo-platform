import { PrismaClient } from "@prisma/client";
import {
  selectReactivationCandidates,
  resolveAppointmentReturnPeriods,
  computeReturnContactWindow,
  isWithinReactivationWindow,
  DEFAULT_RETURN_PERIODS,
  type ReactivationSourceAppointment,
} from "../src/lib/reactivation";
import { DEMO_CLINIC_ID } from "./clean-no-photo-demo-data-logic";

const prisma = new PrismaClient();

// Script de DIAGNÓSTICO, 100% leitura — nenhum INSERT/UPDATE/DELETE em
// lugar nenhum. Responde "por que os cards de Reativação sumiram da
// Clínica Demo depois da PR #147" com dados reais, reaproveitando as
// MESMAS funções puras de src/lib/reactivation.ts que o app usa de
// verdade (selectReactivationCandidates/resolveAppointmentReturnPeriods/
// computeReturnContactWindow) — não reimplementa a regra, só a aplica sem
// o filtro de "só o que está na janela AGORA" (buildReactivationCardCandidates
// filtra isso; aqui mostramos TODA janela, passada ou futura, pra dar o
// quadro completo).
//
// Uso (padrão: Clínica Demo VEXO; --clinic=<id> pra outra clínica — só
// leitura, sem restrição de segurança adicional):
//   npx tsx prisma/diagnose-reactivation-demo.ts
//   npx tsx prisma/diagnose-reactivation-demo.ts --clinic=<outroId>

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const clinicId = clinicArg ? clinicArg.slice("--clinic=".length) : DEMO_CLINIC_ID;

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Nenhuma clínica encontrada com id "${clinicId}".`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})\n`);

  const now = new Date();

  // ---- A) Config atual de Reativação ----
  const config = await prisma.reactivationConfig.findUnique({ where: { clinicId } });
  const defaultPeriods = config?.defaultPeriods?.length ? config.defaultPeriods : DEFAULT_RETURN_PERIODS;
  console.log("--- A) ReactivationConfig ---");
  if (!config) {
    console.log("Nenhum ReactivationConfig gravado ainda — usando o fallback de código (defaultPeriods = [30,60]).");
  } else {
    console.log(`availablePeriods: [${config.availablePeriods.join(", ")}]`);
    console.log(`defaultPeriods (usado quando o agendamento NÃO tem prazo marcado manualmente): [${config.defaultPeriods.join(", ")}]`);
    console.log(`dailyWhatsappLimit: ${config.dailyWhatsappLimit}`);
  }
  console.log("");

  // ---- B) Candidatos (mesma função pura usada pelo app) ----
  const appointmentRows = await prisma.appointment.findMany({
    where: { clinicId, conversationId: { not: null } },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      scheduledAt: true,
      status: true,
      returnPeriodDays: true,
      returnPeriodNone: true,
      lead: { select: { name: true, igUsername: true, phone: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });
  console.log(`--- B) Agendamentos elegíveis (com conversationId, qualquer status) ---`);
  console.log(`Total: ${appointmentRows.length}\n`);

  const sourceAppointments: ReactivationSourceAppointment[] = appointmentRows.map((a) => ({
    id: a.id,
    leadId: a.leadId,
    conversationId: a.conversationId,
    scheduledAt: a.scheduledAt,
    status: a.status,
    returnPeriodDays: a.returnPeriodDays,
    returnPeriodNone: a.returnPeriodNone,
  }));
  const candidates = selectReactivationCandidates(sourceAppointments);
  const candidateById = new Map(appointmentRows.map((a) => [a.id, a]));

  console.log(`--- C) Candidatos (agendamento mais recente por lead, não CANCELLED, não o mais recente = NO_SHOW) ---`);
  console.log(`Total: ${candidates.length}\n`);

  let markedCount = 0;
  let unmarkedCount = 0;
  let noneCount = 0;
  let currentlyVisibleCount = 0;

  for (const c of candidates) {
    const row = candidateById.get(c.appointmentId)!;
    const leadLabel = row.lead?.name ?? (row.lead?.igUsername ? `@${row.lead.igUsername}` : "(sem nome)");
    const channel = row.lead?.phone ? "WHATSAPP" : "INSTAGRAM";

    if (c.returnPeriodNone) noneCount++;
    else if (c.returnPeriodDays != null) markedCount++;
    else unmarkedCount++;

    const periods = resolveAppointmentReturnPeriods(c, defaultPeriods);
    const periodsLabel = c.returnPeriodNone
      ? "Sem retorno (marcado) — nenhum card"
      : c.returnPeriodDays != null
        ? `${c.returnPeriodDays} dias (marcado manualmente)`
        : `[${periods.join(", ")}] (padrão da clínica, não marcado)`;

    console.log(`${leadLabel} — atendido em ${fmtDate(c.scheduledAt)} — canal ${channel} — prazo: ${periodsLabel}`);
    for (const thresholdDays of periods) {
      const window = computeReturnContactWindow(c.scheduledAt, thresholdDays);
      const visible = isWithinReactivationWindow(window, now);
      if (visible) currentlyVisibleCount++;
      console.log(
        `    prazo ${thresholdDays}d -> janela ${fmtDate(window.start)} a ${fmtDate(window.end)} ${
          visible ? "— VISÍVEL HOJE" : now < window.start ? "— ainda não chegou" : "— já passou"
        }`
      );
    }
  }

  console.log(`\n--- Resumo ---`);
  console.log(`Candidatos com prazo MARCADO manualmente: ${markedCount}`);
  console.log(`Candidatos SEM marcação (usam defaultPeriods da clínica): ${unmarkedCount}`);
  console.log(`Candidatos marcados "Sem retorno" (nunca geram card): ${noneCount}`);
  console.log(`Cards visíveis HOJE (em qualquer prazo): ${currentlyVisibleCount}`);

  // ---- D) Slots existentes (histórico, nunca apagado por nenhuma migration) ----
  const slots = await prisma.reactivationCardSlot.findMany({
    where: { appointment: { clinicId } },
    select: { appointmentId: true, thresholdDays: true, slot: true, sentAt: true },
  });
  const sentSlots = slots.filter((s) => s.sentAt);
  console.log(`\n--- D) ReactivationCardSlot (histórico) ---`);
  console.log(`Total de linhas: ${slots.length}`);
  console.log(`Com sentAt (já enviados, histórico preservado): ${sentSlots.length}`);
  if (sentSlots.length > 0) {
    const oldest = sentSlots.reduce((a, b) => (a.sentAt! < b.sentAt! ? a : b));
    const newest = sentSlots.reduce((a, b) => (a.sentAt! > b.sentAt! ? a : b));
    console.log(`Mais antigo: ${fmtDate(oldest.sentAt!)} — Mais recente: ${fmtDate(newest.sentAt!)}`);
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

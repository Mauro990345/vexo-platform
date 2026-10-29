import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { DEMO_CLINIC_ID, assertDemoClinic } from "./clean-no-photo-demo-data-logic";
import {
  selectShowcaseCandidates,
  assignShowcasePeriods,
  computeShowcaseScheduledAt,
  maskPhone,
  type ShowcaseCandidate,
} from "./reactivation-showcase-logic";
import { selectReactivationCandidates, resolveAvailableReactivationSlots, type ReactivationSourceAppointment } from "../src/lib/reactivation";
import { appointmentDisplayStatus } from "../src/lib/metrics";

const prisma = new PrismaClient();

// Script de DEMONSTRAÇÃO, restrito à Clínica Demo VEXO — marca prazo de
// Retorno em 5 agendamentos ATENDIDOS que JÁ EXISTEM na clínica (pacientes
// reais do dono da conta — NUNCA cria lead/agendamento fictício, ao
// contrário de seed-return-demo.ts) pra 5 cards de Reativação aparecerem
// ao mesmo tempo no Painel: 2 Instagram + 3 WhatsApp, prazos diferentes,
// 1 já no estado "enviado" (ver reactivation-showcase-logic.ts pra como
// a seleção/atribuição é decidida).
//
// RE-EXECUTÁVEL (pedido explícito — o card só fica visível ±3 dias em
// volta de scheduledAt+prazo, ver computeReturnContactWindow,
// reactivation.ts): cada execução recalcula scheduledAt a partir de
// "agora" (computeShowcaseScheduledAt) pra janela cair sempre em cima do
// dia de hoje, SÓ nesses 5 agendamentos. A seleção dos 5 (quais
// agendamentos/pacientes) é feita UMA VEZ (1ª execução, os mais recentes
// atendidos — 2 sem telefone + 3 com telefone) e persistida em
// reactivation-showcase-state.json (mesma pasta, gitignored) — execuções
// seguintes reusam os MESMOS 5 ids, sem reselecionar. Esse arquivo também
// GUARDA o scheduledAt/returnPeriodDays/returnPeriodNone ORIGINAL de cada
// um (capturado só na 1ª vez que cada agendamento é tocado, nunca
// sobrescrito depois) — é o backup pra restaurar (--restore) depois.
//
// CAVEAT (deixar explícito pro dono): o arquivo de estado vive no disco
// do container — sobrevive entre execuções no MESMO deploy, mas um
// redeploy do Railway apaga o filesystem e perde a memória de "quais 5
// ids já foram escolhidos" (o backup do scheduledAt ORIGINAL também se
// perde nesse caso). Rodar de novo sem o arquivo simplesmente escolhe os
// 5 mais recentes atendidos de novo, do zero — não quebra, só perde a
// continuidade com a seleção anterior.
//
// Uso (sempre a Clínica Demo VEXO — qualquer outro id é recusado):
//   npm run prisma:seed:reactivation-showcase               # aplica/reaplica os 5 cards
//   npm run prisma:seed:reactivation-showcase -- --restore  # desfaz: restaura scheduledAt/prazo originais dos 5

const STATE_FILE_PATH = path.join(process.cwd(), "prisma", "reactivation-showcase-state.json");

type OriginalBackup = { scheduledAt: string; returnPeriodDays: number | null; returnPeriodNone: boolean };
type ShowcaseState = {
  clinicId: string;
  appointmentIds: string[];
  originals: Record<string, OriginalBackup>;
};

function loadState(): ShowcaseState | null {
  if (!fs.existsSync(STATE_FILE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE_PATH, "utf8")) as ShowcaseState;
  } catch {
    console.log(`Aviso: ${STATE_FILE_PATH} existe mas não pôde ser lido (JSON inválido) — ignorando, uma nova seleção será feita.`);
    return null;
  }
}

function saveState(state: ShowcaseState): void {
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restore = args.includes("--restore");

  // Recusa EXPLÍCITA pra qualquer outro --clinic= (pedido explícito) —
  // mesmo padrão/mensagem de clean-no-photo-demo-data.ts. Sem a flag,
  // cai no default (DEMO_CLINIC_ID) normalmente; assertDemoClinic lança
  // e aborta ANTES de qualquer leitura/escrita se alguém passar outro id.
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const clinicId = clinicArg ? clinicArg.slice("--clinic=".length) : DEMO_CLINIC_ID;
  assertDemoClinic(clinicId);

  const clinic = await prisma.clinic.findUnique({ where: { id: DEMO_CLINIC_ID }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Clínica Demo VEXO (id "${DEMO_CLINIC_ID}") não encontrada neste banco.`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})\n`);

  if (restore) {
    await runRestore();
    return;
  }

  const now = new Date();
  const existingState = loadState();

  let appointmentIds: string[];

  if (existingState && existingState.appointmentIds.length > 0) {
    appointmentIds = existingState.appointmentIds;
    console.log(`Reusando a seleção de agendamentos já feita antes (${appointmentIds.length} id(s), ver ${STATE_FILE_PATH}).\n`);
  } else {
    // ---- Seleção (só quando não há estado anterior): agendamentos
    // ATENDIDOS (displayStatus COMPLETED) com conversationId+leadId, igual
    // ao critério real de elegibilidade da Reativação (selectReactivationCandidates) ----
    const rows = await prisma.appointment.findMany({
      where: { clinicId: DEMO_CLINIC_ID, conversationId: { not: null }, leadId: { not: null } },
      select: {
        id: true,
        leadId: true,
        conversationId: true,
        scheduledAt: true,
        status: true,
        returnPeriodDays: true,
        returnPeriodNone: true,
        lead: { select: { phone: true } },
      },
    });
    const attended = rows.filter((a) => appointmentDisplayStatus(a, now) === "COMPLETED");

    const source: ReactivationSourceAppointment[] = attended.map((a) => ({
      id: a.id,
      leadId: a.leadId,
      conversationId: a.conversationId,
      scheduledAt: a.scheduledAt,
      status: a.status,
      returnPeriodDays: a.returnPeriodDays,
      returnPeriodNone: a.returnPeriodNone,
    }));
    // Um candidato por LEAD (mesma regra real — o agendamento mais recente
    // decide, nunca dois cards do mesmo paciente).
    const perLeadCandidates = selectReactivationCandidates(source);
    const byId = new Map(attended.map((a) => [a.id, a]));

    const showcaseCandidates: ShowcaseCandidate[] = perLeadCandidates.map((c) => ({
      appointmentId: c.appointmentId,
      leadId: c.leadId,
      scheduledAt: c.scheduledAt,
      hasPhone: Boolean(byId.get(c.appointmentId)?.lead?.phone),
    }));

    const selection = selectShowcaseCandidates(showcaseCandidates, 2, 3);
    if (selection.warnings.includes("not_enough_instagram")) {
      console.log(`⚠️  Só ${selection.instagram.length} paciente(s) atendido(s) SEM telefone (canal Instagram) disponível — pedido era 2.`);
    }
    if (selection.warnings.includes("not_enough_whatsapp")) {
      console.log(`⚠️  Só ${selection.whatsapp.length} paciente(s) atendido(s) COM telefone (canal WhatsApp) disponível — pedido era 3.`);
    }
    const total = selection.instagram.length + selection.whatsapp.length;
    if (total === 0) {
      console.log("\nNenhum agendamento atendido (com conversa vinculada) encontrado na Clínica Demo — nada a fazer.");
      return;
    }
    if (total < 5) {
      console.log(`Seguindo com ${total} card(s) em vez de 5 (não há pacientes suficientes no momento).\n`);
    }

    appointmentIds = [...selection.instagram, ...selection.whatsapp].map((c) => c.appointmentId);
    saveState({ clinicId: DEMO_CLINIC_ID, appointmentIds, originals: existingState?.originals ?? {} });
  }

  // ---- Releitura fresca dos 5 (ou menos) agendamentos escolhidos ----
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds }, clinicId: DEMO_CLINIC_ID },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      returnPeriodDays: true,
      returnPeriodNone: true,
      lead: { select: { name: true, igUsername: true, phone: true } },
    },
  });
  if (appointments.length !== appointmentIds.length) {
    console.log("⚠️  Algum agendamento da seleção anterior não existe mais (apagado?) — rode sem --restore de novo pra reselecionar do zero depois de limpar reactivation-showcase-state.json.");
  }

  const candidatesForAssignment: ShowcaseCandidate[] = appointments.map((a) => ({
    appointmentId: a.id,
    leadId: a.leadId!,
    scheduledAt: a.scheduledAt,
    hasPhone: Boolean(a.lead?.phone),
  }));
  const instagram = candidatesForAssignment.filter((c) => !c.hasPhone);
  const whatsapp = candidatesForAssignment.filter((c) => c.hasPhone);
  const assignments = assignShowcasePeriods({ instagram, whatsapp, warnings: [] });

  // ---- Backup do valor ORIGINAL (só na 1ª vez que cada id é tocado — nunca sobrescreve) ----
  const state = loadState() ?? { clinicId: DEMO_CLINIC_ID, appointmentIds, originals: {} };
  const byId = new Map(appointments.map((a) => [a.id, a]));
  for (const a of appointments) {
    if (!state.originals[a.id]) {
      state.originals[a.id] = {
        scheduledAt: a.scheduledAt.toISOString(),
        returnPeriodDays: a.returnPeriodDays,
        returnPeriodNone: a.returnPeriodNone,
      };
    }
  }
  saveState(state);

  // ---- Aplica: scheduledAt recalculado + prazo marcado, só nesses ids ----
  const availableSlots = resolveAvailableReactivationSlots([null, null, null, null, null]); // [1,2,3,4,5] — sem mensagem customizada, mesmo fallback do app.
  console.log("--- Cards de Reativação (showcase) ---\n");
  const summaryRows: { name: string; channel: string; period: number; sent: boolean; phoneLine: string; windowLabel: string }[] = [];

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]!;
    const appt = byId.get(a.appointmentId)!;
    const newScheduledAt = computeShowcaseScheduledAt(now, a.periodDays);

    await prisma.appointment.update({
      where: { id: a.appointmentId },
      data: { scheduledAt: newScheduledAt, returnPeriodDays: a.periodDays, returnPeriodNone: false },
    });

    const slotNumber = availableSlots[i % availableSlots.length]!;
    await prisma.reactivationCardSlot.upsert({
      where: { appointmentId_thresholdDays: { appointmentId: a.appointmentId, thresholdDays: a.periodDays } },
      create: { appointmentId: a.appointmentId, thresholdDays: a.periodDays, slot: slotNumber, sentAt: a.alreadySent ? now : null },
      update: { sentAt: a.alreadySent ? now : null },
    });

    const windowStart = new Date(newScheduledAt.getTime() + (a.periodDays - 3) * 86_400_000);
    const windowEnd = new Date(newScheduledAt.getTime() + (a.periodDays + 3) * 86_400_000);
    const phoneLine = appt.lead?.phone ? `WhatsApp real: ${maskPhone(appt.lead.phone)}` : "(sem telefone — canal Instagram, copiar+abrir)";
    summaryRows.push({
      name: appt.lead?.name ?? appt.lead?.igUsername ?? "(sem nome)",
      channel: a.channel,
      period: a.periodDays,
      sent: a.alreadySent,
      phoneLine,
      windowLabel: `${windowStart.toISOString().slice(0, 10)} a ${windowEnd.toISOString().slice(0, 10)}`,
    });
  }

  console.log("Paciente — Canal — Prazo — Estado — Janela de exibição\n");
  for (const r of summaryRows) {
    console.log(`${r.name} — ${r.channel} — ${r.period} dias — ${r.sent ? "✓ já enviado (esmaecido)" : "pendente"} — visível ${r.windowLabel}`);
    if (r.channel === "WHATSAPP") console.log(`    ${r.phoneLine}${r.sent ? " (marcado como enviado pelo script — nenhuma mensagem real foi disparada agora)" : " — clicar \"Enviar\" no card manda uma mensagem REAL pra este número"}`);
    else console.log(`    ${r.phoneLine}`);
  }

  console.log(`\n${summaryRows.length} card(s) de Reativação devem aparecer agora no Painel da Clínica Demo.`);
  console.log(`\nPra desfazer (restaura scheduledAt/prazo originais dos ${summaryRows.length} agendamentos):\n  npm run prisma:seed:reactivation-showcase -- --restore`);
  console.log(`\nComando pra rodar no Console do Railway (serviço vexo-platform):\n  npm run prisma:seed:reactivation-showcase`);
}

async function runRestore(): Promise<void> {
  const state = loadState();
  if (!state || Object.keys(state.originals).length === 0) {
    console.log("Nenhum backup encontrado (reactivation-showcase-state.json ausente ou vazio) — nada a restaurar.");
    return;
  }
  console.log(`Restaurando ${Object.keys(state.originals).length} agendamento(s) pro valor original...\n`);
  for (const [appointmentId, original] of Object.entries(state.originals)) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        scheduledAt: new Date(original.scheduledAt),
        returnPeriodDays: original.returnPeriodDays,
        returnPeriodNone: original.returnPeriodNone,
      },
    });
    console.log(`  ${appointmentId} -> scheduledAt restaurado pra ${original.scheduledAt}`);
  }
  console.log(
    "\nOs ReactivationCardSlot (histórico de envio) NÃO foram apagados — mesmo princípio do resto do app, nunca apagar histórico de envio. Se quiser removê-los também, apague manualmente por appointmentId."
  );
  fs.unlinkSync(STATE_FILE_PATH);
  console.log(`${STATE_FILE_PATH} removido — a próxima execução sem --restore fará uma seleção nova.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

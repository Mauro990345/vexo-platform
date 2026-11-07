import { PrismaClient } from "@prisma/client";
import { DEMO_CLINIC_ID, assertDemoClinic } from "./clean-no-photo-demo-data-logic";
import { getReactivationReturnStats } from "../src/lib/reactivation";

const prisma = new PrismaClient();

// Script de DEMONSTRAÇÃO, restrito à Clínica Demo VEXO — valida a métrica
// "N enviadas · M voltaram" do cabeçalho da Reativação (ver
// getReactivationReturnStats/formatReactivationReturnLine, reactivation.ts,
// e ReactivationRail.tsx) sem mandar NENHUMA mensagem real a ninguém e sem
// disparar NENHUMA automação (lembrete, confirmação, evento no Google
// Calendar) pro paciente envolvido.
//
// O QUE FAZ (--apply, padrão):
// 1. Pega 1-2 cards FIXOS já existentes (ver ReactivationShowcaseBackup,
//    criados por "npm run prisma:seed:reactivation-showcase" — precisa
//    rodar aquele script primeiro) e marca o sentAt deles como AGORA — o
//    mesmo efeito do botão "✓"/Instagram no Painel (toggleReactivationCardSent,
//    reactivation.ts), NUNCA o envio de WhatsApp de verdade
//    (sendReactivationWhatsAppMessage, que chama a Evolution API — este
//    script não importa nem chama essa função).
// 2. Cria UM Appointment novo pro MESMO leadId de um desses cards (a
//    "volta") — sem passar pelo fluxo normal de agendamento
//    (scheduleAppointment, conversation-pipeline.ts), que é quem dispara
//    confirmação por WhatsApp/Instagram e cria o evento no Google
//    Calendar. Este script insere a linha DIRETO pelo Prisma, então nada
//    disso é chamado.
//
// POR QUE É SEGURO (nenhuma automação dispara pro Appointment criado):
// - conversationId: null — reminders.ts, o job de timeout de presença
//   (processAttendanceConfirmationTimeouts) e a geração de cards
//   Reativação/Faltou (getReactivationCards/no-show-cards.ts) exigem
//   conversationId/conversa vinculada; sem isso, nenhum dos três nunca
//   enxerga este agendamento.
// - scheduledAt no PASSADO — reminders.ts só considera agendamentos com
//   scheduledAt FUTURO (`gt: now`); um agendamento no passado nunca entra
//   na janela de 12h/3h antes.
// - googleEventId: null — a sincronização do Google Calendar (pull E
//   push) só toca um Appointment que ela mesma casou por googleEventId;
//   sem isso, o sync nunca encontra nem altera esta linha.
// - Nenhuma chamada a scheduleAppointment/maybeSendWhatsappConfirmation/
//   maybeSendInstagramConfirmationCard/createCalendarEvent — essas só
//   disparam dentro do fluxo normal de agendamento da IA, nunca por um
//   scan de fundo; como o script nunca as chama, elas simplesmente não
//   existem neste caminho.
//
// REVERSÍVEL (--restore): desfaz exatamente o que este script aplicou,
// nunca mais — ver ReactivationReturnDemoBackup (schema.prisma): cada
// linha é OU um card cujo sentAt restaura ao valor original (pode ser
// null) OU o Appointment criado, simplesmente apagado. Os cards FIXOS em
// si (ReactivationShowcaseBackup) nunca são tocados por este script.
//
// Uso (sempre a Clínica Demo VEXO — qualquer outro id é recusado):
//   npm run prisma:seed:reactivation-return-demo              # aplica
//   npm run prisma:seed:reactivation-return-demo -- --check   # mostra o que está aplicado agora
//   npm run prisma:seed:reactivation-return-demo -- --restore # desfaz tudo

// Mesmo critério de "retorno recente" usado na UI (ver PANEL_PERIODS,
// ClientPanelView.tsx) — só pro resumo impresso no fim, não afeta o que é
// gravado no banco.
const PREVIEW_PERIOD = [{ days: 28, label: "28 dias" }];

function daysAgo(now: Date, d: number): Date {
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
}

function leadLabel(lead: { name: string | null; igUsername: string | null } | null): string {
  return lead?.name ?? (lead?.igUsername ? `@${lead.igUsername}` : "(sem nome)");
}

async function printPreview(): Promise<void> {
  const stats = await getReactivationReturnStats(DEMO_CLINIC_ID, PREVIEW_PERIOD, new Date());
  const s = stats[0];
  if (!s) return;
  console.log(`\nPrévia da métrica no Painel (últimos 28 dias): ${s.sent} enviada(s) · ${s.returned} voltou/voltaram.`);
  if (s.sent === 0) console.log('(Zero enviadas no período — a linha "N enviadas · M voltaram" fica OCULTA no Painel, pedido explícito.)');
}

async function runCheck(): Promise<void> {
  const rows = await prisma.reactivationReturnDemoBackup.findMany({ where: { clinicId: DEMO_CLINIC_ID }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) {
    console.log("Nada aplicado agora (ReactivationReturnDemoBackup vazia pra esta clínica).");
    await printPreview();
    return;
  }

  console.log(`${rows.length} ação(ões) aplicada(s):\n`);
  for (const r of rows) {
    if (r.cardSlotId) {
      const slot = await prisma.reactivationCardSlot.findUnique({
        where: { id: r.cardSlotId },
        include: { appointment: { select: { lead: { select: { name: true, igUsername: true } } } } },
      });
      if (!slot) {
        console.log(`  [card] ${r.cardSlotId} -> não existe mais (apagado?)`);
        continue;
      }
      console.log(
        `  [card] ${leadLabel(slot.appointment.lead)} — sentAt atual: ${slot.sentAt?.toISOString() ?? "(pendente)"} ` +
          `(original: ${r.originalSentAt?.toISOString() ?? "(pendente)"})`
      );
    }
    if (r.createdAppointmentId) {
      const appt = await prisma.appointment.findUnique({
        where: { id: r.createdAppointmentId },
        select: { scheduledAt: true, createdAt: true, status: true, lead: { select: { name: true, igUsername: true } } },
      });
      if (!appt) {
        console.log(`  [agendamento criado] ${r.createdAppointmentId} -> não existe mais`);
        continue;
      }
      console.log(
        `  [agendamento criado] ${leadLabel(appt.lead)} — status ${appt.status}, agendado ${appt.scheduledAt.toISOString()}, ` +
          `criado ${appt.createdAt.toISOString()}`
      );
    }
  }
  await printPreview();
}

async function runRestore(): Promise<void> {
  const rows = await prisma.reactivationReturnDemoBackup.findMany({ where: { clinicId: DEMO_CLINIC_ID } });
  if (rows.length === 0) {
    console.log("Nada aplicado agora — nada a restaurar.");
    return;
  }

  console.log(`Restaurando ${rows.length} ação(ões)...\n`);
  for (const r of rows) {
    if (r.cardSlotId) {
      const slot = await prisma.reactivationCardSlot.findUnique({ where: { id: r.cardSlotId } });
      if (slot) {
        await prisma.reactivationCardSlot.update({ where: { id: r.cardSlotId }, data: { sentAt: r.originalSentAt } });
        console.log(`  card ${r.cardSlotId} -> sentAt restaurado a ${r.originalSentAt?.toISOString() ?? "(pendente)"}`);
      } else {
        console.log(`  card ${r.cardSlotId} -> já não existia, nada a restaurar`);
      }
    }
    if (r.createdAppointmentId) {
      const appt = await prisma.appointment.findUnique({ where: { id: r.createdAppointmentId } });
      if (appt) {
        await prisma.appointment.delete({ where: { id: r.createdAppointmentId } });
        console.log(`  agendamento ${r.createdAppointmentId} -> apagado (foi criado só por este script)`);
      } else {
        console.log(`  agendamento ${r.createdAppointmentId} -> já não existia`);
      }
    }
  }

  await prisma.reactivationReturnDemoBackup.deleteMany({ where: { clinicId: DEMO_CLINIC_ID } });
  console.log("\nBackup removido do banco. Os cards FIXOS (ReactivationShowcaseBackup) não foram tocados.");
  await printPreview();
}

async function runApply(): Promise<void> {
  const already = await prisma.reactivationReturnDemoBackup.count({ where: { clinicId: DEMO_CLINIC_ID } });
  if (already > 0) {
    console.log("Já há uma aplicação em andamento (ver --check). Rode --restore antes de aplicar de novo.");
    await runCheck();
    return;
  }

  const pinned = await prisma.reactivationShowcaseBackup.findMany({ where: { clinicId: DEMO_CLINIC_ID }, select: { appointmentId: true } });
  if (pinned.length === 0) {
    console.log('Nenhum card FIXO encontrado — rode primeiro "npm run prisma:seed:reactivation-showcase".');
    return;
  }

  const slots = await prisma.reactivationCardSlot.findMany({
    where: { appointmentId: { in: pinned.map((p) => p.appointmentId) } },
    include: { appointment: { select: { leadId: true, lead: { select: { name: true, igUsername: true } } } } },
    orderBy: [{ appointmentId: "asc" }, { thresholdDays: "asc" }],
  });
  if (slots.length === 0) {
    console.log('Os cards FIXOS existem mas não têm nenhum ReactivationCardSlot ainda — rode "npm run prisma:seed:reactivation-showcase" de novo.');
    return;
  }

  const chosen = slots.slice(0, Math.min(2, slots.length));
  const now = new Date();

  console.log(`Marcando ${chosen.length} card(s) fixo(s) como enviado(s) agora:\n`);
  for (const slot of chosen) {
    await prisma.reactivationReturnDemoBackup.create({
      data: { clinicId: DEMO_CLINIC_ID, cardSlotId: slot.id, originalSentAt: slot.sentAt },
    });
    await prisma.reactivationCardSlot.update({ where: { id: slot.id }, data: { sentAt: now } });
    console.log(`  ${leadLabel(slot.appointment.lead)} — sentAt antigo: ${slot.sentAt?.toISOString() ?? "(pendente)"} -> agora: ${now.toISOString()}`);
  }

  // A "volta": um Appointment novo pro MESMO leadId do primeiro card
  // marcado acima — ver cabeçalho do arquivo pra por que isso NUNCA
  // dispara lembrete/confirmação/evento no Google Calendar.
  const returnerLeadId = chosen[0]!.appointment.leadId;
  if (!returnerLeadId) {
    console.log("\n⚠️  O card escolhido não tem leadId — não é possível criar o agendamento de retorno (não deveria acontecer com um card fixo).");
    return;
  }

  const created = await prisma.appointment.create({
    data: {
      clinicId: DEMO_CLINIC_ID,
      leadId: returnerLeadId,
      conversationId: null,
      scheduledAt: daysAgo(now, 2),
      status: "COMPLETED",
    },
  });
  await prisma.reactivationReturnDemoBackup.create({
    data: { clinicId: DEMO_CLINIC_ID, createdAppointmentId: created.id },
  });
  console.log(`\nAgendamento de retorno criado pra ${leadLabel(chosen[0]!.appointment.lead)}: id=${created.id}, scheduledAt=${created.scheduledAt.toISOString()} (passado), status=COMPLETED, conversationId=null, googleEventId=null.`);

  await printPreview();
  console.log(`\nPra desfazer (restaura os cards e apaga o agendamento criado):\n  npm run prisma:seed:reactivation-return-demo -- --restore`);
  console.log(`\nPra ver o que está aplicado agora:\n  npm run prisma:seed:reactivation-return-demo -- --check`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restore = args.includes("--restore");
  const check = args.includes("--check");

  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const clinicId = clinicArg ? clinicArg.slice("--clinic=".length) : DEMO_CLINIC_ID;
  assertDemoClinic(clinicId);

  const clinic = await prisma.clinic.findUnique({ where: { id: DEMO_CLINIC_ID }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Clínica Demo VEXO (id "${DEMO_CLINIC_ID}") não encontrada neste banco.`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})`);

  if (restore) return runRestore();
  if (check) return runCheck();
  return runApply();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

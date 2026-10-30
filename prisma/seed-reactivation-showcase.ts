import { PrismaClient } from "@prisma/client";
import { DEMO_CLINIC_ID, assertDemoClinic } from "./clean-no-photo-demo-data-logic";
import { selectShowcaseCandidates, selectForcedInstagramCandidates, assignShowcasePeriods, maskPhone, type ShowcaseCandidate } from "./reactivation-showcase-logic";
import { selectReactivationCandidates, resolveAvailableReactivationSlots, type ReactivationSourceAppointment } from "../src/lib/reactivation";
import { appointmentDisplayStatus } from "../src/lib/metrics";

const prisma = new PrismaClient();

// Script de DEMONSTRAÇÃO, restrito à Clínica Demo VEXO — marca prazo de
// Retorno em 5 agendamentos ATENDIDOS que JÁ EXISTEM na clínica (pacientes
// reais do dono da conta — NUNCA cria lead/agendamento fictício, ao
// contrário de seed-return-demo.ts) pra 5 cards de Reativação aparecerem
// ao mesmo tempo no Painel: 2 Instagram + 3 WhatsApp, prazos diferentes,
// 1 já no estado "enviado" (ver reactivation-showcase-logic.ts pra como a
// seleção/atribuição é decidida).
//
// FIXOS (pedido explícito, usados em vídeos/treinamentos — precisam ficar
// SEMPRE visíveis e funcionando de verdade): a mera EXISTÊNCIA de uma
// linha em ReactivationShowcaseBackup (appointmentId) já marca um card
// como "fixo" — ver getPinnedReactivationCandidates em
// src/lib/reactivation.ts, que ignora por completo a janela de ±3 dias
// (computeReturnContactWindow), o status do agendamento e qual é o
// agendamento mais recente do lead pra esses ids. Esta tabela, portanto,
// deixou de ser só um "backup pra --restore" — também É a marca de fixo.
// Só existe pra esta clínica (assertDemoClinic abaixo), e a lógica em
// reactivation.ts tem uma checagem EXPLÍCITA de clinicId própria (não
// confia só em "a tabela está vazia pras outras") — nenhuma migration
// nova foi necessária.
//
// AJUSTE IMPORTANTE (pedido explícito, rodada em que os cards fixos foram
// criados): este script ATÉ ENTÃO ficava "re-executável" recalculando
// scheduledAt a cada rodada pra cair sempre dentro da janela de ±3 dias
// (e precisava de Appointment.skipGoogleCalendarSync=true pra sync do
// Google Calendar não reverter isso em até 5 min, ver histórico do PR
// #156) — essa abordagem inteira foi ABANDONADA: com os cards virando
// fixos (acima), a janela de datas deixou de importar pra eles, então o
// script PARA DE ALTERAR scheduledAt (e skipGoogleCalendarSync) — se uma
// execução ANTERIOR (versão antiga deste script) tinha alterado esses
// dois campos, a primeira execução da versão nova os restaura pro valor
// original automaticamente (ver "restaura datas de uma versão antiga",
// abaixo) e nunca mais toca neles.
//
// O ✓ de enviado (ReactivationCardSlot.sentAt) passa a ser só do usuário:
// reexecutar o script NUNCA mais sobrescreve um sentAt já existente
// (antes, toda reexecução forçava de volta o estado inicial) — pode
// marcar/desmarcar pela tela quantas vezes quiser pra repetir a
// demonstração, e rodar o script de novo (por qualquer motivo) não desfaz
// isso.
//
// Canal Instagram: se não há 2 pacientes atendidos SEM telefone o
// bastante, o script escolhe pacientes extras (distintos, COM telefone) e
// remove o telefone deles TEMPORARIAMENTE — backup do telefone original
// também vai pro banco, --restore devolve.
//
// Uso (sempre a Clínica Demo VEXO — qualquer outro id é recusado):
//   npm run prisma:seed:reactivation-showcase               # aplica/reaplica os cards fixos
//   npm run prisma:seed:reactivation-showcase -- --restore  # desfaz: remove a marca de fixo, restaura tudo ao valor original

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restore = args.includes("--restore");

  // Recusa EXPLÍCITA pra qualquer outro --clinic= (pedido explícito) —
  // mesmo padrão/mensagem de clean-no-photo-demo-data.ts.
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
  const existingBackups = await prisma.reactivationShowcaseBackup.findMany({ where: { clinicId: DEMO_CLINIC_ID } });

  let appointmentIds: string[];
  let forcedInstagramLeadIds = new Set<string>();

  if (existingBackups.length > 0) {
    appointmentIds = existingBackups.map((b) => b.appointmentId);
    forcedInstagramLeadIds = new Set(existingBackups.filter((b) => b.originalLeadPhone != null).map((b) => b.leadId));
    console.log(`Reusando a seleção de agendamentos já feita antes (${appointmentIds.length} id(s), gravada no banco) — já marcados como FIXOS.\n`);

    // Restaura datas de uma versão ANTIGA deste script (que ainda
    // alterava scheduledAt/skipGoogleCalendarSync pra manter os cards
    // dentro da janela de ±3 dias) — idempotente: se já está no valor
    // original (script já rodou com esta versão antes, ou é a primeira
    // vez que o backup foi criado já sem mexer em data), não faz nada.
    for (const b of existingBackups) {
      const appt = await prisma.appointment.findUnique({
        where: { id: b.appointmentId },
        select: { scheduledAt: true, skipGoogleCalendarSync: true },
      });
      if (!appt) continue;
      if (appt.scheduledAt.getTime() !== b.originalScheduledAt.getTime() || appt.skipGoogleCalendarSync !== b.originalSkipGoogleCalendarSync) {
        await prisma.appointment.update({
          where: { id: b.appointmentId },
          data: { scheduledAt: b.originalScheduledAt, skipGoogleCalendarSync: b.originalSkipGoogleCalendarSync },
        });
        console.log(`  ${b.appointmentId}: scheduledAt/sincronização do Google restaurados ao valor original (execução antiga deste script tinha alterado) — não é mais alterado.`);
      }
    }
  } else {
    // ---- Seleção (só quando não há backup anterior): agendamentos
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

    // Faltam pacientes SEM telefone pro canal Instagram? Força pacientes
    // extras (COM telefone, distintos dos já escolhidos) — o telefone
    // deles é removido TEMPORARIAMENTE mais abaixo, com backup.
    const chosenIds = [...selection.instagram, ...selection.whatsapp].map((c) => c.appointmentId);
    const shortfall = 2 - selection.instagram.length;
    const forced = selectForcedInstagramCandidates(showcaseCandidates, chosenIds, shortfall);
    if (forced.length > 0) {
      console.log(
        `Só ${selection.instagram.length} paciente(s) atendido(s) SEM telefone disponível(is) — forçando canal Instagram em ${forced.length} paciente(s) adicional(is) (telefone removido TEMPORARIAMENTE, com backup).`
      );
      for (const f of forced) forcedInstagramLeadIds.add(f.leadId);
      selection.instagram.push(...forced);
    }
    if (selection.whatsapp.length < 3) {
      console.log(`⚠️  Só ${selection.whatsapp.length} paciente(s) atendido(s) COM telefone disponível — pedido era 3.`);
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
  }

  // ---- Releitura fresca dos agendamentos escolhidos ----
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds }, clinicId: DEMO_CLINIC_ID },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      returnPeriodDays: true,
      returnPeriodNone: true,
      skipGoogleCalendarSync: true,
      lead: { select: { name: true, igUsername: true, phone: true } },
    },
  });
  if (appointments.length !== appointmentIds.length) {
    console.log("⚠️  Algum agendamento da seleção anterior não existe mais (apagado?) — rode --restore e depois de novo pra reselecionar do zero.");
  }

  // ---- Backup do valor ORIGINAL (só pra quem ainda não tem backup gravado — nunca sobrescreve). A
  // EXISTÊNCIA desta linha é, a partir de agora, também a marca de card
  // "fixo" (ver cabeçalho do arquivo) ----
  const existingBackupIds = new Set(existingBackups.map((b) => b.appointmentId));
  for (const a of appointments) {
    if (existingBackupIds.has(a.id)) continue;
    const isForcedInstagram = forcedInstagramLeadIds.has(a.leadId!);
    await prisma.reactivationShowcaseBackup.create({
      data: {
        clinicId: DEMO_CLINIC_ID,
        appointmentId: a.id,
        leadId: a.leadId!,
        originalScheduledAt: a.scheduledAt,
        originalReturnPeriodDays: a.returnPeriodDays,
        originalReturnPeriodNone: a.returnPeriodNone,
        originalSkipGoogleCalendarSync: a.skipGoogleCalendarSync,
        originalLeadPhone: isForcedInstagram ? a.lead?.phone ?? null : null,
      },
    });
    // Remove o telefone agora, uma única vez (backup já gravado acima) —
    // nas execuções seguintes a.lead.phone já vem null, hasPhone fica
    // false naturalmente, nada a fazer de novo aqui.
    if (isForcedInstagram && a.lead?.phone) {
      await prisma.lead.update({ where: { id: a.leadId! }, data: { phone: null } });
    }
  }

  // ---- Releitura (telefone pode ter mudado acima) + canal final ----
  const finalAppointments = await prisma.appointment.findMany({
    where: { id: { in: appointmentIds }, clinicId: DEMO_CLINIC_ID },
    select: {
      id: true,
      leadId: true,
      scheduledAt: true,
      lead: { select: { name: true, igUsername: true, phone: true } },
    },
  });
  const candidatesForAssignment: ShowcaseCandidate[] = finalAppointments.map((a) => ({
    appointmentId: a.id,
    leadId: a.leadId!,
    scheduledAt: a.scheduledAt,
    hasPhone: Boolean(a.lead?.phone),
  }));
  const instagram = candidatesForAssignment.filter((c) => !c.hasPhone);
  const whatsapp = candidatesForAssignment.filter((c) => c.hasPhone);
  const assignments = assignShowcasePeriods({ instagram, whatsapp, warnings: [] });

  // ---- Aplica: só prazo/canal (returnPeriodDays) + slot — NUNCA
  // scheduledAt/skipGoogleCalendarSync (ver cabeçalho). O sentAt inicial
  // só é gravado na CRIAÇÃO do slot (1ª vez que este appointmentId+prazo
  // aparece); uma reexecução nunca sobrescreve um sentAt que o usuário já
  // tiver marcado/desmarcado pela tela (update: {} — pedido explícito,
  // "o ✓ deve poder ser marcado e desmarcado quantas vezes eu quiser"). ----
  const availableSlots = resolveAvailableReactivationSlots([null, null, null, null, null]); // [1,2,3,4,5] — sem mensagem customizada, mesmo fallback do app.
  console.log("--- Cards de Reativação (showcase, FIXOS) ---\n");
  const byId = new Map(finalAppointments.map((a) => [a.id, a]));
  const summaryRows: { name: string; channel: string; period: number; phoneLine: string; appointmentId: string }[] = [];

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]!;
    const appt = byId.get(a.appointmentId)!;

    await prisma.appointment.update({
      where: { id: a.appointmentId },
      data: { returnPeriodDays: a.periodDays, returnPeriodNone: false },
    });

    const slotNumber = availableSlots[i % availableSlots.length]!;
    await prisma.reactivationCardSlot.upsert({
      where: { appointmentId_thresholdDays: { appointmentId: a.appointmentId, thresholdDays: a.periodDays } },
      create: { appointmentId: a.appointmentId, thresholdDays: a.periodDays, slot: slotNumber, sentAt: a.alreadySent ? now : null },
      update: {},
    });

    const phoneLine = appt.lead?.phone ? `WhatsApp real: ${maskPhone(appt.lead.phone)}` : "(sem telefone — canal Instagram, copiar+abrir)";
    summaryRows.push({
      name: appt.lead?.name ?? appt.lead?.igUsername ?? "(sem nome)",
      channel: a.channel,
      period: a.periodDays,
      phoneLine,
      appointmentId: a.appointmentId,
    });
  }

  // Lê o sentAt ATUAL (pode já ter sido alterado pelo usuário pela tela
  // desde a última execução — nunca sobrescrito acima) pra montar o
  // resumo com o estado real, não o inicial.
  const finalSlots = await prisma.reactivationCardSlot.findMany({
    where: { appointmentId: { in: assignments.map((a) => a.appointmentId) } },
  });
  const sentAtByAppointmentId = new Map(finalSlots.map((s) => [s.appointmentId, s.sentAt]));

  console.log("Paciente — Canal — Prazo — Estado\n");
  for (const r of summaryRows) {
    const sentAt = sentAtByAppointmentId.get(r.appointmentId) ?? null;
    console.log(`${r.name} — ${r.channel} — ${r.period} dias — ${sentAt ? "✓ enviado (esmaecido)" : "pendente"}`);
    if (r.channel === "WHATSAPP") console.log(`    ${r.phoneLine}${sentAt ? " — clicar \"✓\" no card desmarca, pra poder enviar de novo" : " — clicar \"Enviar\" no card manda uma mensagem REAL pra este número"}`);
    else console.log(`    ${r.phoneLine}`);
  }

  console.log(`\n${summaryRows.length} card(s) de Reativação FIXOS — sempre visíveis no Painel da Clínica Demo, qualquer que seja a data de hoje.`);
  console.log(`\nPra desfazer (remove a marca de fixo e restaura prazo/telefone originais):\n  npm run prisma:seed:reactivation-showcase -- --restore`);
  console.log(`\nComando pra rodar no Console do Railway (serviço vexo-platform):\n  npm run prisma:seed:reactivation-showcase`);
}

async function runRestore(): Promise<void> {
  const backups = await prisma.reactivationShowcaseBackup.findMany({ where: { clinicId: DEMO_CLINIC_ID } });
  if (backups.length === 0) {
    console.log("Nenhum backup encontrado no banco (ReactivationShowcaseBackup) — nada a restaurar, nenhum card fixo marcado.");
    return;
  }
  console.log(`Restaurando ${backups.length} agendamento(s)/paciente(s) pro valor original e removendo a marca de fixo...\n`);
  for (const b of backups) {
    await prisma.appointment.update({
      where: { id: b.appointmentId },
      data: {
        scheduledAt: b.originalScheduledAt,
        returnPeriodDays: b.originalReturnPeriodDays,
        returnPeriodNone: b.originalReturnPeriodNone,
        skipGoogleCalendarSync: b.originalSkipGoogleCalendarSync,
      },
    });
    if (b.originalLeadPhone != null) {
      await prisma.lead.update({ where: { id: b.leadId }, data: { phone: b.originalLeadPhone } });
      console.log(`  ${b.appointmentId} -> restaurado pro valor original, telefone do lead restaurado`);
    } else {
      console.log(`  ${b.appointmentId} -> restaurado pro valor original`);
    }
  }
  console.log(
    "\nOs ReactivationCardSlot (histórico de envio) NÃO foram apagados — mesmo princípio do resto do app, nunca apagar histórico de envio. Se quiser removê-los também, apague manualmente por appointmentId."
  );
  await prisma.reactivationShowcaseBackup.deleteMany({ where: { clinicId: DEMO_CLINIC_ID } });
  console.log("Backup removido do banco — a marca de fixo também foi removida (os cards voltam a seguir a janela normal de ±3 dias). A próxima execução sem --restore fará uma seleção nova.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

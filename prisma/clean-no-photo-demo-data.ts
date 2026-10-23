import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  DEMO_CLINIC_ID,
  assertDemoClinic,
  selectLeadsWithoutPhoto,
  selectAppointmentsWithoutLead,
  shouldDeleteGroupB,
  buildLeadCascadePreview,
  dateRangeLabel,
} from "./clean-no-photo-demo-data-logic";

const prisma = new PrismaClient();

// Script ÚNICO (não é rota nem botão da interface, não vira comando
// permanente no package.json) pra limpar os dados fictícios "sem foto" da
// Clínica Demo VEXO (seed-demo.ts) — aprovado pelo dono: limpar os leads
// sem foto de perfil.
//
// SEGURANÇA, nesta ordem (mesmo padrão de cleanup-all-failed-messages.ts):
//   1. Restrito à Clínica Demo VEXO (DEMO_CLINIC_ID, clean-no-photo-demo-data-logic.ts)
//      — qualquer outro --clinic= é recusado na hora, antes de ler ou
//      apagar qualquer linha.
//   2. SEM NENHUMA flag = modo relatório (dry run), só leitura:
//        Grupo A — leads sem foto (profilePictureUrl vazio): @, igScopedId
//        e o que seria apagado em cascata (conversas/mensagens/follow-ups/
//        agendamentos), total, e aviso de quem tem conversa recente
//        (últimos 7 dias) ou agendamento futuro — pra conferir antes de
//        aplicar (aviso, não veto: ainda é apagado num --apply normal).
//        Grupo B — agendamentos sem lead vinculado (Google Calendar):
//        total, 10 exemplos, intervalo de datas. NUNCA apagado neste modo.
//   3. --apply = apaga de verdade o Grupo A (leads sem foto — o
//      onDelete: Cascade do schema leva conversas, mensagens, follow-ups,
//      agendamentos, lembretes e slots de reativação desses leads). Grava
//      um backup JSON ANTES de apagar. Tudo numa transação que RECONFERE
//      o conjunto de ids no banco antes de deletar (aborta se mudou desde
//      o relatório, nunca apaga mais do que foi mostrado).
//   4. --include-no-lead SÓ tem efeito junto com --apply — aí o Grupo B
//      (agendamentos sem lead) também é apagado, na MESMA transação. Sem
//      essa flag o Grupo B nunca é tocado, nem com --apply sozinho.
//   5. Nunca toca em lead COM foto, em outra clínica, em FollowUpSettings/
//      FollowUpStep (configuração GLOBAL do Follow-up — só os FollowUpLog
//      das conversas apagadas cascateiam, a configuração em si nunca é
//      lida nem escrita), em ReminderConfig (config da clínica — só
//      ReminderLog cascateia), nem em nenhuma tabela fora do que está
//      listado acima. Nenhuma migration/mudança de schema.
//
// Uso:
//   npx tsx prisma/clean-no-photo-demo-data.ts                           # relatório só, não apaga nada
//   npx tsx prisma/clean-no-photo-demo-data.ts --apply                   # apaga o Grupo A
//   npx tsx prisma/clean-no-photo-demo-data.ts --apply --include-no-lead # apaga Grupo A E Grupo B

function leadLabel(igUsername: string | null): string {
  return igUsername ? `@${igUsername}` : "(sem @)";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const includeNoLead = args.includes("--include-no-lead");
  const clinicArg = args.find((a) => a.startsWith("--clinic="));
  const clinicId = clinicArg ? clinicArg.slice("--clinic=".length) : DEMO_CLINIC_ID;

  // Recusa ANTES de qualquer leitura/escrita — nenhuma query roda pra
  // outra clínica, nem a de relatório.
  assertDemoClinic(clinicId);

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) {
    console.log(`Nenhuma clínica encontrada com id "${clinicId}".`);
    return;
  }
  console.log(`Clínica: ${clinic.name} (${clinic.id})`);
  if (apply) console.log(includeNoLead ? "Modo: --apply --include-no-lead (apaga Grupo A e Grupo B)" : "Modo: --apply (apaga só o Grupo A)");
  else console.log("Modo: relatório (dry run) — nada será apagado.");
  console.log("");

  const now = new Date();

  // ---- Grupo A: leads sem foto ----
  const allLeads = await prisma.lead.findMany({
    where: { clinicId },
    select: {
      id: true,
      igUsername: true,
      igScopedId: true,
      profilePictureUrl: true,
      conversations: {
        select: {
          lastMessageAt: true,
          _count: { select: { messages: true, followUps: true } },
        },
      },
      appointments: { select: { scheduledAt: true } },
    },
  });
  const leadsWithoutPhoto = selectLeadsWithoutPhoto(allLeads);
  const leadIds = leadsWithoutPhoto.map((l) => l.id);

  console.log(`--- Grupo A: leads SEM foto de perfil ---`);
  console.log(`Total: ${leadsWithoutPhoto.length} de ${allLeads.length} leads da clínica.\n`);

  const previews = leadsWithoutPhoto.map((lead) =>
    buildLeadCascadePreview(
      {
        id: lead.id,
        igUsername: lead.igUsername,
        igScopedId: lead.igScopedId,
        conversations: lead.conversations.map((c) => ({
          lastMessageAt: c.lastMessageAt,
          messageCount: c._count.messages,
          followUpCount: c._count.followUps,
        })),
        appointments: lead.appointments,
      },
      now
    )
  );

  for (const p of previews) {
    console.log(
      `  ${leadLabel(p.igUsername)} — igScopedId=${p.igScopedId} — cascata: ${p.conversationCount} conversa(s), ${p.messageCount} mensagem(ns), ${p.followUpCount} follow-up(s), ${p.appointmentCount} agendamento(s)`
    );
  }

  const warnings = previews.filter((p) => p.hasRecentConversation || p.hasFutureAppointment);
  console.log("");
  if (warnings.length > 0) {
    console.log(`⚠️  ATENÇÃO — ${warnings.length} lead(s) do Grupo A com conversa recente (≤7 dias) ou agendamento futuro — confira antes de aplicar:`);
    for (const w of warnings) {
      const reasons = [w.hasRecentConversation && "conversa recente (≤7 dias)", w.hasFutureAppointment && "agendamento futuro"].filter(Boolean);
      console.log(`  ${leadLabel(w.igUsername)} — ${reasons.join(", ")}`);
    }
    console.log("  Nenhuma exclusão automática por isso — eles SERÃO apagados num --apply normal, junto com os outros.");
  } else {
    console.log("Nenhum lead do Grupo A com conversa recente (≤7 dias) ou agendamento futuro.");
  }

  // ---- Grupo B: agendamentos sem lead ----
  const allAppointments = await prisma.appointment.findMany({
    where: { clinicId },
    select: { id: true, leadId: true, scheduledAt: true, manualTitle: true, status: true, syncedFromGoogle: true },
    orderBy: { scheduledAt: "asc" },
  });
  const appointmentsWithoutLead = selectAppointmentsWithoutLead(allAppointments);
  const apptIdsCandidates = appointmentsWithoutLead.map((a) => a.id);

  console.log(`\n--- Grupo B: agendamentos SEM lead vinculado ---`);
  console.log(`Total: ${appointmentsWithoutLead.length}`);
  console.log(`Intervalo de datas: ${dateRangeLabel(appointmentsWithoutLead.map((a) => a.scheduledAt))}`);
  console.log(`10 exemplos:`);
  for (const a of appointmentsWithoutLead.slice(0, 10)) {
    console.log(
      `  - "${a.manualTitle ?? "(sem título)"}" — ${a.scheduledAt.toISOString().slice(0, 10)} — status=${a.status} — syncedFromGoogle=${a.syncedFromGoogle}`
    );
  }

  if (!apply) {
    console.log("\nModo relatório (dry run) — nada foi apagado.");
    console.log("Pra apagar o Grupo A: rode de novo com --apply.");
    console.log("Pra apagar o Grupo A E o Grupo B: rode com --apply --include-no-lead.");
    return;
  }

  const deleteGroupB = shouldDeleteGroupB(apply, includeNoLead);
  const apptIdsToDelete = deleteGroupB ? apptIdsCandidates : [];

  if (leadIds.length === 0 && apptIdsToDelete.length === 0) {
    console.log("\nNada a apagar.");
    return;
  }

  // ---- Backup JSON ANTES de apagar qualquer coisa ----
  const backupGroupALeads =
    leadIds.length > 0
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          include: {
            conversations: { include: { messages: true, followUps: true } },
            appointments: { include: { reminderLogs: true, reactivationCardSlots: true } },
          },
        })
      : [];
  const backupGroupBAppointments = deleteGroupB
    ? await prisma.appointment.findMany({
        where: { id: { in: apptIdsToDelete } },
        include: { reminderLogs: true, reactivationCardSlots: true },
      })
    : [];

  const backupPath = path.join(process.cwd(), `clean-no-photo-demo-data-backup-${Date.now()}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      { clinicId, generatedAt: now.toISOString(), groupALeads: backupGroupALeads, groupBAppointments: backupGroupBAppointments },
      null,
      2
    )
  );
  console.log(`\nBackup gravado em: ${backupPath}`);

  // ---- Exclusão, tudo numa transação ----
  const result = await prisma.$transaction(async (tx) => {
    // Reconfere os dois conjuntos dentro da MESMA transação — se algo
    // mudou desde o relatório acima (lead ganhou foto, novo agendamento
    // sem lead apareceu etc.), aborta tudo em vez de arriscar apagar algo
    // fora do que foi mostrado (mesmo padrão de segurança de
    // cleanup-all-failed-messages.ts).
    const recheckLeads = await tx.lead.findMany({ where: { clinicId }, select: { id: true, profilePictureUrl: true } });
    const recheckLeadIds = new Set(selectLeadsWithoutPhoto(recheckLeads).map((l) => l.id));
    const sameLeadSet = recheckLeadIds.size === leadIds.length && leadIds.every((id) => recheckLeadIds.has(id));
    if (!sameLeadSet) {
      throw new Error(
        `Abortado: o conjunto de leads sem foto mudou entre o relatório (${leadIds.length}) e a exclusão (${recheckLeadIds.size}). Rode de novo sem --apply pra ver o estado atual.`
      );
    }

    if (deleteGroupB) {
      const recheckAppts = await tx.appointment.findMany({ where: { clinicId }, select: { id: true, leadId: true } });
      const recheckApptIds = new Set(selectAppointmentsWithoutLead(recheckAppts).map((a) => a.id));
      const sameApptSet = recheckApptIds.size === apptIdsToDelete.length && apptIdsToDelete.every((id) => recheckApptIds.has(id));
      if (!sameApptSet) {
        throw new Error(
          `Abortado: o conjunto de agendamentos sem lead mudou entre o relatório (${apptIdsToDelete.length}) e a exclusão (${recheckApptIds.size}). Rode de novo sem --apply pra ver o estado atual.`
        );
      }
    }

    // Contagem FRESCA, dentro da transação, imediatamente antes de apagar
    // — é isso que sai no relatório final "apagados por tabela" (cascata
    // real do banco, não uma estimativa de fora da transação).
    const [conversationCount, messageCount, followUpCount, groupAAppointmentCount, groupAReminderLogCount, groupAReactivationSlotCount] =
      leadIds.length === 0
        ? [0, 0, 0, 0, 0, 0]
        : await Promise.all([
            tx.conversation.count({ where: { leadId: { in: leadIds } } }),
            tx.message.count({ where: { conversation: { leadId: { in: leadIds } } } }),
            tx.followUpLog.count({ where: { conversation: { leadId: { in: leadIds } } } }),
            tx.appointment.count({ where: { leadId: { in: leadIds } } }),
            tx.reminderLog.count({ where: { appointment: { leadId: { in: leadIds } } } }),
            tx.reactivationCardSlot.count({ where: { appointment: { leadId: { in: leadIds } } } }),
          ]);

    const [groupBReminderLogCount, groupBReactivationSlotCount] = deleteGroupB
      ? await Promise.all([
          tx.reminderLog.count({ where: { appointmentId: { in: apptIdsToDelete } } }),
          tx.reactivationCardSlot.count({ where: { appointmentId: { in: apptIdsToDelete } } }),
        ])
      : [0, 0];

    const { count: leadsDeleted } =
      leadIds.length > 0 ? await tx.lead.deleteMany({ where: { id: { in: leadIds } } }) : { count: 0 };

    const { count: groupBAppointmentsDeleted } = deleteGroupB
      ? await tx.appointment.deleteMany({ where: { id: { in: apptIdsToDelete } } })
      : { count: 0 };

    return {
      leadsDeleted,
      conversationCount,
      messageCount,
      followUpCount,
      groupAAppointmentCount,
      groupAReminderLogCount,
      groupAReactivationSlotCount,
      groupBAppointmentsDeleted,
      groupBReminderLogCount,
      groupBReactivationSlotCount,
    };
  });

  console.log("\n--- Apagado (Grupo A) ---");
  console.log(`Lead: ${result.leadsDeleted}`);
  console.log(`Conversation: ${result.conversationCount}`);
  console.log(`Message: ${result.messageCount}`);
  console.log(`FollowUpLog: ${result.followUpCount}`);
  console.log(`Appointment: ${result.groupAAppointmentCount}`);
  console.log(`ReminderLog: ${result.groupAReminderLogCount}`);
  console.log(`ReactivationCardSlot: ${result.groupAReactivationSlotCount}`);

  if (deleteGroupB) {
    console.log("\n--- Apagado (Grupo B, --include-no-lead) ---");
    console.log(`Appointment: ${result.groupBAppointmentsDeleted}`);
    console.log(`ReminderLog: ${result.groupBReminderLogCount}`);
    console.log(`ReactivationCardSlot: ${result.groupBReactivationSlotCount}`);
  } else {
    console.log("\nGrupo B NÃO foi tocado (rode com --apply --include-no-lead pra incluir).");
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

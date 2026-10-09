import { prisma } from "@/lib/prisma";
import { formatReminderMessage, applyReminderTemplate } from "@/lib/whatsapp";
import { sendInstagramMessage } from "@/lib/instagram";

// Lembretes de agendamento — horas configuráveis por clínica (padrão 24h e 3h
// antes, ver ReminderConfig). SEMPRE por Instagram (mesmo canal da conversa)
// — regra de produto: o WhatsApp da clínica serve só pra confirmação de
// agendamento (ver maybeSendWhatsappConfirmation, conversation-pipeline.ts),
// nunca pra lembrete. Sem Instagram conectado, pula o lembrete neste ciclo
// (sem gravar ReminderLog) — o próximo ciclo tenta de novo, nunca descarta.
//
// RELIGADO (decisão de produto — a desativação de ReminderConfig.hoursBefore
// um pouco antes disto tinha sido por entendimento errado de que o campo na
// tela de Automações nunca era usado; os lembretes voltam). `const` boolean,
// não variável de ambiente, de propósito: desligar de novo é só virar isto
// pra `false`, sem precisar de deploy de infra nem remover nada do resto
// da função — mesmo padrão já usado por WEEKLY_SUMMARY_WHATSAPP_ENABLED em
// weekly-summary.ts.
const REMINDERS_ENABLED = true;

export async function processReminders(): Promise<{ sent: number }> {
  if (!REMINDERS_ENABLED) return { sent: 0 };

  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000); // maior janela configurável (48h)

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      scheduledAt: { gt: now, lt: horizon },
      // Sem Lead vinculado = importado do Google Calendar sem conversa no
      // Instagram (paciente conhecido, agendado manualmente) — não existe
      // canal (WhatsApp/Instagram) pra mandar lembrete, a clínica lembra
      // esse paciente por fora do VEXO.
      leadId: { not: null },
    },
    include: {
      lead: true,
      clinic: { include: { reminderConfig: true, instagramAccount: true } },
      reminderLogs: true,
    },
  });

  let sent = 0;

  for (const appt of appointments) {
    if (!appt.lead) continue; // defesa a mais — já filtrado no where acima
    const hoursBeforeList = appt.clinic.reminderConfig?.hoursBefore ?? [24, 3];

    for (const [index, hoursBefore] of hoursBeforeList.entries()) {
      const triggerAt = new Date(appt.scheduledAt.getTime() - hoursBefore * 60 * 60 * 1000);
      if (now < triggerAt) continue; // ainda não chegou a hora deste lembrete
      if (now >= appt.scheduledAt) continue; // já passou do horário do agendamento

      const alreadySent = appt.reminderLogs.some((r) => r.hoursBefore === hoursBefore);
      if (alreadySent) continue;

      // index 0 = 1º lembrete, 1 = 2º — cada um pode ter um texto próprio
      // (ReminderConfig.firstMessageTemplate/secondMessageTemplate,
      // editável em Automações). Sem personalização, cai no texto fixo
      // padrão (formatReminderMessage).
      const customTemplate =
        index === 0 ? appt.clinic.reminderConfig?.firstMessageTemplate : appt.clinic.reminderConfig?.secondMessageTemplate;
      const leadFirstName = (appt.lead.name ?? "").split(" ")[0] || "";
      const text = customTemplate
        ? applyReminderTemplate(customTemplate, { leadFirstName, scheduledAt: appt.scheduledAt })
        : formatReminderMessage({ leadFirstName: leadFirstName || "tudo bem", hoursBefore, scheduledAt: appt.scheduledAt });

      if (!appt.clinic.instagramAccount) continue;

      try {
        await sendInstagramMessage({
          accessTokenEnc: appt.clinic.instagramAccount.accessTokenEnc,
          igUserId: appt.clinic.instagramAccount.igUserId,
          recipientIgScopedId: appt.lead.igScopedId,
          text,
        });

        await prisma.reminderLog.create({
          data: { appointmentId: appt.id, hoursBefore, channel: "instagram" },
        });
        sent++;
      } catch (err) {
        console.error(`[vexo] Falha ao enviar lembrete (appointment=${appt.id}, hoursBefore=${hoursBefore}):`, err);
      }
    }
  }

  return { sent };
}

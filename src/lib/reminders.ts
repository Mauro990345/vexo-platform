import { prisma } from "@/lib/prisma";
import { sendWhatsappMessage, formatReminderMessage } from "@/lib/whatsapp";
import { sendInstagramMessage } from "@/lib/instagram";

// Lembretes de agendamento — horas configuráveis por clínica (padrão 24h e 3h
// antes, ver ReminderConfig). Enviados via WhatsApp quando o lead informou
// telefone durante a conversa; caso contrário, via Instagram (mesmo canal da
// conversa) como fallback.

export async function processReminders(): Promise<{ sent: number }> {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000); // maior janela configurável (48h)

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      scheduledAt: { gt: now, lt: horizon },
    },
    include: {
      lead: true,
      clinic: { include: { reminderConfig: true, instagramAccount: true } },
      reminderLogs: true,
    },
  });

  let sent = 0;

  for (const appt of appointments) {
    const hoursBeforeList = appt.clinic.reminderConfig?.hoursBefore ?? [24, 3];

    for (const hoursBefore of hoursBeforeList) {
      const triggerAt = new Date(appt.scheduledAt.getTime() - hoursBefore * 60 * 60 * 1000);
      if (now < triggerAt) continue; // ainda não chegou a hora deste lembrete
      if (now >= appt.scheduledAt) continue; // já passou do horário do agendamento

      const alreadySent = appt.reminderLogs.some((r) => r.hoursBefore === hoursBefore);
      if (alreadySent) continue;

      const text = formatReminderMessage({
        leadFirstName: (appt.lead.name ?? "").split(" ")[0] || "tudo bem",
        hoursBefore,
        scheduledAt: appt.scheduledAt,
      });

      const canUseWhatsapp = Boolean(appt.lead.phone && appt.clinic.whatsappInstanceName);

      try {
        if (canUseWhatsapp) {
          await sendWhatsappMessage(appt.clinic.whatsappInstanceName, appt.lead.phone!, text);
        } else if (appt.clinic.instagramAccount) {
          await sendInstagramMessage({
            pageAccessTokenEnc: appt.clinic.instagramAccount.accessTokenEnc,
            igUserId: appt.clinic.instagramAccount.igUserId,
            recipientIgScopedId: appt.lead.igScopedId,
            text,
          });
        } else {
          continue;
        }

        await prisma.reminderLog.create({
          data: { appointmentId: appt.id, hoursBefore, channel: canUseWhatsapp ? "whatsapp" : "instagram" },
        });
        sent++;
      } catch (err) {
        console.error(`[vexo] Falha ao enviar lembrete (appointment=${appt.id}, hoursBefore=${hoursBefore}):`, err);
      }
    }
  }

  return { sent };
}

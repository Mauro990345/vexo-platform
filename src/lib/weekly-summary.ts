import { prisma } from "@/lib/prisma";
import { getClinicMetrics, startOfDay, addDays } from "@/lib/metrics";
import { sendWhatsappMessage, formatWeeklySummaryMessage } from "@/lib/whatsapp";

// Resumo semanal automático — toda sexta-feira, gerado por template simples
// consultando o banco (sem custo relevante de IA) e enviado via WhatsApp
// (Evolution API) para o número da clínica.

// DESLIGADO (regra de produto: Clinic.clientWhatsappNumber serve SÓ pra
// confirmação de agendamento ao lead — ver maybeSendWhatsappConfirmation,
// conversation-pipeline.ts — nada mais sai por WhatsApp). `const` boolean,
// não variável de ambiente, de propósito: religar é só virar isto pra
// true, sem precisar de deploy de infra nem remover nada do resto da
// função (métricas, WeeklySummary, loop por clínica) nem do cron em
// worker/index.ts. Mesmo padrão já usado por STAGNATION_GUARD_SHADOW_MODE
// em conversation-pipeline.ts.
const WEEKLY_SUMMARY_WHATSAPP_ENABLED = false;

export async function sendWeeklySummaries(): Promise<{ sent: number; failed: number }> {
  if (!WEEKLY_SUMMARY_WHATSAPP_ENABLED) return { sent: 0, failed: 0 };

  const weekEnd = startOfDay(new Date());
  const weekStart = addDays(weekEnd, -7);

  const clinics = await prisma.clinic.findMany({
    where: { active: true, clientWhatsappNumber: { not: null } },
  });

  let sent = 0;
  let failed = 0;

  for (const clinic of clinics) {
    const existing = await prisma.weeklySummary.findUnique({
      where: { clinicId_weekStart: { clinicId: clinic.id, weekStart } },
    });
    if (existing?.sentAt) continue; // já enviado para esta semana

    if (!clinic.whatsappInstanceName) {
      console.warn(`[vexo] Clínica ${clinic.name} sem WhatsApp conectado — resumo semanal pulado.`);
      continue;
    }

    const metrics = await getClinicMetrics(clinic.id, weekStart, weekEnd);

    const baseData = {
      clinicId: clinic.id,
      weekStart,
      weekEnd,
      approachedCount: metrics.approached,
      respondedCount: metrics.responded,
      scheduledCount: metrics.scheduled,
      noShowCount: metrics.noShow,
      completedCount: metrics.completed,
    };

    try {
      await sendWhatsappMessage(
        clinic.whatsappInstanceName,
        clinic.clientWhatsappNumber!,
        formatWeeklySummaryMessage({
          clinicName: clinic.name,
          weekStart,
          weekEnd,
          approached: metrics.approached,
          responded: metrics.responded,
          scheduled: metrics.scheduled,
          noShows: metrics.noShow,
          completed: metrics.completed,
        })
      );

      await prisma.weeklySummary.upsert({
        where: { clinicId_weekStart: { clinicId: clinic.id, weekStart } },
        update: { ...baseData, sentAt: new Date(), sendError: null },
        create: { ...baseData, sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      const sendError = err instanceof Error ? err.message : "Erro desconhecido.";
      await prisma.weeklySummary.upsert({
        where: { clinicId_weekStart: { clinicId: clinic.id, weekStart } },
        update: { ...baseData, sendError },
        create: { ...baseData, sendError },
      });
      failed++;
      console.error(`[vexo] Falha ao enviar resumo semanal para ${clinic.name}:`, err);
    }
  }

  return { sent, failed };
}

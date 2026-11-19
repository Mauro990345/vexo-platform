import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import type { PipelineSnapshot } from "@/lib/pipeline-polling";

// Fonte ÚNICA do retrato do Pipeline — usada tanto na primeira carga da
// página (clinicas/[id]/page.tsx) quanto em cada busca do polling
// (/api/clinicas/[id]/pipeline, a cada 3-4s via PipelineBoard.tsx), pra
// nunca ter duas versões da mesma lógica/consulta divergindo com o tempo.
// Só os campos que o board de verdade usa (select, não include) — cálculo
// de período idêntico ao que a página sempre usou (últimos 7 dias).
export async function getPipelineSnapshot(clinicId: string): Promise<PipelineSnapshot> {
  const todayStart = startOfDay(new Date());
  const periodStart = addDays(todayStart, -6);
  const periodEnd = addDays(todayStart, 1);

  const [conversations, newContacts, responded, scheduled, completed, noShow] = await Promise.all([
    prisma.conversation.findMany({
      where: { clinicId },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        status: true,
        lastMessageAt: true,
        lead: { select: { name: true, igUsername: true, profilePictureUrl: true } },
        appointments: { orderBy: { scheduledAt: "desc" }, take: 1, select: { scheduledAt: true } },
      },
    }),
    prisma.conversation.count({ where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.conversation.count({
      where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd }, status: { not: "NEW" } },
    }),
    prisma.appointment.count({ where: { clinicId, createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "COMPLETED" },
    }),
    prisma.appointment.count({
      where: { clinicId, scheduledAt: { gte: periodStart, lt: periodEnd }, status: "NO_SHOW" },
    }),
  ]);

  return {
    conversations: conversations.map((conv) => ({
      id: conv.id,
      status: conv.status,
      lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
      lead: {
        name: conv.lead.name,
        igUsername: conv.lead.igUsername,
        profilePictureUrl: conv.lead.profilePictureUrl,
      },
      appointmentScheduledAt: conv.appointments[0] ? conv.appointments[0].scheduledAt.toISOString() : null,
    })),
    metrics: { newContacts, responded, scheduled, completed, noShow },
  };
}

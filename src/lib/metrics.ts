import { prisma } from "@/lib/prisma";

// Métricas compartilhadas pelo painel do cliente e pelo resumo semanal.
// "Abordados" vem do contador manual (ApproachLog), já que a primeira
// mensagem é sempre enviada por Mauro fora da plataforma.

export async function getClinicMetrics(clinicId: string, from: Date, to: Date) {
  const [approachLogs, respondedCount, scheduledCount, completedCount, noShowCount] =
    await Promise.all([
      prisma.approachLog.aggregate({
        where: { clinicId, loggedDate: { gte: from, lt: to } },
        _sum: { count: true },
      }),
      prisma.conversation.count({
        where: { clinicId, createdAt: { gte: from, lt: to } },
      }),
      prisma.appointment.count({
        where: { clinicId, createdAt: { gte: from, lt: to } },
      }),
      prisma.appointment.count({
        where: { clinicId, scheduledAt: { gte: from, lt: to }, status: "COMPLETED" },
      }),
      prisma.appointment.count({
        where: { clinicId, scheduledAt: { gte: from, lt: to }, status: "NO_SHOW" },
      }),
    ]);

  const approached = approachLogs._sum.count ?? 0;
  const responseRate = approached > 0 ? respondedCount / approached : null;

  return {
    approached,
    responded: respondedCount,
    responseRate,
    scheduled: scheduledCount,
    completed: completedCount,
    noShow: noShowCount,
  };
}

export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

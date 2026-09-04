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

// Soma de ApproachLog por dia, pra semana (7 dias a partir de weekStart).
// loggedDate sempre é gravado à meia-noite (ver logApproach), então dá pra
// indexar cada log num dia da semana em vez de rodar 7 queries separadas.
export async function getDailyApproachCounts(clinicId: string, weekStart: Date): Promise<number[]> {
  const start = startOfDay(weekStart);
  const end = addDays(start, 7);

  const logs = await prisma.approachLog.findMany({
    where: { clinicId, loggedDate: { gte: start, lt: end } },
    select: { loggedDate: true, count: true },
  });

  const counts = new Array(7).fill(0) as number[];
  for (const log of logs) {
    const dayIndex = Math.round(
      (startOfDay(log.loggedDate).getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (dayIndex >= 0 && dayIndex < 7) counts[dayIndex] = (counts[dayIndex] ?? 0) + log.count;
  }
  return counts;
}

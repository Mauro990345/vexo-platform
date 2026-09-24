import { prisma } from "@/lib/prisma";

// Métricas compartilhadas pelo painel do cliente e pelo resumo semanal.
// "Abordados" vem do contador manual (ApproachLog), já que a primeira
// mensagem é sempre enviada por Mauro fora da plataforma — mas esse
// contador manual pode ficar desatualizado (esquecer de logar um dia) sem
// que isso afete conversationCount/appointmentCount, que são automáticos.
//
// Bug real reportado: card "Abordados" mostrando 0 num período com 17
// conversas e 8 agendamentos reais — logicamente impossível, já que toda
// conversa e todo agendamento SÓ existem depois de uma abordagem. Causa:
// "approached" vinha só da soma do ApproachLog manual daquele período, sem
// nenhum piso baseado no que o próprio sistema já sabe ter acontecido.
// Corrigido com um piso: "Abordados" nunca fica abaixo do maior número já
// observado no funil automático do mesmo período (conversas iniciadas ou
// agendamentos criados) — preserva o valor manual quando ele é MAIOR (ele
// captura abordagens que nunca viraram conversa, que o funil automático não
// vê), mas nunca deixa a métrica "mais alta do funil" aparecer mais baixa
// que as de baixo dela.
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

  const approached = Math.max(approachLogs._sum.count ?? 0, respondedCount, scheduledCount);
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

import { prisma } from "@/lib/prisma";
import { startOfBrazilDay } from "@/lib/timezone";

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

// Corte de "hoje"/"início do dia" em horário de BRASÍLIA, não no fuso
// local do processo (Railway roda em UTC) — ver startOfBrazilDay em
// timezone.ts pro bug real que isso corrige (contadores do Painel
// mostrando 0 pra atividade genuinamente de hoje, testando à noite).
export type AttendanceSourceAppointment = {
  conversationId: string | null;
  scheduledAt: Date;
  status: string;
};

export type AttendanceMetrics = { attended: number; pastDue: number };

// Lógica pura da métrica "Compareceram" do Painel (ver ClientPanelView) —
// separada de getAttendanceMetrics abaixo pra poder ser testada sem Prisma,
// mesmo padrão de computeReportPeriod/summarizeByDay em
// report-conversations-logic.ts.
//
// Só conta agendamento vindo da IA (conversationId preenchido — importado
// do Google Calendar sem Lead nunca tem conversationId, ver schema.prisma).
// "Compareceu" é o PADRÃO quando nada foi marcado (igual à tag do card,
// ver appointmentDisplayStatus abaixo): não exige status === "COMPLETED"
// (nunca escrito no banco hoje — ver setAppointmentAttendance, só alterna
// entre SCHEDULED/CONFIRMED e NO_SHOW), só exige que o horário já tenha
// passado e não tenha sido marcado "Não compareceu".
//
// CANCELLED é excluído de propósito (do numerador E do denominador): um
// evento cancelado no Google Calendar (ver google-calendar-sync.ts) pode
// cair num agendamento com conversationId também, e nunca deveria contar
// como "agendado que já passou" nem como comparecimento — o agendamento
// simplesmente deixou de existir.
export function computeAttendanceMetrics(
  appointments: AttendanceSourceAppointment[],
  from: Date,
  to: Date,
  now: Date
): AttendanceMetrics {
  let attended = 0;
  let pastDue = 0;
  for (const a of appointments) {
    if (!a.conversationId) continue;
    if (a.status === "CANCELLED") continue;
    if (a.scheduledAt < from || a.scheduledAt >= to) continue;
    if (a.scheduledAt >= now) continue;
    pastDue++;
    if (a.status !== "NO_SHOW") attended++;
  }
  return { attended, pastDue };
}

export async function getAttendanceMetrics(
  clinicId: string,
  from: Date,
  to: Date,
  now: Date = new Date()
): Promise<AttendanceMetrics> {
  const appointments = await prisma.appointment.findMany({
    where: { clinicId, scheduledAt: { gte: from, lt: to } },
    select: { conversationId: true, scheduledAt: true, status: true },
  });
  return computeAttendanceMetrics(appointments, from, to, now);
}

// Status derivado pra exibição no card de Agendamento (ver
// AppointmentStatusBadge, usado via ClientPanelView) — nunca escreve no
// banco, só decide o que MOSTRAR. Reaproveita o rótulo/cor "COMPLETED" já
// existentes no badge (ver STATUS_LABELS/statusTint) só pra exibição;
// a.status no banco continua intocado (SCHEDULED/CONFIRMED), então o botão
// "Não compareceu" e o Pipeline continuam vendo o status real, nunca este
// derivado. NO_SHOW e CANCELLED nunca são sobrescritos por este cálculo.
export function appointmentDisplayStatus(
  appointment: { status: string; scheduledAt: Date },
  now: Date
): string {
  if (appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED") {
    return appointment.scheduledAt < now ? "COMPLETED" : appointment.status;
  }
  return appointment.status;
}

export function startOfDay(d: Date): Date {
  return startOfBrazilDay(d);
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

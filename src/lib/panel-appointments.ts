import { appointmentDisplayStatus, startOfDay } from "@/lib/metrics";

// Marcar "Não compareceu" só faz sentido pra agendamento ainda em aberto —
// já compareceu (derivado) ou já foi cancelado não tem o que alternar
// aqui (ver ClientPanelView.tsx/PanelAppointmentsColumn.tsx).
export const ACTIONABLE_STATUSES = ["SCHEDULED", "CONFIRMED", "NO_SHOW"];

// Agrupamento da coluna "Agendamentos" do Painel do cliente (ver
// ClientPanelView.tsx/PanelAppointmentsColumn.tsx) — pedido explícito:
// primeiro os próximos (hoje e futuros), depois "Aguardando resposta"
// (passados que ainda pedem Compareceu/Não compareceu), com o histórico de
// atendidos atrás de um link "Histórico (N)". Lógica pura aqui (testável
// sem Prisma, mesmo padrão do resto do app), só decide ONDE cada
// agendamento aparece — não muda isAppointmentVisibleInList nem nenhuma
// outra regra de dados (appointments.ts), só reagrupa o que essa função já
// devolve.
//
// UPCOMING: ainda não aconteceu (displayStatus SCHEDULED/CONFIRMED — só
// acontece quando scheduledAt ainda está no futuro, ver
// appointmentDisplayStatus). AWAITING_RESPONSE: já passou hoje (mesmo dia
// civil, América/São Paulo) e ainda não foi marcado explicitamente (displayStatus
// COMPLETED) — a secretária ainda pode confirmar Compareceu/Não compareceu.
// HISTORY: tudo que já foi decidido (status NO_SHOW, "Faltou", qualquer
// dia) ou que passou em um dia anterior a hoje (COMPLETED de ontem ou
// antes, dentro da janela de isAppointmentVisibleInList/ATTENDED_VISIBLE_DAYS,
// ou qualquer agendamento antigo da Clínica Demo) — fica atrás do link
// "Histórico (N)", mas continua com as mesmas ações de sempre (Retorno
// pros atendidos, Não compareceu pros ainda acionáveis).
export type PanelAppointmentGroup = "UPCOMING" | "AWAITING_RESPONSE" | "HISTORY";

export function panelAppointmentGroup(appt: { status: string; scheduledAt: Date }, now: Date): PanelAppointmentGroup {
  const displayStatus = appointmentDisplayStatus(appt, now);
  if (displayStatus === "SCHEDULED" || displayStatus === "CONFIRMED") return "UPCOMING";
  if (displayStatus !== "COMPLETED") return "HISTORY"; // NO_SHOW (CANCELLED nunca chega aqui, já filtrado na query)

  const sameDay = startOfDay(appt.scheduledAt).getTime() === startOfDay(now).getTime();
  return sameDay ? "AWAITING_RESPONSE" : "HISTORY";
}

export function groupAppointmentsForPanel<T extends { status: string; scheduledAt: Date }>(
  appointments: T[],
  now: Date
): { upcoming: T[]; awaitingResponse: T[]; history: T[] } {
  const upcoming: T[] = [];
  const awaitingResponse: T[] = [];
  const history: T[] = [];

  for (const appt of appointments) {
    const group = panelAppointmentGroup(appt, now);
    if (group === "UPCOMING") upcoming.push(appt);
    else if (group === "AWAITING_RESPONSE") awaitingResponse.push(appt);
    else history.push(appt);
  }

  // Próximos: o mais próximo primeiro (soonest first). Aguardando resposta:
  // o mais atrasado (mais antigo) primeiro, mesmo princípio de prioridade
  // usado em groupPanelCardsForDisplay (panel-cards.ts). Histórico: mais
  // recente primeiro (log reverso-cronológico, mesma ordem que a lista já
  // tinha antes desta mudança — ver orderBy scheduledAt:desc em
  // ClientPanelView.tsx).
  upcoming.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  awaitingResponse.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
  history.sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());

  return { upcoming, awaitingResponse, history };
}

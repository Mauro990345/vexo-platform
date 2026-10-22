import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import { normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";

// Faixa "Reativação" do Painel do cliente (ver ClientPanelView.tsx /
// ReactivationRail.tsx) — pacientes cujo agendamento da IA completou o
// prazo configurado sem retorno. Lógica pura aqui (testável sem Prisma,
// mesmo padrão de report-conversations-logic.ts/metrics.ts), wrapper com
// Prisma embaixo.

export const REACTIVATION_THRESHOLD_OPTIONS = [90, 120, 150] as const;
export type ReactivationThresholdDays = (typeof REACTIVATION_THRESHOLD_OPTIONS)[number];
export const DEFAULT_REACTIVATION_THRESHOLD_DAYS: ReactivationThresholdDays = 150;

// Estilo de acompanhamento genérico ("como você está desde o seu
// atendimento"), sem citar nenhum serviço/procedimento — pedido explícito.
// Usado quando a clínica não personalizou nenhuma das 5 mensagens.
export const DEFAULT_REACTIVATION_MESSAGES: readonly string[] = [
  "Oi! Passando aqui só pra saber como você está desde o seu atendimento. Se precisar de algo, é só chamar. 💙",
  "Oi! Faz um tempinho que a gente não se fala por aqui — como você está desde o seu atendimento?",
  "Oi! Lembramos de você 💙 Como você está desde o seu atendimento? Se quiser conversar, é só responder.",
  "Oi! Passando pra deixar um alô e saber como você está desde o seu atendimento. Pode contar com a gente.",
  "Oi! Ficamos pensando em você — como está desde o seu atendimento? Estamos à disposição por aqui.",
];

function isWeekend(brazilDay: Date): boolean {
  const dow = brazilDay.getUTCDay();
  return dow === 0 || dow === 6;
}

function nextBusinessDay(brazilDay: Date): Date {
  let day = brazilDay;
  while (isWeekend(day)) day = addDays(day, 1);
  return day;
}

export type ReactivationWindow = { start: Date; end: Date };

// "A partir do dia em que completou o prazo" + 5 DIAS ÚTEIS de janela. Se
// o dia da conclusão cair num fim de semana, a janela só começa a contar
// na segunda seguinte (fim de semana nunca é "dia útil visível"). A janela
// pode atravessar um fim de semana no meio (ex.: completa quarta — fica
// visível quarta/quinta/sexta e depois segunda/terça da semana seguinte,
// sem contar sábado/domingo) — é o caso coberto pelo teste de "virada de
// fim de semana".
export function computeReactivationWindow(scheduledAt: Date, thresholdDays: number): ReactivationWindow {
  const completionDay = startOfDay(addDays(scheduledAt, thresholdDays));
  const start = nextBusinessDay(completionDay);
  let end = start;
  let businessDaysCounted = 1;
  while (businessDaysCounted < 5) {
    end = addDays(end, 1);
    if (!isWeekend(end)) businessDaysCounted++;
  }
  return { start, end };
}

export function isWithinReactivationWindow(window: ReactivationWindow, now: Date): boolean {
  const today = startOfDay(now);
  return today.getTime() >= window.start.getTime() && today.getTime() <= window.end.getTime();
}

export type ReactivationSourceAppointment = {
  id: string;
  leadId: string | null;
  conversationId: string | null;
  scheduledAt: Date;
  status: string;
};

export type ReactivationCandidate = {
  appointmentId: string;
  leadId: string;
  scheduledAt: Date;
};

// Acha, por lead, o agendamento da IA mais recente (conversationId
// preenchido — sem lead vinculado nunca entra; CANCELLED nunca conta, nem
// pra decidir "o mais recente" nem como gatilho — evento cancelado no
// Google Calendar não é um atendimento de verdade, mesma exclusão de
// computeAttendanceMetrics em metrics.ts). Por ser sempre o MAIS RECENTE,
// não existe "agendamento posterior" a excluir depois — isso já elimina
// quem já voltou. Se esse mais recente foi marcado "Não compareceu", não
// gera candidato (pedido explícito) — não recua pro agendamento anterior:
// uma interação mais recente, mesmo faltada, já tira o lead do estado
// "parado" que a reativação tenta resolver (segue o fluxo de follow-up de
// falta, não este).
export function selectReactivationCandidates(appointments: ReactivationSourceAppointment[]): ReactivationCandidate[] {
  const latestByLead = new Map<string, ReactivationSourceAppointment>();
  for (const appt of appointments) {
    if (!appt.conversationId || !appt.leadId) continue;
    if (appt.status === "CANCELLED") continue;
    const current = latestByLead.get(appt.leadId);
    if (!current || appt.scheduledAt.getTime() > current.scheduledAt.getTime()) {
      latestByLead.set(appt.leadId, appt);
    }
  }

  const candidates: ReactivationCandidate[] = [];
  for (const appt of latestByLead.values()) {
    if (appt.status === "NO_SHOW") continue;
    candidates.push({ appointmentId: appt.id, leadId: appt.leadId!, scheduledAt: appt.scheduledAt });
  }
  return candidates;
}

// Slots (1-5) com texto configurado; sem nenhum, usa os 5 defaults
// (DEFAULT_REACTIVATION_MESSAGES) como se fossem os 5 slots.
export function resolveAvailableReactivationSlots(messages: (string | null | undefined)[]): number[] {
  const slots: number[] = [];
  messages.forEach((msg, idx) => {
    if (msg && msg.trim()) slots.push(idx + 1);
  });
  return slots.length > 0 ? slots : [1, 2, 3, 4, 5];
}

// Rotação em SEQUÊNCIA (nunca sorteada) — módulo da quantidade de slots
// disponíveis sobre um contador que só cresce. Com N>1 slots, duas
// chamadas consecutivas nunca repetem a mesma posição (position e
// position+1 mod N só coincidem se N<=1).
export function assignNextReactivationSlot(
  availableSlots: number[],
  sequenceCounter: number
): { slot: number; nextSequenceCounter: number } {
  const position = sequenceCounter % availableSlots.length;
  return { slot: availableSlots[position]!, nextSequenceCounter: sequenceCounter + 1 };
}

// Texto final de um slot já atribuído — slot (1-5) indexa messages[]
// (mesma posição) com fallback pro texto padrão correspondente. O slot em
// si fica fixo por card (ver Appointment.reactivationMessageSlot); só o
// TEXTO pode mudar depois se a clínica editar aquela mensagem específica.
export function resolveReactivationMessageText(slot: number, messages: (string | null | undefined)[]): string {
  const custom = messages[slot - 1];
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_REACTIVATION_MESSAGES[slot - 1] ?? DEFAULT_REACTIVATION_MESSAGES[0]!;
}

// wa.me com a mensagem já preenchida (não enviada — a secretária decide
// clicar "Enviar" no WhatsApp) — mesmo normalizador usado em todo o
// sistema (ver normalizeBrazilianWhatsappNumber, whatsapp.ts), pro link
// abrir o contato certo tanto com quanto sem o "55"/DDD digitado como o
// lead escreveu. encodeURIComponent cuida de espaços, acentos e emoji no
// texto da mensagem.
export function buildReactivationWhatsAppLink(phone: string, message: string): string {
  const normalized = normalizeBrazilianWhatsappNumber(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export type ReactivationCard = {
  appointmentId: string;
  leadId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  whatsappLink: string | null;
  completionDate: Date;
};

export async function getReactivationCards(clinicId: string, now: Date = new Date()): Promise<ReactivationCard[]> {
  const config = await prisma.reactivationConfig.findUnique({ where: { clinicId } });
  const thresholdDays = config?.thresholdDays ?? DEFAULT_REACTIVATION_THRESHOLD_DAYS;
  const messages = [config?.message1, config?.message2, config?.message3, config?.message4, config?.message5];
  const availableSlots = resolveAvailableReactivationSlots(messages);

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, conversationId: { not: null } },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      scheduledAt: true,
      status: true,
      reactivationMessageSlot: true,
    },
  });

  const candidates = selectReactivationCandidates(appointments)
    .map((c) => ({ ...c, window: computeReactivationWindow(c.scheduledAt, thresholdDays) }))
    .filter((c) => isWithinReactivationWindow(c.window, now))
    // "Ordenada por quem completou primeiro" — desempate estável por
    // scheduledAt/id pra ordem determinística em caso de mesma data.
    .sort(
      (a, b) =>
        a.window.start.getTime() - b.window.start.getTime() ||
        a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
        a.appointmentId.localeCompare(b.appointmentId)
    );

  if (candidates.length === 0) return [];

  const slotByAppointmentId = new Map(appointments.map((a) => [a.id, a.reactivationMessageSlot]));

  let sequenceCounter = config?.sequenceCounter ?? 0;
  const initialSequenceCounter = sequenceCounter;
  const assignedSlots = new Map<string, number>();

  // Sequencial de propósito (não Promise.all): precisa processar na ordem
  // de "quem completou primeiro" pra garantir 1º card = variação 1, 2º =
  // variação 2 etc. — paralelizar quebraria essa ordem de atribuição.
  for (const candidate of candidates) {
    const existingSlot = slotByAppointmentId.get(candidate.appointmentId);
    if (existingSlot) {
      assignedSlots.set(candidate.appointmentId, existingSlot);
      continue;
    }
    const { slot, nextSequenceCounter } = assignNextReactivationSlot(availableSlots, sequenceCounter);
    assignedSlots.set(candidate.appointmentId, slot);
    sequenceCounter = nextSequenceCounter;
    await prisma.appointment.update({
      where: { id: candidate.appointmentId },
      data: { reactivationMessageSlot: slot },
    });
  }

  if (sequenceCounter !== initialSequenceCounter) {
    await prisma.reactivationConfig.upsert({
      where: { clinicId },
      create: { clinicId, thresholdDays: DEFAULT_REACTIVATION_THRESHOLD_DAYS, sequenceCounter },
      update: { sequenceCounter },
    });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: candidates.map((c) => c.leadId) } },
    select: { id: true, name: true, igUsername: true, profilePictureUrl: true, phone: true },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return candidates.map((c) => {
    const lead = leadById.get(c.leadId);
    const slot = assignedSlots.get(c.appointmentId)!;
    const message = resolveReactivationMessageText(slot, messages);
    const phone = lead?.phone ?? null;
    return {
      appointmentId: c.appointmentId,
      leadId: c.leadId,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername: lead?.igUsername ?? null,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      whatsappLink: phone ? buildReactivationWhatsAppLink(phone, message) : null,
      completionDate: c.window.start,
    };
  });
}

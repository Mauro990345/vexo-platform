import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import { normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";

// Faixa "Reativação" do Painel do cliente (ver ClientPanelView.tsx /
// ReactivationRail.tsx) — pacientes cujo agendamento da IA completou o
// prazo configurado sem retorno. Lógica pura aqui (testável sem Prisma,
// mesmo padrão de report-conversations-logic.ts/metrics.ts), wrapper com
// Prisma embaixo.

// Períodos só de TESTE — isolados nesta constante de propósito, pra poder
// ser removidos depois mexendo numa linha só (esvaziar o array, ver pedido
// explícito do usuário). REACTIVATION_THRESHOLD_OPTIONS espalha esta lista
// na frente dos períodos "de verdade" (90/120/150) — tirar algo daqui tira
// o chip da tela e da validação automaticamente, sem precisar editar mais
// nada. Mesma lógica de período pra todos, só o rótulo "(teste)" muda (ver
// automacoes/page.tsx).
export const TEST_PERIOD_DAYS = [7, 10, 30, 60] as const;
export const REACTIVATION_THRESHOLD_OPTIONS = [...TEST_PERIOD_DAYS, 90, 120, 150] as const;
export type ReactivationThresholdDays = (typeof REACTIVATION_THRESHOLD_OPTIONS)[number];
// Padrão: só 150 marcado. Lista VAZIA = Reativação desligada pra essa
// clínica (pedido explícito) — nenhum período, nenhum card.
export const DEFAULT_REACTIVATION_THRESHOLD_DAYS_LIST: ReactivationThresholdDays[] = [150];

// Validação pura (sem Prisma) usada por updateClinicReactivation
// (src/app/crm/clinicas/actions.ts) pra filtrar os valores marcados nos
// checkboxes — extraída pra poder testar "aceita os valores válidos,
// rejeita valor inválido" sem precisar simular form/sessão/banco.
export function isValidReactivationThresholdDays(value: number): value is ReactivationThresholdDays {
  return (REACTIVATION_THRESHOLD_OPTIONS as readonly number[]).includes(value);
}

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

export type ReactivationCardCandidate = ReactivationCandidate & {
  thresholdDays: number;
  window: ReactivationWindow;
};

// Cada período marcado (ver ReactivationConfig.thresholdDaysList) funciona
// de forma INDEPENDENTE: o mesmo candidato (já filtrado por lead/voltou/
// faltou/cancelado em selectReactivationCandidates) pode gerar um card por
// período, cada um na janela daquele período específico — o mesmo
// agendamento pode aparecer duas vezes, em momentos diferentes (pedido
// explícito: "o mesmo paciente pode ter dois cards se completar dois
// períodos marcados em momentos diferentes"). Lista de períodos vazia =
// nenhum card, nenhuma iteração (Reativação desligada pra essa clínica).
//
// Ordenado GLOBALMENTE por quem completou primeiro, entre TODOS os
// períodos juntos — a rotação de mensagens é uma sequência ÚNICA por
// clínica (ver ReactivationConfig.sequenceCounter), independente do
// período, então a ordem de atribuição de slot precisa ser essa ordem
// global, não uma ordem separada por período.
export function buildReactivationCardCandidates(
  candidates: ReactivationCandidate[],
  thresholdDaysList: number[],
  now: Date
): ReactivationCardCandidate[] {
  const result: ReactivationCardCandidate[] = [];
  for (const thresholdDays of thresholdDaysList) {
    for (const candidate of candidates) {
      const window = computeReactivationWindow(candidate.scheduledAt, thresholdDays);
      if (isWithinReactivationWindow(window, now)) {
        result.push({ ...candidate, thresholdDays, window });
      }
    }
  }
  return result.sort(
    (a, b) =>
      a.window.start.getTime() - b.window.start.getTime() ||
      a.scheduledAt.getTime() - b.scheduledAt.getTime() ||
      a.appointmentId.localeCompare(b.appointmentId) ||
      a.thresholdDays - b.thresholdDays
  );
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
// si fica fixo por card (ver ReactivationCardSlot, schema.prisma); só o
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
  thresholdDays: number;
};

// Chave composta (agendamento + período) — o mesmo agendamento pode ter um
// card por período marcado, então um Map por appointmentId sozinho não
// basta mais (ver ReactivationCardSlot, schema.prisma).
export function cardSlotKey(appointmentId: string, thresholdDays: number): string {
  return `${appointmentId}:${thresholdDays}`;
}

export type AssignedReactivationCard = ReactivationCardCandidate & { slot: number };
export type ReactivationSlotAssignment = { appointmentId: string; thresholdDays: number; slot: number };

// Atribui slot a cada card da lista (já ordenada por buildReactivationCardCandidates
// — ordem global de "quem completou primeiro", entre todos os períodos
// juntos), reusando o que já estiver em existingSlots (chave
// appointmentId+thresholdDays, ver cardSlotKey) e preenchendo os que
// faltam EM SEQUÊNCIA a partir de initialSequenceCounter. Pura — getReactivationCards
// usa isto pra decidir o que persistir (newlyAssigned) sem acoplar a regra
// de atribuição ao Prisma, e é o que permite testar "mesmo paciente com
// cards em períodos diferentes" e "rotação fixa por card e por período"
// sem precisar de banco.
export function assignReactivationCardSlots(
  cardCandidates: ReactivationCardCandidate[],
  availableSlots: number[],
  initialSequenceCounter: number,
  existingSlots: Map<string, number>
): { cards: AssignedReactivationCard[]; finalSequenceCounter: number; newlyAssigned: ReactivationSlotAssignment[] } {
  let sequenceCounter = initialSequenceCounter;
  const cards: AssignedReactivationCard[] = [];
  const newlyAssigned: ReactivationSlotAssignment[] = [];

  for (const candidate of cardCandidates) {
    const key = cardSlotKey(candidate.appointmentId, candidate.thresholdDays);
    let slot = existingSlots.get(key);
    if (slot === undefined) {
      const assigned = assignNextReactivationSlot(availableSlots, sequenceCounter);
      slot = assigned.slot;
      sequenceCounter = assigned.nextSequenceCounter;
      newlyAssigned.push({ appointmentId: candidate.appointmentId, thresholdDays: candidate.thresholdDays, slot });
    }
    cards.push({ ...candidate, slot });
  }

  return { cards, finalSequenceCounter: sequenceCounter, newlyAssigned };
}

export async function getReactivationCards(clinicId: string, now: Date = new Date()): Promise<ReactivationCard[]> {
  const config = await prisma.reactivationConfig.findUnique({ where: { clinicId } });
  // Lista vazia (ou clínica sem nenhuma ReactivationConfig ainda) = nenhum
  // período marcado = Reativação desligada pra essa clínica (pedido
  // explícito) — nem vale a pena buscar agendamento nenhum.
  const thresholdDaysList = config?.thresholdDaysList ?? [];
  if (thresholdDaysList.length === 0) return [];

  const messages = [config?.message1, config?.message2, config?.message3, config?.message4, config?.message5];
  const availableSlots = resolveAvailableReactivationSlots(messages);

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, conversationId: { not: null } },
    select: { id: true, leadId: true, conversationId: true, scheduledAt: true, status: true },
  });

  const baseCandidates = selectReactivationCandidates(appointments);
  const cardCandidates = buildReactivationCardCandidates(baseCandidates, thresholdDaysList, now);
  if (cardCandidates.length === 0) return [];

  const existingSlotRows = await prisma.reactivationCardSlot.findMany({
    where: { appointmentId: { in: cardCandidates.map((c) => c.appointmentId) } },
  });
  const existingSlots = new Map(existingSlotRows.map((s) => [cardSlotKey(s.appointmentId, s.thresholdDays), s.slot]));

  const initialSequenceCounter = config?.sequenceCounter ?? 0;
  const { cards, finalSequenceCounter, newlyAssigned } = assignReactivationCardSlots(
    cardCandidates,
    availableSlots,
    initialSequenceCounter,
    existingSlots
  );

  // Sequencial de propósito (não Promise.all): preserva a mesma ordem de
  // atribuição decidida por assignReactivationCardSlots ao persistir — não
  // que a ordem de escrita em si importe aqui, mas evita qualquer surpresa
  // de concorrência entre upserts da mesma clínica.
  for (const assignment of newlyAssigned) {
    await prisma.reactivationCardSlot.upsert({
      where: {
        appointmentId_thresholdDays: { appointmentId: assignment.appointmentId, thresholdDays: assignment.thresholdDays },
      },
      create: assignment,
      update: {},
    });
  }

  if (finalSequenceCounter !== initialSequenceCounter) {
    await prisma.reactivationConfig.upsert({
      where: { clinicId },
      create: { clinicId, thresholdDaysList: DEFAULT_REACTIVATION_THRESHOLD_DAYS_LIST, sequenceCounter: finalSequenceCounter },
      update: { sequenceCounter: finalSequenceCounter },
    });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: cardCandidates.map((c) => c.leadId) } },
    select: { id: true, name: true, igUsername: true, profilePictureUrl: true, phone: true },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  return cards.map((c) => {
    const lead = leadById.get(c.leadId);
    const message = resolveReactivationMessageText(c.slot, messages);
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
      thresholdDays: c.thresholdDays,
    };
  });
}

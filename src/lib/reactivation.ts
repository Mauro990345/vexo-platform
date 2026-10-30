import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import { normalizeBrazilianWhatsappNumber, validateBrazilianPhone, sendWhatsappMessage, formatDateTimeLabel } from "@/lib/whatsapp";
import { ensureLeadFirstNameFromInstagram } from "@/lib/instagram";
import { renderMessageTemplate, normalizeFirstNameForTemplate } from "@/lib/message-template";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";

// Faixa "Reativação" do Painel do cliente (ver ClientPanelView.tsx /
// ReactivationRail.tsx) — pacientes cujo agendamento da IA completou o
// prazo configurado sem retorno. Lógica pura aqui (testável sem Prisma,
// mesmo padrão de report-conversations-logic.ts/metrics.ts), wrapper com
// Prisma embaixo.

// Prazos de retorno que uma clínica pode marcar como "disponíveis" pro
// botão "Retorno" do agendamento (ver RetornoButton.tsx) — lista FIXA de 9
// valores (pedido explícito); ReactivationConfig.availablePeriods é sempre
// um subconjunto desta lista. Substituiu os antigos "períodos de teste" +
// 90/120/150 (um período único GLOBAL por clínica, de antes do botão
// "Retorno" existir) — "fase de teste, sem usuários reais", dado antigo
// descartado na mesma migration que trouxe o botão.
export const RETURN_PERIOD_OPTIONS = [30, 60, 90, 120, 150, 180, 210, 240, 270] as const;
export type ReturnPeriodDays = (typeof RETURN_PERIOD_OPTIONS)[number];

// Validação pura (sem Prisma) usada pelas server actions de Automações pra
// filtrar os valores marcados nos checkboxes — mesmo papel da antiga
// isValidReactivationThresholdDays.
export function isValidReturnPeriodDays(value: number): value is ReturnPeriodDays {
  return (RETURN_PERIOD_OPTIONS as readonly number[]).includes(value);
}

// Mesmo valor do default do schema (ReactivationConfig.availablePeriods/
// defaultPeriods) — usado como fallback quando a clínica ainda não tem
// ReactivationConfig nenhuma (upsert cria com esses valores).
export const DEFAULT_AVAILABLE_RETURN_PERIODS: ReturnPeriodDays[] = [...RETURN_PERIOD_OPTIONS];
export const DEFAULT_RETURN_PERIODS: ReturnPeriodDays[] = [30, 60];
export const DEFAULT_DAILY_WHATSAPP_LIMIT = 15;

export type ReactivationChannel = "INSTAGRAM" | "WHATSAPP";

// Canal sempre o MESMO critério já usado pelo Faltou (ver no-show-cards.ts)
// — WhatsApp quando o lead tem telefone cadastrado, Instagram (copiar +
// abrir) como fallback quando não tem. WhatsApp desconectado NO MEIO do
// envio (clínica perdeu a conexão depois do card já estar na tela) é um
// caso à parte, já tratado pelo fallback manual existente (ver
// useManualFallback, ReactivationRail.tsx — ativado quando
// sendReactivationWhatsAppMessage devolve reason "disconnected").
export function reactivationChannelForLead(phone: string | null): ReactivationChannel {
  return phone ? "WHATSAPP" : "INSTAGRAM";
}

// Estilo de acompanhamento genérico ("como você está desde o seu
// atendimento"), sem citar nenhum serviço/procedimento — pedido explícito.
// Usado quando a clínica não personalizou nenhuma das 5 mensagens —
// conjunto ÚNICO pros dois canais agora (pedido explícito: "use os mesmos
// textos no WhatsApp e no fallback de Instagram" — antes havia um segundo
// conjunto, DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES, só pro Instagram;
// descartado na mesma migration, "fase de teste, sem usuários reais").
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

// Janela em DIAS CORRIDOS (não dias úteis, ao contrário de
// computeReactivationWindow acima) — ancorada em `anchor` + `offsetDays`,
// visível de `offsetDays - beforeDays` até `offsetDays + afterDays`,
// sempre por DIA civil em America/Sao_Paulo (startOfDay/addDays, mesmo
// fuso de todo o resto do app). Genérica o bastante pra servir tanto o
// botão "Retorno" (computeReturnContactWindow abaixo — beforeDays=3,
// afterDays=3, "aparece 3 dias antes e fica até 3 dias depois") quanto a
// cadência do Quente (hot-lead-cards.ts — beforeDays=0, afterDays=3, "no
// dia exato, visível por até 3 dias"). isWithinReactivationWindow (acima)
// já é genérica o bastante pra checar QUALQUER janela {start,end},
// calculada em dias úteis ou em dias corridos — reaproveitada tal como
// está, sem precisar de uma segunda função de "está dentro da janela".
export function computeCalendarDayWindow(anchor: Date, offsetDays: number, beforeDays: number, afterDays: number): ReactivationWindow {
  const targetDay = startOfDay(addDays(anchor, offsetDays));
  return { start: addDays(targetDay, -beforeDays), end: addDays(targetDay, afterDays) };
}

// Data de contato = data do atendimento + prazo de retorno, em dias
// corridos (pedido explícito — diferente da janela de 5 dias ÚTEIS do
// Faltou, computeReactivationWindow acima, que continua intocada).
// Visível 3 dias antes da data de contato até 3 dias depois (pedido
// explícito), sempre por dia civil em America/Sao_Paulo.
export function computeReturnContactWindow(scheduledAt: Date, periodDays: number): ReactivationWindow {
  return computeCalendarDayWindow(scheduledAt, periodDays, 3, 3);
}

export type ReactivationSourceAppointment = {
  id: string;
  leadId: string | null;
  conversationId: string | null;
  scheduledAt: Date;
  status: string;
  returnPeriodDays: number | null;
  returnPeriodNone: boolean;
};

export type ReactivationCandidate = {
  appointmentId: string;
  leadId: string;
  scheduledAt: Date;
  returnPeriodDays: number | null;
  returnPeriodNone: boolean;
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
    candidates.push({
      appointmentId: appt.id,
      leadId: appt.leadId!,
      scheduledAt: appt.scheduledAt,
      returnPeriodDays: appt.returnPeriodDays,
      returnPeriodNone: appt.returnPeriodNone,
    });
  }
  return candidates;
}

// Quais prazos (dias) geram card pra ESTE agendamento — "Sem retorno"
// marcado = nenhum; um prazo marcado = só esse (substitui os padrão,
// pedido explícito: marcar um prazo cancela os cards padrão pendentes —
// como eles nunca chegam a ser gerados de novo depois que o prazo manual
// está marcado, "cancelar" aqui é simplesmente NUNCA MAIS incluir os
// períodos padrão na lista de candidatos; um slot padrão já criado antes
// da marcação, mas ainda não enviado, simplesmente para de aparecer —
// nenhuma linha precisa ser apagada); nada marcado = os padrão da clínica
// (pode ser mais de um, um card por padrão).
export function resolveAppointmentReturnPeriods(
  appt: { returnPeriodDays: number | null; returnPeriodNone: boolean },
  clinicDefaultPeriods: readonly number[]
): number[] {
  if (appt.returnPeriodNone) return [];
  if (appt.returnPeriodDays != null) return [appt.returnPeriodDays];
  return [...clinicDefaultPeriods];
}

export type ReactivationCardCandidate = ReactivationCandidate & {
  thresholdDays: number;
  window: ReactivationWindow;
};

// Cada prazo de retorno de um agendamento (ver resolveAppointmentReturnPeriods
// acima — um manual, ou vários padrão da clínica) funciona de forma
// INDEPENDENTE: o mesmo candidato pode gerar mais de um card, cada um na
// janela daquele prazo específico (pedido explícito: vários padrão podem
// gerar vários cards, até a secretária marcar um prazo manual). Se a
// janela de um prazo (manual ou padrão) já passou, isWithinReactivationWindow
// simplesmente não inclui esse candidato — "não gerar card" pra janela já
// vencida sai de graça, sem checagem própria.
//
// Ordenado GLOBALMENTE por quem entrou na janela primeiro, entre TODOS os
// agendamentos/prazos juntos — a rotação de mensagens é uma sequência
// ÚNICA por clínica (ver ReactivationConfig.sequenceCounter), então a
// ordem de atribuição de slot precisa ser essa ordem global.
export function buildReactivationCardCandidates(
  candidates: ReactivationCandidate[],
  clinicDefaultPeriods: readonly number[],
  now: Date
): ReactivationCardCandidate[] {
  const result: ReactivationCardCandidate[] = [];
  for (const candidate of candidates) {
    const periods = resolveAppointmentReturnPeriods(candidate, clinicDefaultPeriods);
    for (const thresholdDays of periods) {
      const window = computeReturnContactWindow(candidate.scheduledAt, thresholdDays);
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

// Slots (1-5) com texto configurado; sem nenhum, usa os 5 defaults do
// canal (DEFAULT_WHATSAPP_REACTIVATION_MESSAGES ou
// DEFAULT_INSTAGRAM_REACTIVATION_MESSAGES) como se fossem os 5 slots.
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
// (mesma posição) com fallback pro texto padrão do CANAL correspondente
// (defaults recebido por parâmetro — WhatsApp e Instagram têm conjuntos
// diferentes). O slot em si fica fixo por card (ver ReactivationCardSlot,
// schema.prisma); só o TEXTO pode mudar depois se a clínica editar aquela
// mensagem específica.
export function resolveReactivationMessageText(
  slot: number,
  messages: (string | null | undefined)[],
  defaults: readonly string[]
): string {
  const custom = messages[slot - 1];
  if (custom && custom.trim()) return custom.trim();
  return defaults[slot - 1] ?? defaults[0]!;
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

// ig.me abre a conversa no Instagram direto (sem precisar já ter o
// contato salvo, diferente do wa.me que precisa de telefone) — a mensagem
// NUNCA vai colada na URL (a Meta não expõe esse parâmetro pro Direct):
// o texto é copiado pra área de transferência separadamente (ver
// InstagramDmButton.tsx), a secretária cola e envia manualmente.
export function buildInstagramDmLink(igUsername: string): string {
  return `https://ig.me/m/${igUsername}`;
}

// Perfil público — mesmo formato já usado em NeedsHumanBanner.tsx, só pro
// @ virar link nas linhas de Instagram (pedido explícito; nas linhas de
// WhatsApp o @ continua texto puro, sem link).
export function buildInstagramProfileLink(igUsername: string): string {
  return `https://www.instagram.com/${igUsername}/`;
}

// Decide se o botão "Instagram" do card tem o que fazer — null sem @
// (pedido explícito: "se o lead não tiver @ do Instagram, o botão fica
// desativado"), é exatamente o que InstagramDmButton.tsx usa como
// `disabled={!dmLink}`.
export function resolveInstagramDmLink(igUsername: string | null): string | null {
  return igUsername ? buildInstagramDmLink(igUsername) : null;
}

export type ReactivationCard = {
  appointmentId: string;
  leadId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  channel: ReactivationChannel;
  whatsappLink: string | null;
  instagramDmLink: string | null;
  instagramProfileLink: string | null;
  completionDate: Date;
  thresholdDays: number;
  // Clique no botão de ação (WhatsApp/Instagram) daquele card — ver
  // toggleReactivationCardSent, mais abaixo. null = pendente (padrão).
  sentAt: Date | null;
  // Limite diário de WhatsApp (Reativação + Faltou, ver ReactivationConfig.
  // dailyWhatsappLimit/countTodaysWhatsappSends) já atingido — só É true
  // pra card de canal WHATSAPP ainda pendente (mesmo mecanismo já usado
  // pelo Quente, ver HotLeadCard.dailyLimitReached/panel-cards.ts).
  dailyLimitReached: boolean;
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

// Quantos envios de WhatsApp (Reativação + Faltou somados, pedido
// explícito) já aconteceram HOJE pra uma clínica — conta sentAt de HOJE
// nas duas tabelas (ReactivationCardSlot/NoShowCardSlot), restrito a cards
// cujo lead tem telefone (mesmo critério de reactivationChannelForLead —
// é o que decide se aquele sentAt correspondeu a um card de canal
// WHATSAPP quando exibido; um clique no fallback manual wa.me, que também
// grava sentAt pelo mesmo toggle, ainda é um envio de WhatsApp de verdade
// do ponto de vista da clínica, então conta igual). Compartilhado por
// reactivation.ts e no-show-cards.ts — mesma ideia de
// isReactivationWhatsAppRateLimited acima, mas por DIA em vez de por
// segundos.
export async function countTodaysWhatsappSends(clinicId: string, now: Date): Promise<number> {
  const todayStart = startOfDay(now);
  const todayEnd = addDays(todayStart, 1);
  const [reactivationCount, noShowCount] = await Promise.all([
    prisma.reactivationCardSlot.count({
      where: { sentAt: { gte: todayStart, lt: todayEnd }, appointment: { clinicId, lead: { phone: { not: null } } } },
    }),
    prisma.noShowCardSlot.count({
      where: { sentAt: { gte: todayStart, lt: todayEnd }, appointment: { clinicId, lead: { phone: { not: null } } } },
    }),
  ]);
  return reactivationCount + noShowCount;
}

export function isDailyWhatsappLimitReached(sentTodayCount: number, dailyLimit: number): boolean {
  return sentTodayCount >= dailyLimit;
}

// Cards "fixos" da Clínica Demo VEXO (pedido explícito — usados em vídeos
// e treinamentos, precisam ficar sempre visíveis e sempre funcionando,
// sem depender de scheduledAt/janela de ±3 dias nem de ninguém rodar o
// script de novo). Marca reaproveitada de uma estrutura JÁ EXISTENTE —
// nenhuma migration nova: a mera EXISTÊNCIA de uma linha em
// ReactivationShowcaseBackup (appointmentId) já identifica "este é um dos
// cards fixos do showcase", porque só prisma/seed-reactivation-showcase.ts
// escreve nessa tabela, e só pra esta clínica (assertDemoClinic). Mesmo
// assim, a checagem de clinicId abaixo é EXPLÍCITA (não confia só em "a
// tabela está vazia pras outras clínicas") — defesa em profundidade,
// pedido explícito item 3 ("adicione teste que comprove isso").
//
// Um card fixo entra na lista final IGNORANDO por completo: a janela de
// ±3 dias (computeReturnContactWindow é calculada só pra exibir a data,
// nunca checada com isWithinReactivationWindow), qual foi o agendamento
// MAIS RECENTE do lead (selectReactivationCandidates nunca roda pra estes
// ids — ver exclusão em getReactivationCards, abaixo) e o status do
// agendamento (CANCELLED/NO_SHOW não importam aqui). Por isso continua
// aparecendo mesmo se esse agendamento for marcado "Retornou", cancelado,
// ou o lead ganhar um agendamento mais novo depois (pedido explícito,
// item 1).
//
// A partir daqui, o card percorre o MESMO caminho de sempre
// (assignReactivationCardSlots reusa o ReactivationCardSlot já existente
// pelo appointmentId+thresholdDays — criado pelo próprio script — então
// nunca consome um slot novo da sequência; toggle/envio de WhatsApp
// continuam sendo toggleReactivationCardSent/sendReactivationWhatsAppMessage,
// inalterados, SEM NENHUMA validação de janela) — é isso que garante
// "funcionando de verdade", pedido explícito item 2.
async function getPinnedReactivationCandidates(
  clinicId: string,
  defaultPeriods: readonly number[]
): Promise<{ candidates: ReactivationCardCandidate[]; pinnedAppointmentIds: Set<string> }> {
  if (clinicId !== DEMO_CLINIC_ID) return { candidates: [], pinnedAppointmentIds: new Set() };

  const backups = await prisma.reactivationShowcaseBackup.findMany({
    where: { clinicId },
    select: { appointmentId: true },
  });
  const pinnedAppointmentIds = new Set(backups.map((b) => b.appointmentId));
  if (pinnedAppointmentIds.size === 0) return { candidates: [], pinnedAppointmentIds };

  // Releitura DIRETA por id — de propósito sem os filtros normais
  // (conversationId/status/"mais recente por lead"): um card fixo precisa
  // continuar aparecendo mesmo que o agendamento tenha sido cancelado ou
  // deixado de ser o mais recente do lead.
  const appointments = await prisma.appointment.findMany({
    where: { id: { in: [...pinnedAppointmentIds] } },
    select: { id: true, leadId: true, scheduledAt: true, returnPeriodDays: true, returnPeriodNone: true },
  });

  const candidates: ReactivationCardCandidate[] = [];
  for (const appt of appointments) {
    if (!appt.leadId) continue;
    for (const thresholdDays of resolveAppointmentReturnPeriods(appt, defaultPeriods)) {
      candidates.push({
        appointmentId: appt.id,
        leadId: appt.leadId,
        scheduledAt: appt.scheduledAt,
        returnPeriodDays: appt.returnPeriodDays,
        returnPeriodNone: appt.returnPeriodNone,
        thresholdDays,
        // Só informativo (completionDate exibido no card) — NUNCA checado
        // com isWithinReactivationWindow pra estes candidatos.
        window: computeReturnContactWindow(appt.scheduledAt, thresholdDays),
      });
    }
  }
  return { candidates, pinnedAppointmentIds };
}

export async function getReactivationCards(clinicId: string, now: Date = new Date()): Promise<ReactivationCard[]> {
  const config = await prisma.reactivationConfig.findUnique({ where: { clinicId } });
  const defaultPeriods = config?.defaultPeriods?.length ? config.defaultPeriods : DEFAULT_RETURN_PERIODS;
  const dailyLimit = config?.dailyWhatsappLimit ?? DEFAULT_DAILY_WHATSAPP_LIMIT;

  const messages = [config?.message1, config?.message2, config?.message3, config?.message4, config?.message5];
  const availableSlots = resolveAvailableReactivationSlots(messages);

  const { candidates: pinnedCardCandidates, pinnedAppointmentIds } = await getPinnedReactivationCandidates(clinicId, defaultPeriods);

  const appointments = await prisma.appointment.findMany({
    where: { clinicId, conversationId: { not: null } },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      scheduledAt: true,
      status: true,
      returnPeriodDays: true,
      returnPeriodNone: true,
    },
  });

  // Ids fixos NUNCA passam pelo caminho normal (seleção por lead
  // mais-recente + janela de ±3 dias, abaixo) — já entraram incondicionalmente
  // via pinnedCardCandidates, acima. Excluir aqui evita duplicar o mesmo
  // card e garante que status/"outro agendamento mais novo" nunca tirem um
  // card fixo da lista (pedido explícito, item 1).
  const baseCandidates = selectReactivationCandidates(
    pinnedAppointmentIds.size === 0 ? appointments : appointments.filter((a) => !pinnedAppointmentIds.has(a.id))
  );
  const cardCandidates = [...buildReactivationCardCandidates(baseCandidates, defaultPeriods, now), ...pinnedCardCandidates];
  if (cardCandidates.length === 0) return [];

  const existingSlotRows = await prisma.reactivationCardSlot.findMany({
    where: { appointmentId: { in: cardCandidates.map((c) => c.appointmentId) } },
  });
  const existingSlots = new Map(existingSlotRows.map((s) => [cardSlotKey(s.appointmentId, s.thresholdDays), s.slot]));
  const sentAtBySlotKey = new Map(existingSlotRows.map((s) => [cardSlotKey(s.appointmentId, s.thresholdDays), s.sentAt]));

  const initialSequenceCounter = config?.sequenceCounter ?? 0;
  const { cards, finalSequenceCounter, newlyAssigned } = assignReactivationCardSlots(
    cardCandidates,
    availableSlots,
    initialSequenceCounter,
    existingSlots
  );

  // Sequencial de propósito (não Promise.all): evita qualquer surpresa de
  // concorrência entre upserts da mesma clínica.
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
      create: { clinicId, sequenceCounter: finalSequenceCounter },
      update: { sequenceCounter: finalSequenceCounter },
    });
  }

  const leads = await prisma.lead.findMany({
    where: { id: { in: cardCandidates.map((c) => c.leadId) } },
    select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true, phone: true },
  });
  const leadById = new Map(leads.map((l) => [l.id, l]));

  // {{primeiro_nome}}/{{data_horario}} (pedido explícito — hoje o texto
  // configurado pela clínica saía LITERAL, sem nenhuma substituição).
  // Nome: mesma fonte de sempre (perfil do Instagram do lead) — busca e
  // cacheia em paralelo, uma vez por LEAD distinto (não por card: o mesmo
  // lead pode ter cards em prazos diferentes), nunca o @ do Instagram
  // como nome (ver ensureLeadFirstNameFromInstagram/normalizeFirstNameForTemplate).
  const instagramAccount = await prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } });
  const rawNameByLeadId = new Map<string, string | null>();
  if (instagramAccount) {
    await Promise.all(
      leads.map(async (lead) => {
        rawNameByLeadId.set(lead.id, await ensureLeadFirstNameFromInstagram(lead, instagramAccount.accessTokenEnc));
      })
    );
  } else {
    for (const lead of leads) rawNameByLeadId.set(lead.id, lead.name);
  }

  const sentTodayCount = await countTodaysWhatsappSends(clinicId, now);
  const whatsappDailyLimitReached = isDailyWhatsappLimitReached(sentTodayCount, dailyLimit);

  return cards.map((c) => {
    const lead = leadById.get(c.leadId);
    const phone = lead?.phone ?? null;
    const channel = reactivationChannelForLead(phone);
    const rawTemplate = resolveReactivationMessageText(c.slot, messages, DEFAULT_REACTIVATION_MESSAGES);
    const message = renderMessageTemplate(rawTemplate, {
      primeiro_nome: normalizeFirstNameForTemplate(rawNameByLeadId.get(c.leadId) ?? null),
      data_horario: formatDateTimeLabel(c.scheduledAt, now),
    });
    const igUsername = lead?.igUsername ?? null;
    const sentAt = sentAtBySlotKey.get(cardSlotKey(c.appointmentId, c.thresholdDays)) ?? null;
    return {
      appointmentId: c.appointmentId,
      leadId: c.leadId,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      channel,
      whatsappLink: channel === "WHATSAPP" && phone ? buildReactivationWhatsAppLink(phone, message) : null,
      instagramDmLink: channel === "INSTAGRAM" ? resolveInstagramDmLink(igUsername) : null,
      // @ só vira link de perfil nas linhas de Instagram (pedido
      // explícito) — nas de WhatsApp continua texto puro.
      instagramProfileLink: channel === "INSTAGRAM" && igUsername ? buildInstagramProfileLink(igUsername) : null,
      completionDate: c.window.start,
      thresholdDays: c.thresholdDays,
      // Nunca indefinido: um card recém-atribuído (newlyAssigned, acima)
      // não tem linha em existingSlotRows ainda — get() devolve undefined,
      // ?? null normaliza pro mesmo "pendente" de um card já existente
      // nunca marcado.
      sentAt,
      dailyLimitReached: channel === "WHATSAPP" && !sentAt && whatsappDailyLimitReached,
    };
  });
}

// Ordenação exibida na Reativação do Painel (ver ReactivationRail) —
// pendentes primeiro, na ordem de sempre (a mesma que getReactivationCards
// devolve, "quem completou primeiro"); enviados no fim, preservando a
// ordem relativa de sempre ENTRE ELES também (pedido explícito). Sort
// ESTÁVEL (Array.prototype.sort é estável desde ES2019) com um comparador
// que só distingue "enviado vs pendente" é o que garante isso — nunca
// reordena dentro de cada grupo, só decide em qual dos dois grupos cada
// card cai.
export function sortReactivationCardsForDisplay<T extends { sentAt: Date | null }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => Number(Boolean(a.sentAt)) - Number(Boolean(b.sentAt)));
}

// Título da faixa mostra só os PENDENTES (pedido explícito) — um card
// enviado não conta mais pro número, mesmo continuando visível (apagado,
// no fim da lista) até a janela de 5 dias úteis vencer.
export function countPendingReactivationCards<T extends { sentAt: Date | null }>(cards: T[]): number {
  return cards.filter((c) => !c.sentAt).length;
}

// Alterna o clique no botão de ação (WhatsApp/Instagram) de um card —
// mesma semântica de toggle já usada por setAppointmentAttendance
// (appointments.ts): clicar de novo desfaz. Pura (sem Prisma) — nunca
// confia em nada vindo do cliente além da intenção de alternar; quem
// chama decide o valor atual lendo o banco, nunca aceitando um booleano
// cru de fora.
export function toggleReactivationSentAt(currentSentAt: Date | null, now: Date): Date | null {
  return currentSentAt ? null : now;
}

// Orquestração (lê o slot atual, decide o novo valor, grava) — separada
// da validação de clínica, que fica nas duas server actions que chamam
// esta função (uma pra sessão CLIENT, outra pra sessão INTERNAL_ADMIN/
// STAFF — ver toggleReactivationCardSentClientAction/
// toggleReactivationCardSentAction). null quando o slot não existe (não
// deveria acontecer — o botão só aparece pra um card que já passou por
// getReactivationCards, que sempre garante o slot — mas sem crash
// nenhum caso aconteça por alguma corrida).
export async function toggleReactivationCardSent(
  appointmentId: string,
  thresholdDays: number,
  now: Date = new Date()
): Promise<{ clinicId: string; sentAt: Date | null } | null> {
  const slot = await prisma.reactivationCardSlot.findUnique({
    where: { appointmentId_thresholdDays: { appointmentId, thresholdDays } },
    include: { appointment: { select: { clinicId: true } } },
  });
  if (!slot) return null;

  const sentAt = toggleReactivationSentAt(slot.sentAt, now);
  await prisma.reactivationCardSlot.update({ where: { id: slot.id }, data: { sentAt } });

  return { clinicId: slot.appointment.clinicId, sentAt };
}

// -----------------------------------------------------------------------
// Envio direto do WhatsApp pelo VEXO (decisão explícita: SÓ WhatsApp — o
// Instagram continua copiar + abrir, envio manual, sem mudança nenhuma).
// Um clique = uma mensagem, nunca em lote, nunca automático — a reação ao
// clique é sempre uma chamada humana, uma por vez, nunca um gatilho de
// tempo/worker como o follow-up.
// -----------------------------------------------------------------------

// "Cerca de 10 segundos" (pedido explícito) — proteção contra o chip da
// clínica mandando rajadas de mensagem: qualquer clique que caia dentro
// desse intervalo desde o ÚLTIMO envio de WhatsApp da Reativação da MESMA
// clínica (qualquer card, não só este) é rejeitado, sem mandar nada.
export const REACTIVATION_WHATSAPP_MIN_INTERVAL_MS = 10_000;

// Pura — decide só com base no sentAt mais recente já conhecido; quem
// chama é responsável por achar esse valor (ver
// sendReactivationWhatsAppMessage, mais abaixo, que busca só entre os
// slots cujo canal resolve pra WHATSAPP).
export function isReactivationWhatsAppRateLimited(mostRecentWhatsappSentAt: Date | null, now: Date): boolean {
  if (!mostRecentWhatsappSentAt) return false;
  return now.getTime() - mostRecentWhatsappSentAt.getTime() < REACTIVATION_WHATSAPP_MIN_INTERVAL_MS;
}

// "no_longer_eligible" (pedido explícito, item 4 — travas) nunca é
// devolvido por sendReactivationWhatsAppMessage em si (comportamento desta
// função 100% inalterado); existe aqui só pra no-show-cards.ts reaproveitar
// o MESMO tipo de resultado (e, no cliente, o mesmo componente/mensagem de
// aviso) pro card "Faltou" — cobre a corrida "lead respondeu/remarcou
// entre o card aparecer e o clique" (log de follow-up fechado nesse meio-
// tempo), ver sendNoShowCardWhatsAppMessage.
export type SendReactivationWhatsAppResult =
  | { ok: true; alreadySent: boolean }
  | {
      ok: false;
      reason:
        | "not_found"
        | "rate_limited"
        | "invalid_phone"
        | "disconnected"
        | "send_failed"
        | "no_longer_eligible"
        | "daily_limit_reached";
    };

// Orquestração completa do clique no botão WhatsApp de um card — validação
// de clínica fica nas duas server actions que chamam esta função (mesmo
// padrão de toggleReactivationCardSent, acima), não aqui.
//
// Nunca confia em texto vindo do cliente (pedido explícito): o texto é
// SEMPRE remontado aqui, a partir de ReactivationConfig (mensagens da
// clínica) + slot.slot (a variação já atribuída a ESTE card desde que ele
// entrou na faixa, ver assignReactivationCardSlots acima) — exatamente a
// mesma fonte que getReactivationCards usa pra montar `card.message`,
// nunca o que a requisição mandou.
//
// Reserva ATÔMICA antes de mandar (updateMany condicionado em
// sentAt: null — mesmo padrão de claimMessage, dispatch.ts): só UMA
// chamada concorrente pra este mesmo card ganha o claim; a(s) outra(s)
// contam count=0 e tratam como "já enviado", sem mandar de novo (anti
// duplo clique). Qualquer falha DEPOIS do claim (telefone inválido,
// clínica desconectada, erro na Evolution API) libera a reserva
// (sentAt -> null de novo) — só fica marcado como enviado se o envio for
// bem-sucedido de verdade.
export async function sendReactivationWhatsAppMessage(
  appointmentId: string,
  thresholdDays: number,
  now: Date = new Date()
): Promise<SendReactivationWhatsAppResult & { clinicId?: string }> {
  const slot = await prisma.reactivationCardSlot.findUnique({
    where: { appointmentId_thresholdDays: { appointmentId, thresholdDays } },
    include: {
      appointment: {
        select: {
          clinicId: true,
          scheduledAt: true,
          lead: { select: { id: true, name: true, igScopedId: true, nameLookupAttempted: true, phone: true } },
          clinic: {
            select: {
              whatsappInstanceName: true,
              instagramAccount: { select: { accessTokenEnc: true } },
              reactivationConfig: {
                select: { message1: true, message2: true, message3: true, message4: true, message5: true },
              },
            },
          },
        },
      },
    },
  });
  if (!slot) return { ok: false, reason: "not_found" };

  const clinicId = slot.appointment.clinicId;

  // Idempotência (pedido explícito): card já marcado, não manda de novo —
  // nem chega a checar rate limit/limite diário pra um card que não vai
  // gerar envio nenhum.
  if (slot.sentAt) return { ok: true, alreadySent: true, clinicId };

  // Defesa em profundidade pro limite diário (item 4, "travas") — cobre a
  // corrida "limite batido entre o card aparecer na tela e o clique"; a UI
  // já esconde o botão nesse caso (ver ReactivationCard.dailyLimitReached/
  // ReactivationRail.tsx), mas o servidor nunca confia só na tela.
  const [reactivationConfig, sentTodayCount] = await Promise.all([
    prisma.reactivationConfig.findUnique({ where: { clinicId }, select: { dailyWhatsappLimit: true } }),
    countTodaysWhatsappSends(clinicId, now),
  ]);
  const dailyLimit = reactivationConfig?.dailyWhatsappLimit ?? DEFAULT_DAILY_WHATSAPP_LIMIT;
  if (isDailyWhatsappLimitReached(sentTodayCount, dailyLimit)) {
    return { ok: false, reason: "daily_limit_reached", clinicId };
  }

  const [recentReactivationSent, recentNoShowSent] = await Promise.all([
    prisma.reactivationCardSlot.findFirst({
      where: { sentAt: { not: null }, appointment: { clinicId, lead: { phone: { not: null } } } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    prisma.noShowCardSlot.findFirst({
      where: { sentAt: { not: null }, appointment: { clinicId, lead: { phone: { not: null } } } },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
  ]);
  const mostRecentWhatsappSentAt =
    [recentReactivationSent?.sentAt, recentNoShowSent?.sentAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ??
    null;
  if (isReactivationWhatsAppRateLimited(mostRecentWhatsappSentAt, now)) {
    return { ok: false, reason: "rate_limited", clinicId };
  }

  const claim = await prisma.reactivationCardSlot.updateMany({
    where: { id: slot.id, sentAt: null },
    data: { sentAt: now },
  });
  if (claim.count === 0) {
    // Outra chamada concorrente pra ESTE card já ganhou o claim entre a
    // leitura acima e aqui — trata como já enviado, nunca manda de novo.
    return { ok: true, alreadySent: true, clinicId };
  }

  // Capturado numa const antes do closure abaixo — `slot` já está non-null
  // aqui (early return lá no topo), mas o TypeScript não carrega esse
  // narrowing pra dentro de uma função aninhada (mesmo padrão de sempre
  // neste arquivo/projeto).
  const slotId = slot.id;
  async function releaseClaim() {
    await prisma.reactivationCardSlot.update({ where: { id: slotId }, data: { sentAt: null } });
  }

  const phone = slot.appointment.lead?.phone ?? null;
  const phoneCheck = phone ? validateBrazilianPhone(phone) : { valid: false as const, reason: "Lead sem telefone cadastrado." };
  if (!phoneCheck.valid) {
    await releaseClaim();
    console.error(`[vexo:reactivation] Telefone inválido pra envio de WhatsApp (appointmentId=${appointmentId}): ${phoneCheck.reason}`);
    return { ok: false, reason: "invalid_phone", clinicId };
  }

  const instanceName = slot.appointment.clinic.whatsappInstanceName;
  if (!instanceName) {
    await releaseClaim();
    return { ok: false, reason: "disconnected", clinicId };
  }

  const config = slot.appointment.clinic.reactivationConfig;
  const messages = [config?.message1, config?.message2, config?.message3, config?.message4, config?.message5];
  const rawTemplate = resolveReactivationMessageText(slot.slot, messages, DEFAULT_REACTIVATION_MESSAGES);

  // {{primeiro_nome}}/{{data_horario}} (mesmo mecanismo de getReactivationCards,
  // acima — nunca confia em texto pronto, sempre renderiza de novo aqui no
  // momento do envio de verdade).
  const lead = slot.appointment.lead;
  const instagramAccount = slot.appointment.clinic.instagramAccount;
  const rawName = lead && instagramAccount ? await ensureLeadFirstNameFromInstagram(lead, instagramAccount.accessTokenEnc) : (lead?.name ?? null);
  const text = renderMessageTemplate(rawTemplate, {
    primeiro_nome: normalizeFirstNameForTemplate(rawName),
    data_horario: formatDateTimeLabel(slot.appointment.scheduledAt, now),
  });

  try {
    await sendWhatsappMessage(instanceName, phoneCheck.e164, text);
  } catch (err) {
    await releaseClaim();
    console.error(`[vexo:reactivation] Falha ao enviar WhatsApp da Reativação (appointmentId=${appointmentId}, thresholdDays=${thresholdDays}):`, err);
    return { ok: false, reason: "send_failed", clinicId };
  }

  return { ok: true, alreadySent: false, clinicId };
}

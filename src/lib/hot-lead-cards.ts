import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import {
  computeCalendarDayWindow,
  isWithinReactivationWindow,
  resolveAvailableReactivationSlots,
  assignNextReactivationSlot,
  resolveReactivationMessageText,
  resolveInstagramDmLink,
  buildInstagramProfileLink,
  type ReactivationWindow,
} from "@/lib/reactivation";
import { ensureLeadFirstNameFromInstagram } from "@/lib/instagram";
import { renderMessageTemplate, normalizeFirstNameForTemplate } from "@/lib/message-template";
import { detectHotLeadSignal, leadAskedToStop, type HotLeadSignalCategory } from "@/lib/hot-lead-detection";

// Card "Quente" — item 4 do pedido. Lead com conversa que NUNCA agendou
// (nenhum Appointment, de nenhum status, pro lead inteiro — não só esta
// conversa: um lead que já chegou a agendar alguma vez, mesmo cancelado,
// não é mais "nunca agendou"), com sinal de interesse (ver
// hot-lead-detection.ts) e que não pediu pra parar, numa cadência FIXA de
// 3 passos contados a partir da ÚLTIMA MENSAGEM DO LEAD no momento em que
// a sequência começou.
//
// Reescrita completa (pedido explícito) — antes havia um único card por
// conversa, numa janela de 3-21 dias de silêncio recalculada do zero a
// cada consulta; agora são até 3 passos (2/4/30 dias), cada um visível 3
// dias, com uma ÂNCORA FIXA por conversa (ver HotLeadCardSlot.
// sequenceAnchorAt, schema.prisma) — sem isso, cada nova mensagem do lead
// reiniciaria os prazos em vez de cancelar a sequência (pedido explícito:
// "a sequência NÃO reinicia").
//
// Travas (item "Se o lead responder, agendar ou pedir para parar"):
// - RESPONDER: Conversation.lastLeadMessageAt fica MAIOR que a âncora
//   congelada (ver isHotLeadSequenceStale abaixo) — os passos pendentes
//   somem, sem precisar de nenhum campo "cancelado": como nenhum passo
//   novo é criado depois disso, a sequência nunca mais aparece (não
//   reinicia, mesmo espírito de "cancelamento por não criar de novo" já
//   usado pelos prazos padrão de Reativação, ver reactivation.ts).
// - AGENDAR: tira a conversa da lista pela checagem "nunca agendou"
//   (lead.appointments: none), re-verificada do zero a cada consulta.
// - PEDIR PRA PARAR: leadAskedToStop é RE-verificado a cada consulta
//   (não só na hora de abrir a sequência) — a única das três travas que
//   precisa ser reavaliada mesmo depois da sequência já ter começado.

export const HOT_LEAD_STEP_DAYS = [2, 4, 30] as const;
export const HOT_LEAD_STEP_COUNT = HOT_LEAD_STEP_DAYS.length;
export const HOT_LEAD_WINDOW_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_HOT_LEAD_STEP_MESSAGES: readonly [readonly string[], readonly string[], readonly string[]] = [
  // Passo 1 · 2 dias.
  [
    "Oi! Vi que você tinha algumas perguntas — ainda posso te ajudar com isso?",
    "Oi! Ficou alguma dúvida sobre o que você perguntou? Posso te ajudar por aqui.",
    "Oi! Passando pra saber se ainda tem interesse — fico à disposição pra qualquer pergunta.",
  ],
  // Passo 2 · 4 dias.
  [
    "Oi! Ainda por aqui — posso te dar mais detalhes se ainda fizer sentido pra você?",
    "Oi! Vi sua mensagem por aqui — fico à disposição se ainda quiser saber mais.",
    "Oi! Passando de novo pra saber se ainda posso ajudar com o que você perguntou.",
  ],
  // Passo 3 · 30 dias — última tentativa.
  [
    "Oi! Faz um tempo que a gente não se fala — ainda posso te ajudar com o que você perguntou?",
    "Oi! Ficamos à disposição se ainda fizer sentido pra você — é só responder por aqui.",
    "Oi! Última vez que passamos por aqui — se precisar de algo, estamos à disposição.",
  ],
];

// Congelada por conversa (ver HotLeadCardSlot.sequenceAnchorAt) — uma
// mensagem do lead DEPOIS da âncora significa que ele respondeu depois da
// sequência ter começado, cancelando os passos pendentes (pedido
// explícito). Enquanto o lead fica calado, lastLeadMessageAt não muda, e
// esta função sempre devolve false.
export function isHotLeadSequenceStale(anchorAt: Date, lastLeadMessageAt: Date | null): boolean {
  if (!lastLeadMessageAt) return false;
  return lastLeadMessageAt.getTime() > anchorAt.getTime();
}

export type HotLeadExistingStep = { step: number; slot: number; sentAt: Date | null; category: string; sequenceAnchorAt: Date };

export type HotLeadConversationInput = {
  conversationId: string;
  leadId: string;
  lastLeadMessageAt: Date | null;
  leadMessageContents: string[];
  existingSteps: HotLeadExistingStep[];
};

export type HotLeadStepChoice = { step: number; category: HotLeadSignalCategory; anchorAt: Date; window: ReactivationWindow };

// Pura — decide, pra UMA conversa já pré-filtrada (nunca agendou, status
// elegível — ver getHotLeadCards), qual o ÚNICO passo pendente a mostrar
// agora (ou null, se nenhum). "Só um card pendente por lead" (pedido
// explícito): sempre o passo de MENOR número cuja janela está aberta e
// ainda não foi enviado — nunca mostra dois ao mesmo tempo, mesmo com
// janelas vizinhas se sobrepondo (passo 1 = dias 2-5, passo 2 = dias 4-7,
// se sobrepõem nos dias 4-5; o passo 1, se ainda pendente, sempre vence).
export function chooseHotLeadStep(input: HotLeadConversationInput, now: Date): HotLeadStepChoice | null {
  if (leadAskedToStop(input.leadMessageContents)) return null;

  let anchorAt: Date;
  let category: HotLeadSignalCategory;

  if (input.existingSteps.length > 0) {
    // Sequência já começada — âncora e categoria ficam congeladas no que
    // foi decidido na primeira vez (nunca recalculadas).
    anchorAt = input.existingSteps[0]!.sequenceAnchorAt;
    category = input.existingSteps[0]!.category as HotLeadSignalCategory;
    if (isHotLeadSequenceStale(anchorAt, input.lastLeadMessageAt)) return null;
  } else {
    // Pode abrir uma sequência nova — precisa do sinal de interesse AGORA
    // (só nesta hora; passos seguintes da MESMA sequência não re-exigem
    // o sinal, ver comentário grande no topo do arquivo).
    if (!input.lastLeadMessageAt) return null;
    const detected = detectHotLeadSignal(input.leadMessageContents);
    if (!detected) return null;
    anchorAt = input.lastLeadMessageAt;
    category = detected;
  }

  const sentSteps = new Set(input.existingSteps.filter((s) => s.sentAt).map((s) => s.step));
  for (let i = 0; i < HOT_LEAD_STEP_DAYS.length; i++) {
    const step = i + 1;
    if (sentSteps.has(step)) continue;
    const window = computeCalendarDayWindow(anchorAt, HOT_LEAD_STEP_DAYS[i]!, 0, HOT_LEAD_WINDOW_AFTER_DAYS);
    if (isWithinReactivationWindow(window, now)) {
      return { step, category, anchorAt, window };
    }
  }
  return null;
}

export type HotLeadCardCandidate = {
  conversationId: string;
  leadId: string;
  step: number;
  category: HotLeadSignalCategory;
  anchorAt: Date;
  window: ReactivationWindow;
};

// Pura — aplica chooseHotLeadStep a cada conversa já pré-filtrada pela
// query (ver getHotLeadCards) e ordena: quem entrou na janela primeiro e,
// dentro do mesmo instante, "horario" antes de "preco_endereco" (pedido
// explícito de ordenação, mesmo critério de sempre).
export function buildHotLeadCardCandidates(conversations: HotLeadConversationInput[], now: Date): HotLeadCardCandidate[] {
  const result: HotLeadCardCandidate[] = [];
  for (const conv of conversations) {
    const choice = chooseHotLeadStep(conv, now);
    if (!choice) continue;
    result.push({ conversationId: conv.conversationId, leadId: conv.leadId, step: choice.step, category: choice.category, anchorAt: choice.anchorAt, window: choice.window });
  }
  return result.sort(
    (a, b) =>
      a.window.start.getTime() - b.window.start.getTime() ||
      (a.category === b.category ? 0 : a.category === "horario" ? -1 : 1) ||
      a.conversationId.localeCompare(b.conversationId)
  );
}

export function buildHotLeadCardReason(category: HotLeadSignalCategory, anchorAt: Date, now: Date, step: number): string {
  const days = Math.max(0, Math.floor((now.getTime() - anchorAt.getTime()) / DAY_MS));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  const label = category === "horario" ? "Perguntou sobre horário" : "Perguntou preço/endereço";
  return `${label} · há ${dayLabel} · passo ${step} de ${HOT_LEAD_STEP_COUNT}`;
}

// Limite diário de cliques (envios de verdade pelo Instagram) por clínica
// — proteção contra excesso de contato automatizado pela mesma conta
// (pedido explícito). Pura — quem chama conta quantos HotLeadCardSlot já
// foram marcados "enviado" HOJE pra esta clínica.
export function isHotLeadDailyLimitReached(sentTodayCount: number, dailyLimit: number): boolean {
  return sentTodayCount >= dailyLimit;
}

export type HotLeadCard = {
  conversationId: string;
  leadId: string;
  step: number;
  slot: number;
  category: HotLeadSignalCategory;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  instagramDmLink: string | null;
  instagramProfileLink: string | null;
  reason: string;
  sentAt: Date | null;
  dailyLimitReached: boolean;
};

function stepMessagesFromConfig(
  config: {
    step1Message1?: string | null; step1Message2?: string | null; step1Message3?: string | null;
    step2Message1?: string | null; step2Message2?: string | null; step2Message3?: string | null;
    step3Message1?: string | null; step3Message2?: string | null; step3Message3?: string | null;
  } | null,
  step: number
): (string | null | undefined)[] {
  if (step === 1) return [config?.step1Message1, config?.step1Message2, config?.step1Message3];
  if (step === 2) return [config?.step2Message1, config?.step2Message2, config?.step2Message3];
  return [config?.step3Message1, config?.step3Message2, config?.step3Message3];
}

function stepCounterFromConfig(config: { step1SequenceCounter?: number; step2SequenceCounter?: number; step3SequenceCounter?: number } | null, step: number): number {
  if (step === 1) return config?.step1SequenceCounter ?? 0;
  if (step === 2) return config?.step2SequenceCounter ?? 0;
  return config?.step3SequenceCounter ?? 0;
}

export async function getHotLeadCards(clinicId: string, now: Date = new Date()): Promise<HotLeadCard[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      clinicId,
      status: { notIn: ["SCHEDULED", "NEEDS_HUMAN"] },
      lastLeadMessageAt: { not: null },
      lead: { appointments: { none: {} } },
    },
    select: {
      id: true,
      leadId: true,
      lastLeadMessageAt: true,
      messages: { where: { direction: "INBOUND" }, select: { content: true }, orderBy: { createdAt: "asc" } },
      hotLeadCardSlots: { select: { step: true, slot: true, sentAt: true, category: true, sequenceAnchorAt: true } },
    },
  });

  const inputs: HotLeadConversationInput[] = conversations.map((c) => ({
    conversationId: c.id,
    leadId: c.leadId,
    lastLeadMessageAt: c.lastLeadMessageAt,
    leadMessageContents: c.messages.map((m) => m.content),
    existingSteps: c.hotLeadCardSlots,
  }));
  const existingStepsByConvId = new Map(conversations.map((c) => [c.id, c.hotLeadCardSlots]));

  const cardCandidates = buildHotLeadCardCandidates(inputs, now);
  if (cardCandidates.length === 0) return [];

  const [config, leads, instagramAccount, sentTodayCount] = await Promise.all([
    prisma.hotLeadConfig.findUnique({ where: { clinicId } }),
    prisma.lead.findMany({
      where: { id: { in: cardCandidates.map((c) => c.leadId) } },
      select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true },
    }),
    prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } }),
    prisma.hotLeadCardSlot.count({
      where: { sentAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 1) }, conversation: { clinicId } },
    }),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const dailyLimit = config?.dailyLimit ?? 5;

  // Atribui/reaproveita o slot de rotação de cada card — UM pool de
  // mensagens e UM contador por PASSO (pedido explícito: cada passo roda
  // sua própria rotação entre leads diferentes).
  const counters = [1, 2, 3].map((step) => stepCounterFromConfig(config, step));
  const newlyAssigned: { conversationId: string; step: number; slot: number; category: HotLeadSignalCategory; sequenceAnchorAt: Date }[] = [];
  const slotByCandidate = new Map<string, number>();
  for (const c of cardCandidates) {
    const key = `${c.conversationId}:${c.step}`;
    const existing = existingStepsByConvId.get(c.conversationId)?.find((s) => s.step === c.step);
    if (existing) {
      slotByCandidate.set(key, existing.slot);
      continue;
    }
    const stepIdx = c.step - 1;
    const availableSlots = resolveAvailableReactivationSlots(stepMessagesFromConfig(config, c.step));
    const assigned = assignNextReactivationSlot(availableSlots, counters[stepIdx]!);
    counters[stepIdx] = assigned.nextSequenceCounter;
    slotByCandidate.set(key, assigned.slot);
    newlyAssigned.push({ conversationId: c.conversationId, step: c.step, slot: assigned.slot, category: c.category, sequenceAnchorAt: c.anchorAt });
  }

  if (newlyAssigned.length > 0) {
    await prisma.$transaction(
      newlyAssigned.map((a) =>
        prisma.hotLeadCardSlot.upsert({
          where: { conversationId_step: { conversationId: a.conversationId, step: a.step } },
          create: { conversationId: a.conversationId, step: a.step, slot: a.slot, category: a.category, sequenceAnchorAt: a.sequenceAnchorAt },
          update: {},
        })
      )
    );
  }
  const initialCounters = [1, 2, 3].map((step) => stepCounterFromConfig(config, step));
  if (counters.some((c, i) => c !== initialCounters[i])) {
    await prisma.hotLeadConfig.upsert({
      where: { clinicId },
      create: {
        clinicId,
        dailyLimit,
        step1SequenceCounter: counters[0]!,
        step2SequenceCounter: counters[1]!,
        step3SequenceCounter: counters[2]!,
      },
      update: { step1SequenceCounter: counters[0]!, step2SequenceCounter: counters[1]!, step3SequenceCounter: counters[2]! },
    });
  }

  // Nome ao vivo (Instagram) — uma vez por lead distinto.
  const uniqueLeads = [...leadById.values()];
  const rawNameByLeadId = new Map<string, string | null>();
  if (instagramAccount) {
    await Promise.all(
      uniqueLeads.map(async (lead) => {
        rawNameByLeadId.set(lead.id, await ensureLeadFirstNameFromInstagram(lead, instagramAccount.accessTokenEnc));
      })
    );
  } else {
    for (const lead of uniqueLeads) rawNameByLeadId.set(lead.id, lead.name);
  }

  const dailyLimitReached = isHotLeadDailyLimitReached(sentTodayCount, dailyLimit);

  return cardCandidates.map((c) => {
    const lead = leadById.get(c.leadId);
    const slot = slotByCandidate.get(`${c.conversationId}:${c.step}`)!;
    const messages = stepMessagesFromConfig(config, c.step);
    const defaults = DEFAULT_HOT_LEAD_STEP_MESSAGES[c.step - 1]!;
    const rawTemplate = resolveReactivationMessageText(slot, messages, defaults);
    const message = renderMessageTemplate(rawTemplate, {
      primeiro_nome: normalizeFirstNameForTemplate(rawNameByLeadId.get(c.leadId) ?? null),
      data_horario: null, // Quente nunca tem agendamento (é a própria definição do card)
    });
    const igUsername = lead?.igUsername ?? null;
    const existingStep = existingStepsByConvId.get(c.conversationId)?.find((s) => s.step === c.step);

    return {
      conversationId: c.conversationId,
      leadId: c.leadId,
      step: c.step,
      slot,
      category: c.category,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      instagramDmLink: resolveInstagramDmLink(igUsername),
      instagramProfileLink: igUsername ? buildInstagramProfileLink(igUsername) : null,
      reason: buildHotLeadCardReason(c.category, c.anchorAt, now, c.step),
      sentAt: existingStep?.sentAt ?? null,
      dailyLimitReached,
    };
  });
}

// Clique no botão Instagram (copiar + abrir) — igual à Reativação por
// Instagram: nunca manda de verdade pelo VEXO, só marca o card como
// enviado no Painel (comportamento mantido, pedido explícito: "o clique
// mantém o comportamento atual"). Reconfere o limite diário aqui (defesa
// em profundidade contra a corrida "entre o card aparecer e o clique") —
// um card que já passou o limite no momento do clique não é marcado.
// Toggle (não só "marca") pelo mesmo motivo de sempre — ver
// toggleReactivationCardSent, reactivation.ts; o "✓" de desfazer da UI pro
// Quente já não disparava nenhuma chamada de servidor antes desta reescrita
// (ReactivationRail.tsx/handleToggleSent só cobre REACTIVATION/NO_SHOW),
// comportamento inalterado por este ajuste.
export type ToggleHotLeadCardSentResult =
  | { ok: true; clinicId: string; sentAt: Date | null }
  | { ok: false; reason: "not_found" | "daily_limit_reached"; clinicId?: string };

export async function toggleHotLeadCardSent(conversationId: string, step: number, now: Date = new Date()): Promise<ToggleHotLeadCardSentResult> {
  const slot = await prisma.hotLeadCardSlot.findUnique({
    where: { conversationId_step: { conversationId, step } },
    include: { conversation: { select: { clinicId: true } } },
  });
  if (!slot) return { ok: false, reason: "not_found" };

  const clinicId = slot.conversation.clinicId;

  if (!slot.sentAt) {
    const config = await prisma.hotLeadConfig.findUnique({ where: { clinicId } });
    const dailyLimit = config?.dailyLimit ?? 5;
    const sentTodayCount = await prisma.hotLeadCardSlot.count({
      where: { sentAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 1) }, conversation: { clinicId } },
    });
    if (isHotLeadDailyLimitReached(sentTodayCount, dailyLimit)) {
      return { ok: false, reason: "daily_limit_reached", clinicId };
    }
  }

  const sentAt = slot.sentAt ? null : now;
  await prisma.hotLeadCardSlot.update({ where: { id: slot.id }, data: { sentAt } });
  return { ok: true, clinicId, sentAt };
}

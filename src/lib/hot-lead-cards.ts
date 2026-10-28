import { prisma } from "@/lib/prisma";
import { startOfDay, addDays } from "@/lib/metrics";
import {
  computeReactivationWindow,
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

// Card "Quente" — item 3 do pedido. Lead com conversa que NUNCA agendou
// (nenhum Appointment, de nenhum status, pro lead inteiro — não só esta
// conversa: um lead que já chegou a agendar alguma vez, mesmo cancelado,
// não é mais "nunca agendou"), parado 3-21 dias, com sinal de interesse
// (ver hot-lead-detection.ts) e que não pediu pra parar.
//
// "Parado" é medido por Conversation.lastLeadMessageAt — igual
// silenceHours (follow-up.ts), mesma convenção já usada no resto do
// sistema — não depende de a conversa já ter virado LOST (esse status
// nunca é setado automaticamente hoje em nenhum lugar do código).
//
// Travas (item 4): responder MUDA lastLeadMessageAt, o que por si só já
// tira a conversa da janela de 3-21 dias no próximo cálculo — nenhum
// mecanismo de "limpar card" é necessário, a elegibilidade é sempre
// recalculada ao vivo (mesmo princípio de toda a Reativação). Agendar
// tira a conversa da lista pela checagem "nunca agendou". Pedir pra parar
// é a ÚNICA das três que precisa de checagem própria (leadAskedToStop) —
// diferente do Faltou, aqui não existe um FollowUpLog fechando sozinho
// numa resposta qualquer.

export const HOT_LEAD_MIN_IDLE_DAYS = 3;
export const HOT_LEAD_MAX_IDLE_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_HOT_LEAD_MESSAGES: readonly string[] = [
  "Oi! Vi que você tinha algumas perguntas — ainda posso te ajudar com isso?",
  "Oi! Ficou alguma dúvida sobre o que você perguntou? Posso te ajudar por aqui.",
  "Oi! Passando pra saber se ainda tem interesse — fico à disposição pra qualquer pergunta.",
  "Oi! Vi sua mensagem por aqui — posso te dar mais detalhes se ainda fizer sentido pra você.",
  "Oi! Ainda posso ajudar com o que você perguntou? É só me chamar.",
];

export function isHotLeadIdleWindowOpen(lastLeadMessageAt: Date | null, now: Date): boolean {
  if (!lastLeadMessageAt) return false;
  const idleDays = (now.getTime() - lastLeadMessageAt.getTime()) / DAY_MS;
  return idleDays >= HOT_LEAD_MIN_IDLE_DAYS && idleDays <= HOT_LEAD_MAX_IDLE_DAYS;
}

export type HotLeadConversationInput = {
  conversationId: string;
  leadId: string;
  everScheduled: boolean;
  status: string;
  lastLeadMessageAt: Date | null;
  leadMessageContents: string[];
};

export type HotLeadEligibility = { category: HotLeadSignalCategory };

// Pura — avalia UMA conversa; quem chama (getHotLeadCards) junta com a
// janela de 5 dias úteis (computeReactivationWindow) depois.
export function evaluateHotLeadEligibility(input: HotLeadConversationInput, now: Date): HotLeadEligibility | null {
  if (input.everScheduled) return null;
  if (input.status === "SCHEDULED" || input.status === "NEEDS_HUMAN") return null;
  if (!isHotLeadIdleWindowOpen(input.lastLeadMessageAt, now)) return null;
  if (leadAskedToStop(input.leadMessageContents)) return null;

  const category = detectHotLeadSignal(input.leadMessageContents);
  if (!category) return null;

  return { category };
}

export type HotLeadCardCandidate = {
  conversationId: string;
  leadId: string;
  category: HotLeadSignalCategory;
  lastLeadMessageAt: Date;
  window: ReactivationWindow;
};

// Pura — aplica a janela de 5 dias úteis (ancorada em
// lastLeadMessageAt + HOT_LEAD_MIN_IDLE_DAYS, reaproveitando
// computeReactivationWindow/isWithinReactivationWindow) sobre
// conversas já elegíveis. Ordenada por quem entrou na janela primeiro e,
// dentro do mesmo instante, "horario" antes de "preco_endereco" (pedido
// explícito de ordenação).
export function buildHotLeadCardCandidates(
  conversations: HotLeadConversationInput[],
  now: Date
): HotLeadCardCandidate[] {
  const result: HotLeadCardCandidate[] = [];
  for (const conv of conversations) {
    const eligibility = evaluateHotLeadEligibility(conv, now);
    if (!eligibility || !conv.lastLeadMessageAt) continue;

    const window = computeReactivationWindow(conv.lastLeadMessageAt, HOT_LEAD_MIN_IDLE_DAYS);
    if (!isWithinReactivationWindow(window, now)) continue;

    result.push({ conversationId: conv.conversationId, leadId: conv.leadId, category: eligibility.category, lastLeadMessageAt: conv.lastLeadMessageAt, window });
  }
  return result.sort(
    (a, b) =>
      a.window.start.getTime() - b.window.start.getTime() ||
      (a.category === b.category ? 0 : a.category === "horario" ? -1 : 1) ||
      a.conversationId.localeCompare(b.conversationId)
  );
}

export function buildHotLeadCardReason(category: HotLeadSignalCategory, lastLeadMessageAt: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - lastLeadMessageAt.getTime()) / DAY_MS));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  const label = category === "horario" ? "Perguntou sobre horário" : "Perguntou preço/endereço";
  return `${label} · há ${dayLabel}`;
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

export async function getHotLeadCards(clinicId: string, now: Date = new Date()): Promise<HotLeadCard[]> {
  const idleFloor = new Date(now.getTime() - HOT_LEAD_MAX_IDLE_DAYS * DAY_MS);
  const idleCeiling = new Date(now.getTime() - HOT_LEAD_MIN_IDLE_DAYS * DAY_MS);

  const conversations = await prisma.conversation.findMany({
    where: {
      clinicId,
      status: { notIn: ["SCHEDULED", "NEEDS_HUMAN"] },
      lastLeadMessageAt: { gte: idleFloor, lte: idleCeiling },
      lead: { appointments: { none: {} } },
    },
    select: {
      id: true,
      leadId: true,
      status: true,
      lastLeadMessageAt: true,
      messages: { where: { direction: "INBOUND" }, select: { content: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const inputs: HotLeadConversationInput[] = conversations.map((c) => ({
    conversationId: c.id,
    leadId: c.leadId,
    everScheduled: false, // já filtrado na query (lead.appointments: none)
    status: c.status,
    lastLeadMessageAt: c.lastLeadMessageAt,
    leadMessageContents: c.messages.map((m) => m.content),
  }));

  const cardCandidates = buildHotLeadCardCandidates(inputs, now);
  if (cardCandidates.length === 0) return [];

  const [config, leads, instagramAccount, existingSlotRows, sentTodayCount] = await Promise.all([
    prisma.hotLeadConfig.findUnique({ where: { clinicId } }),
    prisma.lead.findMany({
      where: { id: { in: cardCandidates.map((c) => c.leadId) } },
      select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true },
    }),
    prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } }),
    prisma.hotLeadCardSlot.findMany({ where: { conversationId: { in: cardCandidates.map((c) => c.conversationId) } } }),
    prisma.hotLeadCardSlot.count({
      where: { sentAt: { gte: startOfDay(now), lt: addDays(startOfDay(now), 1) }, conversation: { clinicId } },
    }),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const slotByConversationId = new Map(existingSlotRows.map((s) => [s.conversationId, s]));
  const dailyLimit = config?.dailyLimit ?? 5;
  const messages = [config?.message1, config?.message2, config?.message3, config?.message4, config?.message5];
  const availableSlots = resolveAvailableReactivationSlots(messages);

  // Atribui/reaproveita o slot de rotação de cada card — mesmo padrão de
  // assignReactivationCardSlots (reactivation.ts), só que sem precisar de
  // uma função genérica própria: cada conversa só pode ter UM
  // HotLeadCardSlot (chave única conversationId), nunca mais de um card
  // "em aberto" simultâneo pra reatribuir.
  let sequenceCounter = config?.sequenceCounter ?? 0;
  const newlyAssigned: { conversationId: string; slot: number; category: HotLeadSignalCategory }[] = [];
  const slotByConvId = new Map<string, number>();
  for (const c of cardCandidates) {
    const existing = slotByConversationId.get(c.conversationId);
    if (existing) {
      slotByConvId.set(c.conversationId, existing.slot);
      continue;
    }
    const assigned = assignNextReactivationSlot(availableSlots, sequenceCounter);
    sequenceCounter = assigned.nextSequenceCounter;
    slotByConvId.set(c.conversationId, assigned.slot);
    newlyAssigned.push({ conversationId: c.conversationId, slot: assigned.slot, category: c.category });
  }

  if (newlyAssigned.length > 0) {
    await prisma.$transaction(
      newlyAssigned.map((a) =>
        prisma.hotLeadCardSlot.upsert({
          where: { conversationId: a.conversationId },
          create: { conversationId: a.conversationId, slot: a.slot, category: a.category },
          update: {},
        })
      )
    );
  }
  if (sequenceCounter !== (config?.sequenceCounter ?? 0)) {
    await prisma.hotLeadConfig.upsert({
      where: { clinicId },
      create: { clinicId, dailyLimit, sequenceCounter },
      update: { sequenceCounter },
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
    const slot = slotByConvId.get(c.conversationId)!;
    const rawTemplate = resolveReactivationMessageText(slot, messages, DEFAULT_HOT_LEAD_MESSAGES);
    const message = renderMessageTemplate(rawTemplate, {
      primeiro_nome: normalizeFirstNameForTemplate(rawNameByLeadId.get(c.leadId) ?? null),
      data_horario: null, // Quente nunca tem agendamento (é a própria definição do card)
    });
    const igUsername = lead?.igUsername ?? null;
    const existingSlot = slotByConversationId.get(c.conversationId);

    return {
      conversationId: c.conversationId,
      leadId: c.leadId,
      slot,
      category: c.category,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      instagramDmLink: resolveInstagramDmLink(igUsername),
      instagramProfileLink: igUsername ? buildInstagramProfileLink(igUsername) : null,
      reason: buildHotLeadCardReason(c.category, c.lastLeadMessageAt, now),
      sentAt: existingSlot?.sentAt ?? null,
      dailyLimitReached,
    };
  });
}

// Clique no botão Instagram (copiar + abrir) — igual à Reativação por
// Instagram: nunca manda de verdade pelo VEXO, só marca o card como
// enviado no Painel. Reconfere o limite diário aqui (defesa em
// profundidade contra a corrida "entre o card aparecer e o clique",
// pedido explícito) — um card que já passou o limite no momento do clique
// não é marcado.
export type ToggleHotLeadCardSentResult =
  | { ok: true; clinicId: string; sentAt: Date | null }
  | { ok: false; reason: "not_found" | "daily_limit_reached"; clinicId?: string };

export async function toggleHotLeadCardSent(conversationId: string, now: Date = new Date()): Promise<ToggleHotLeadCardSentResult> {
  const slot = await prisma.hotLeadCardSlot.findUnique({
    where: { conversationId },
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

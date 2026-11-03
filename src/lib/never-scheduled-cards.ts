import { prisma } from "@/lib/prisma";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  resolveInstagramDmLink,
  buildInstagramProfileLink,
  type ReactivationWindow,
} from "@/lib/reactivation";
import { ensureLeadFirstNameFromInstagram } from "@/lib/instagram";
import { renderMessageTemplate, normalizeFirstNameForTemplate } from "@/lib/message-template";
import { detectHotLeadSignal } from "@/lib/hot-lead-detection";

// Card "Não agendou" — lead que NUNCA agendou (nenhum Appointment, de
// nenhum status, pro lead inteiro — mesmo critério "nunca agendou" já
// usado pelo Quente, ver hot-lead-cards.ts) e sem nenhuma atividade na
// conversa (mensagem de QUALQUER lado — Conversation.lastMessageAt, não
// só lastLeadMessageAt) há 30 dias (D30) ou 60 dias (D60). Mesmo estilo
// do card "Faltou" (pedido explícito): mesma função de janela
// (computeReactivationWindow — 5 dias ÚTEIS a partir do dia seguinte ao
// marco, ver reactivation.ts), mesmo formato de 2 passos fixos com slot
// lazy (só cria linha no banco no primeiro clique, ver
// toggleNeverScheduledCardSent abaixo — igual a toggleNoShowCardSent),
// mesmo texto de settings GLOBAL (singleton, vazio usa o padrão).
//
// Exclusões (pedido explícito: "já tenham qualquer agendamento" e
// "marcados como perdidos"):
// - QUALQUER Appointment do lead, de qualquer status (mesmo cancelado) —
//   `lead.appointments: { none: {} }`, idêntico ao "nunca agendou" do
//   Quente.
// - Conversation.status === "LOST" ("marcados como perdidos" — é
//   exatamente o que esse status significa no schema, "não retomou após
//   follow-up").
//
// Exclusão ADICIONAL (critério meu, não pedido explicitamente — reportado
// no resumo da implementação): lead com sinal de interesse detectado em
// QUALQUER mensagem dele (detectHotLeadSignal, hot-lead-detection.ts —
// mesma detecção por palavra-chave do card "Quente") fica de fora daqui.
// Motivo: as janelas de D30/D60 deste card colidem em cheio com o 3º passo
// do Quente (30 dias desde a última mensagem do lead, +3 dias de janela —
// ver HOT_LEAD_STEP_DAYS, hot-lead-cards.ts) — sem esta exclusão, o MESMO
// lead apareceria duas vezes na faixa, em "Quente" e em "Não agendou", ao
// mesmo tempo, pro mesmo intervalo de dias. "Não agendou" é pensado pro
// lead que nunca deu nenhum sinal (silêncio puro); quem já perguntou
// preço/endereço/horário continua coberto só pelo Quente.
export const NEVER_SCHEDULED_CARD_STEPS = [
  { step: 1, offsetDays: 30 },
  { step: 2, offsetDays: 60 },
] as const;

export const DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES: readonly [string, string] = [
  "Oi, {{primeiro_nome}}. Passando por aqui rapidinho para te desejar uma excelente semana.",
  "Oi, {{primeiro_nome}}. Passando para desejar uma ótima semana. Quando fizer sentido, estamos por aqui.",
];

export type NeverScheduledCandidate = {
  conversationId: string;
  leadId: string;
  lastMessageAt: Date;
};

export type NeverScheduledCardCandidate = NeverScheduledCandidate & { step: number; window: ReactivationWindow };

// Pura — mesma forma de buildNoShowCardCandidates (no-show-cards.ts), só
// que ancorada em lastMessageAt (qualquer lado) em vez de
// noShowTriggeredAt, com offsets 30/60 em vez de 3/10.
export function buildNeverScheduledCardCandidates(candidates: NeverScheduledCandidate[], now: Date): NeverScheduledCardCandidate[] {
  const result: NeverScheduledCardCandidate[] = [];
  for (const c of candidates) {
    for (const { step, offsetDays } of NEVER_SCHEDULED_CARD_STEPS) {
      const window = computeReactivationWindow(c.lastMessageAt, offsetDays);
      if (isWithinReactivationWindow(window, now)) {
        result.push({ ...c, step, window });
      }
    }
  }
  return result.sort(
    (a, b) => a.window.start.getTime() - b.window.start.getTime() || a.conversationId.localeCompare(b.conversationId) || a.step - b.step
  );
}

export function resolveNeverScheduledCardMessageTemplate(
  step: number,
  settings: { day30Content?: string | null; day60Content?: string | null }
): string {
  const custom = step === 1 ? settings.day30Content : settings.day60Content;
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[step - 1]!;
}

// "Sem agendamento há 35 dias · mensagem 1 de 2" — mesmo formato de
// buildNoShowCardReason (no-show-cards.ts), dias contados a partir da
// última mensagem da conversa (qualquer lado).
export function buildNeverScheduledCardReason(lastMessageAt: Date, now: Date, step: number): string {
  const days = Math.max(0, Math.floor((now.getTime() - lastMessageAt.getTime()) / (24 * 60 * 60 * 1000)));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  return `Sem agendamento há ${dayLabel} · mensagem ${step} de 2`;
}

export type NeverScheduledCard = {
  conversationId: string;
  step: number;
  leadId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  instagramDmLink: string | null;
  instagramProfileLink: string | null;
  reason: string;
  lastMessageAt: Date;
  sentAt: Date | null;
};

export async function getNeverScheduledCards(clinicId: string, now: Date = new Date()): Promise<NeverScheduledCard[]> {
  const conversations = await prisma.conversation.findMany({
    where: {
      clinicId,
      status: { not: "LOST" },
      lastMessageAt: { not: null },
      lead: { appointments: { none: {} } },
    },
    select: {
      id: true,
      leadId: true,
      lastMessageAt: true,
      messages: { where: { direction: "INBOUND" }, select: { content: true } },
      neverScheduledCardSlots: { select: { step: true, sentAt: true } },
    },
  });

  // Sinal de interesse (ver comentário grande no topo do arquivo) — essas
  // conversas ficam só com o Quente, nunca duplicadas aqui.
  const eligible = conversations.filter((c) => !detectHotLeadSignal(c.messages.map((m) => m.content)));

  const candidates: NeverScheduledCandidate[] = eligible.map((c) => ({
    conversationId: c.id,
    leadId: c.leadId,
    lastMessageAt: c.lastMessageAt!,
  }));

  const cardCandidates = buildNeverScheduledCardCandidates(candidates, now);
  if (cardCandidates.length === 0) return [];

  const [settings, leads, instagramAccount] = await Promise.all([
    prisma.neverScheduledCardSettings.findUnique({ where: { id: "singleton" } }),
    prisma.lead.findMany({
      where: { id: { in: cardCandidates.map((c) => c.leadId) } },
      select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true },
    }),
    prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } }),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sentAtByKey = new Map(eligible.flatMap((c) => c.neverScheduledCardSlots.map((s) => [`${c.id}:${s.step}`, s.sentAt] as const)));

  // Nome ao vivo (Instagram) — uma vez por lead distinto, mesmo padrão de
  // getReactivationCards/getNoShowCards.
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

  return cardCandidates.map((c) => {
    const lead = leadById.get(c.leadId);
    const rawTemplate = resolveNeverScheduledCardMessageTemplate(c.step, settings ?? {});
    const message = renderMessageTemplate(rawTemplate, {
      primeiro_nome: normalizeFirstNameForTemplate(rawNameByLeadId.get(c.leadId) ?? null),
      data_horario: null, // Não agendou nunca tem agendamento (é a própria definição do card)
    });
    const igUsername = lead?.igUsername ?? null;

    return {
      conversationId: c.conversationId,
      step: c.step,
      leadId: c.leadId,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      instagramDmLink: resolveInstagramDmLink(igUsername, message),
      instagramProfileLink: igUsername ? buildInstagramProfileLink(igUsername) : null,
      reason: buildNeverScheduledCardReason(c.lastMessageAt, now, c.step),
      lastMessageAt: c.lastMessageAt,
      sentAt: sentAtByKey.get(`${c.conversationId}:${c.step}`) ?? null,
    };
  });
}

// Clique no botão de ação (copiar + abrir o Instagram) — só marca o card
// como enviado no Painel, nunca manda de verdade pelo VEXO (canal sempre
// Instagram manual, pedido explícito: "nunca WhatsApp... nenhum envio
// automático"). Toggle (não só "marca") — mesmo motivo de sempre, ver
// toggleReactivationCardSent/toggleNoShowCardSent. Sem limite diário
// (não pedido) — ao contrário do Quente, que tem o seu próprio por ser
// uma cadência de até 3 passos; aqui são só 2 passos bem espaçados (30/60
// dias), sem o mesmo risco de rajada.
export async function toggleNeverScheduledCardSent(
  conversationId: string,
  step: number,
  now: Date = new Date()
): Promise<{ clinicId: string; sentAt: Date | null } | null> {
  const existing = await prisma.neverScheduledCardSlot.findUnique({
    where: { conversationId_step: { conversationId, step } },
    include: { conversation: { select: { clinicId: true } } },
  });

  if (existing) {
    const sentAt = existing.sentAt ? null : now;
    await prisma.neverScheduledCardSlot.update({ where: { id: existing.id }, data: { sentAt } });
    return { clinicId: existing.conversation.clinicId, sentAt };
  }

  // Primeiro clique deste card — ainda sem linha (lazy, igual
  // toggleNoShowCardSent: não há rotação de texto pra fixar, step já é
  // fixo, então não precisa upsert na hora de listar).
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { clinicId: true } });
  if (!conversation) return null;

  await prisma.neverScheduledCardSlot.create({ data: { conversationId, step, sentAt: now } });
  return { clinicId: conversation.clinicId, sentAt: now };
}

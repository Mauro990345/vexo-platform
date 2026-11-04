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
// só lastLeadMessageAt) há 2 (D2), 4 (D4), 10 (D10), 30 (D30) ou 60 dias
// (D60) — D2/D4 são da rodada atual. Mesmo estilo do card "Faltou" (pedido
// explícito): mesma função de janela (computeReactivationWindow — 5 dias
// ÚTEIS a partir do dia seguinte ao marco, ver reactivation.ts), mesmo
// formato de passos fixos com slot lazy (só cria linha no banco no
// primeiro clique, ver toggleNeverScheduledCardSent abaixo — igual a
// toggleNoShowCardSent), mesmo texto de settings GLOBAL (singleton, vazio
// usa o padrão). Todos os 5 passos são só Instagram manual (copiar+abrir)
// — nunca WhatsApp, pedido explícito desta rodada (quem não agendou não
// tem telefone cadastrado): este card nunca teve canal WhatsApp, nada
// mudou aqui.
//
// D10 (rodada anterior) entrou como step=3; D2/D4 (rodada atual) entram
// como step=4/5 — NUNCA renumera D30/D60/D10 já existentes, cujo `step`
// significaria outra coisa se renumerado (NeverScheduledCardSlot já
// gravado ficaria com o dia errado). A posição de EXIBIÇÃO ("mensagem X
// de Y") é cronológica (D2=1, D4=2, D10=3, D30=4, D60=5), independente do
// número de `step` gravado — ver stepDisplayPosition abaixo.
//
// Exclusões (pedido explícito: "já tenham qualquer agendamento" e
// "marcados como perdidos" — item 2 da rodada anterior pedia
// explicitamente "mantenha as exclusões atuais", mantidas aqui):
// - QUALQUER Appointment do lead, de qualquer status (mesmo cancelado) —
//   `lead.appointments: { none: {} } }`, idêntico ao "nunca agendou" do
//   Quente. Também cobre o item 3 desta rodada quanto aos LEMBRETES
//   AUTOMÁTICOS de véspera (ReminderConfig/ReminderLog, por agendamento) —
//   são mutuamente exclusivos com este card por definição: lembrete só
//   existe pra quem TEM agendamento, "Não agendou" só pra quem NÃO tem
//   nenhum. Nenhuma sobreposição possível, não precisou de ajuste.
// - Conversation.status === "LOST" ("marcados como perdidos" — é
//   exatamente o que esse status significa no schema, "não retomou após
//   follow-up").
//
// Exclusão ADICIONAL #1 (critério meu, rodada anterior — reportado no
// resumo da implementação): lead com sinal de interesse detectado em
// QUALQUER mensagem dele (detectHotLeadSignal, hot-lead-detection.ts —
// mesma detecção por palavra-chave do card "Quente") fica de fora daqui.
// Motivo: as janelas deste card colidiam com o 3º passo do Quente (15
// dias desde a última mensagem do lead, +3 dias de janela — ver
// HOT_LEAD_STEP_DAYS, hot-lead-cards.ts) — sem esta exclusão, o MESMO
// lead apareceria duas vezes na faixa, em "Quente" e em "Não agendou", ao
// mesmo tempo. "Não agendou" é pro lead que nunca deu nenhum sinal
// (silêncio puro); quem já perguntou preço/endereço/horário continua
// coberto só pelo Quente. ESTA MESMA exclusão também cobre D2/D4 (rodada
// atual) quanto ao Quente — ver verificação do item 3 abaixo: como o
// Quente exige um sinal de interesse pra sequer abrir uma sequência
// (chooseHotLeadStep, hot-lead-cards.ts) e esta exclusão já tira do "Não
// agendou" TODO lead com qualquer sinal, independente do dia, os dois
// cards continuam mutuamente exclusivos por conversa — D2/D4 não mudam
// essa conclusão, nenhum ajuste extra foi necessário na cadência do
// Quente (que fica intocada, como pedido).
//
// Exclusão ADICIONAL #2 (item 3 desta rodada — sobreposição encontrada
// com a sequência automática "Parou de responder"/SILENCE,
// follow-up.ts): D2/D4 caem bem na janela em que essa sequência
// automática (gatilho em ~24h de silêncio por padrão, configurável em
// FollowUpSettings.silenceHours) pode estar NO MEIO de disparar suas
// próprias mensagens — sem tratar isso, a secretária veria o card manual
// "Não agendou" pedindo pra ela mandar mensagem no MESMO momento em que a
// IA já está mandando uma pela sequência automática, duplicando o
// contato. Resolvido excluindo daqui qualquer conversa com um
// FollowUpLog{trigger:"SILENCE", respondedAt:null} que AINDA TENHA passo
// pendente (lastStepIndex+1 < nº de FollowUpStep configurados pra
// SILENCE) — ver hasPendingSilenceSteps/getNeverScheduledCards abaixo.
// Assim que a sequência automática esgota os passos configurados (ou se
// nunca chegou a disparar), a conversa volta a ficar elegível normalmente
// — sem mexer em FollowUpLog.respondedAt nem em nenhuma regra da própria
// sequência SILENCE, só lendo o estado dela. D10/D30/D60 raramente
// coincidem com isso na prática (a sequência SILENCE já teria esgotado os
// passos muito antes), mas a mesma exclusão vale pros 5 passos por
// uniformidade — mais simples que tratar cada um diferente.
//
// Elegibilidade/âncora (ajuste de rodada anterior, mantido): o card só
// pode sumir quando o lead agendar (sai do filtro `lead.appointments:
// none`) ou for marcado como perdido (status LOST) — uma resposta sem
// agendar NÃO deve sumir o card nem reiniciar os prazos. Como
// Conversation.lastMessageAt é atualizado em TODA mensagem nova (de
// qualquer lado), usá-lo direto faria exatamente isso: reiniciar a
// contagem a cada resposta. Resolvido com uma ÂNCORA CONGELADA
// (Conversation.neverScheduledAnchorAt, schema.prisma): antes da conversa
// entrar na primeira janela (agora D2, antes era D10), a âncora acompanha
// lastMessageAt ao vivo (nada persistido ainda — a conversa pode estar só
// indo e voltando normalmente, sem nenhum card mostrado, OU com a
// sequência SILENCE ainda ativa, ver exclusão #2 acima); no momento em
// que ela entra na janela do passo mais precoce por primeira vez, a
// âncora é congelada NESSE valor pra sempre (ver getNeverScheduledCards
// abaixo) — uma resposta do lead depois disso, sem agendar, não volta a
// mexer no prazo.
export const NEVER_SCHEDULED_CARD_STEPS = [
  { step: 1, offsetDays: 30 },
  { step: 2, offsetDays: 60 },
  { step: 3, offsetDays: 10 },
  { step: 4, offsetDays: 2 },
  { step: 5, offsetDays: 4 },
] as const;

const EARLIEST_STEP_OFFSET_DAYS = Math.min(...NEVER_SCHEDULED_CARD_STEPS.map((s) => s.offsetDays));

// Posição de exibição cronológica (D10=1, D30=2, D60=3), independente do
// `step` gravado no banco — ver comentário grande no topo do arquivo.
const STEP_DISPLAY_POSITION = new Map<number, number>(
  [...NEVER_SCHEDULED_CARD_STEPS].sort((a, b) => a.offsetDays - b.offsetDays).map(({ step }, i) => [step, i + 1])
);

export function stepDisplayPosition(step: number): number {
  return STEP_DISPLAY_POSITION.get(step) ?? step;
}

// DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES é indexado por STEP (índice
// step-1), não por posição de exibição — [0]=step1 (D30), [1]=step2
// (D60), [2]=step3 (D10), [3]=step4 (D2, novo), [4]=step5 (D4, novo).
// D2/D4: texto padrão curto e neutro (pedido explícito, "até eu
// preencher"), mesmo padrão dos outros — editável em Follow-up → "Cards
// do Painel".
export const DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES: readonly [string, string, string, string, string] = [
  "Oi, {{primeiro_nome}}. Passando por aqui rapidinho para te desejar uma excelente semana.",
  "Oi, {{primeiro_nome}}. Passando para desejar uma ótima semana. Quando fizer sentido, estamos por aqui.",
  "Oi, {{primeiro_nome}}. Passando por aqui para saber se ficou alguma dúvida sobre a avaliação. Estou à disposição.",
  "Oi, {{primeiro_nome}}. Passando para saber se posso ajudar com alguma coisa.",
  "Oi, {{primeiro_nome}}. Ainda por aqui, caso queira saber mais alguma coisa.",
];

export type NeverScheduledExistingStep = { step: number; sentAt: Date | null };

export type NeverScheduledCandidate = {
  conversationId: string;
  leadId: string;
  // Âncora congelada (ou lastMessageAt ao vivo, antes da primeira
  // janela) — ver comentário grande no topo do arquivo.
  anchorAt: Date;
  // Passos já com slot gravado (NeverScheduledCardSlot) pra esta conversa
  // — usado por chooseNeverScheduledStep (abaixo) pra escolher qual passo
  // mostrar quando mais de uma janela está aberta ao mesmo tempo.
  existingSteps: NeverScheduledExistingStep[];
};

export type NeverScheduledCardCandidate = Omit<NeverScheduledCandidate, "existingSteps"> & { step: number; window: ReactivationWindow };

const STEPS_BY_OFFSET_ASC = [...NEVER_SCHEDULED_CARD_STEPS].sort((a, b) => a.offsetDays - b.offsetDays);

// Escolhe QUAL passo mostrar agora pra uma conversa, igual em espírito a
// chooseHotLeadStep (hot-lead-cards.ts) — necessário porque D2 e D4
// (rodada atual) ficam só 2 dias um do outro: a janela de 5 dias ÚTEIS de
// cada um (computeReactivationWindow) é mais larga que essa distância, e
// as duas SE SOBREPÕEM por alguns dias (ex.: D2 abre dia 2 e só fecha
// dia~8; D4 abre dia 4, já dentro da janela do D2) — sem escolher, as
// duas apareceriam como cards SEPARADOS pro mesmo lead ao mesmo tempo
// (duplicado dentro do próprio "Não agendou", achado ao implementar este
// ajuste). D10/D30/D60 nunca se sobrepõem entre si (dezenas de dias de
// distância, bem mais que a janela de ~1 semana) — pra eles, esta função
// sempre devolve exatamente o que o código antigo já devolvia, sem mudar
// nada do comportamento existente.
//
// Prioridade: (1) o passo cronologicamente mais precoce com janela aberta
// e AINDA NÃO marcado enviado; (2) se nenhum pendente estiver aberto, o
// passo mais precoce com janela aberta JÁ marcado enviado — mantém o
// "✓ enviado" visível até a janela dele fechar, igual ao comportamento de
// sempre (sortReactivationCardsForDisplay, reactivation.ts, continua
// cuidando de ordenar enviado-no-fim na lista final).
export function chooseNeverScheduledStep(
  anchorAt: Date,
  existingSteps: NeverScheduledExistingStep[],
  now: Date
): { step: number; window: ReactivationWindow } | null {
  const sentSteps = new Set(existingSteps.filter((s) => s.sentAt).map((s) => s.step));

  for (const { step, offsetDays } of STEPS_BY_OFFSET_ASC) {
    if (sentSteps.has(step)) continue;
    const window = computeReactivationWindow(anchorAt, offsetDays);
    if (isWithinReactivationWindow(window, now)) return { step, window };
  }
  for (const { step, offsetDays } of STEPS_BY_OFFSET_ASC) {
    if (!sentSteps.has(step)) continue;
    const window = computeReactivationWindow(anchorAt, offsetDays);
    if (isWithinReactivationWindow(window, now)) return { step, window };
  }
  return null;
}

// Pura — aplica chooseNeverScheduledStep a cada candidato já pré-filtrado
// (ver getNeverScheduledCards) e ordena pela janela. No máximo UM
// resultado por conversationId agora (ver comentário grande acima).
export function buildNeverScheduledCardCandidates(candidates: NeverScheduledCandidate[], now: Date): NeverScheduledCardCandidate[] {
  const result: NeverScheduledCardCandidate[] = [];
  for (const c of candidates) {
    const choice = chooseNeverScheduledStep(c.anchorAt, c.existingSteps, now);
    if (!choice) continue;
    result.push({ conversationId: c.conversationId, leadId: c.leadId, anchorAt: c.anchorAt, step: choice.step, window: choice.window });
  }
  return result.sort((a, b) => a.window.start.getTime() - b.window.start.getTime() || a.conversationId.localeCompare(b.conversationId));
}

export function resolveNeverScheduledCardMessageTemplate(
  step: number,
  settings: {
    day30Content?: string | null;
    day60Content?: string | null;
    day10Content?: string | null;
    day2Content?: string | null;
    day4Content?: string | null;
  }
): string {
  const custom =
    step === 1
      ? settings.day30Content
      : step === 2
        ? settings.day60Content
        : step === 3
          ? settings.day10Content
          : step === 4
            ? settings.day2Content
            : settings.day4Content;
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_NEVER_SCHEDULED_CARD_MESSAGES[step - 1]!;
}

// "Sem agendamento há 35 dias · mensagem 2 de 3" (posição de EXIBIÇÃO
// cronológica, não o `step` gravado — ver stepDisplayPosition/comentário
// grande no topo do arquivo) — mesmo formato de buildNoShowCardReason
// (no-show-cards.ts), dias contados a partir da âncora (congelada, ou
// lastMessageAt ao vivo antes da primeira janela).
export function buildNeverScheduledCardReason(anchorAt: Date, now: Date, step: number): string {
  const days = Math.max(0, Math.floor((now.getTime() - anchorAt.getTime()) / (24 * 60 * 60 * 1000)));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  return `Sem agendamento há ${dayLabel} · mensagem ${stepDisplayPosition(step)} de ${NEVER_SCHEDULED_CARD_STEPS.length}`;
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
  anchorAt: Date;
  sentAt: Date | null;
};

// Exclusão ADICIONAL #2 (item 3, rodada atual) — ver comentário grande no
// topo do arquivo. `totalSilenceSteps` é o nº de FollowUpStep configurados
// pra SILENCE (global, /crm/follow-up); `openSilenceLogs` traz o
// lastStepIndex de qualquer FollowUpLog{trigger:"SILENCE",
// respondedAt:null} desta conversa (no máximo um, ver comentário em
// processSilentConversations/follow-up.ts — a sequência SILENCE roda uma
// única vez por conversa). Pura — fácil de testar sem mock de Prisma.
export function hasPendingSilenceSteps(openSilenceLogs: { lastStepIndex: number | null }[], totalSilenceSteps: number): boolean {
  return openSilenceLogs.some((log) => (log.lastStepIndex ?? -1) + 1 < totalSilenceSteps);
}

export async function getNeverScheduledCards(clinicId: string, now: Date = new Date()): Promise<NeverScheduledCard[]> {
  const [conversations, totalSilenceSteps] = await Promise.all([
    prisma.conversation.findMany({
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
        neverScheduledAnchorAt: true,
        messages: { where: { direction: "INBOUND" }, select: { content: true } },
        neverScheduledCardSlots: { select: { step: true, sentAt: true } },
        followUps: { where: { trigger: "SILENCE", respondedAt: null }, select: { lastStepIndex: true } },
      },
    }),
    prisma.followUpStep.count({ where: { trigger: "SILENCE" } }),
  ]);

  // Sinal de interesse (ver comentário grande no topo do arquivo) — essas
  // conversas ficam só com o Quente, nunca duplicadas aqui. Sequência
  // SILENCE ainda com passo pendente — evita duplicar com a mensagem
  // automática que está por vir (exclusão #2, mesmo comentário).
  const eligible = conversations.filter(
    (c) => !detectHotLeadSignal(c.messages.map((m) => m.content)) && !hasPendingSilenceSteps(c.followUps, totalSilenceSteps)
  );

  // Âncora congelada (item 4) — ver comentário grande no topo do arquivo.
  // Antes da primeira janela (D10), acompanha lastMessageAt ao vivo (nada
  // persistido ainda); no momento em que entra nela por primeira vez, é
  // congelada pra sempre em Conversation.neverScheduledAnchorAt.
  const toFreeze: { conversationId: string; anchorAt: Date }[] = [];
  const candidates: NeverScheduledCandidate[] = eligible.map((c) => {
    if (c.neverScheduledAnchorAt) {
      return { conversationId: c.id, leadId: c.leadId, anchorAt: c.neverScheduledAnchorAt, existingSteps: c.neverScheduledCardSlots };
    }

    const liveAnchor = c.lastMessageAt!;
    const earliestWindow = computeReactivationWindow(liveAnchor, EARLIEST_STEP_OFFSET_DAYS);
    if (now.getTime() >= earliestWindow.start.getTime()) {
      toFreeze.push({ conversationId: c.id, anchorAt: liveAnchor });
    }
    return { conversationId: c.id, leadId: c.leadId, anchorAt: liveAnchor, existingSteps: c.neverScheduledCardSlots };
  });

  if (toFreeze.length > 0) {
    await prisma.$transaction(
      toFreeze.map((f) => prisma.conversation.update({ where: { id: f.conversationId }, data: { neverScheduledAnchorAt: f.anchorAt } }))
    );
  }

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
      reason: buildNeverScheduledCardReason(c.anchorAt, now, c.step),
      anchorAt: c.anchorAt,
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
// uma cadência de até 3 passos de dias próximos; aqui os 3 passos (D10/
// D30/D60) ficam bem mais espaçados, sem o mesmo risco de rajada.
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

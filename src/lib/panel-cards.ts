import type { ReactivationCard } from "@/lib/reactivation";
import type { NoShowCard } from "@/lib/no-show-cards";
import type { HotLeadCard } from "@/lib/hot-lead-cards";
import { hotLeadCategoryLabel } from "@/lib/hot-lead-cards";
import type { NeverScheduledCard } from "@/lib/never-scheduled-cards";
import { startOfDay } from "@/lib/metrics";
import { sortReactivationCardsForDisplay } from "@/lib/reactivation";

// Une os QUATRO tipos de card da faixa de Reativação do Painel num único
// formato pra exibição (ver PanelCardBadge.tsx/ReactivationRail.tsx) — a
// geração de cada tipo continua em módulos SEPARADOS (reactivation.ts,
// no-show-cards.ts, hot-lead-cards.ts, never-scheduled-cards.ts), cada um
// com sua própria regra de elegibilidade/janela/trava; este arquivo só
// junta o resultado já pronto de cada um, sem nenhuma lógica de
// elegibilidade própria.
export type PanelCardKind = "HOT_LEAD" | "NO_SHOW" | "REACTIVATION" | "NEVER_SCHEDULED";

export type PanelCardActionKey =
  | { kind: "REACTIVATION"; appointmentId: string; thresholdDays: number }
  | { kind: "NO_SHOW"; appointmentId: string; step: number }
  | { kind: "HOT_LEAD"; conversationId: string; step: number }
  | { kind: "NEVER_SCHEDULED"; conversationId: string; step: number };

export type PanelCard = {
  kind: PanelCardKind;
  cardKey: string;
  leadId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  whatsappLink: string | null;
  instagramDmLink: string | null;
  instagramProfileLink: string | null;
  reason: string;
  // Versão CURTA do motivo — SÓ pro layout celular (ver ReactivationRail.tsx,
  // pedido explícito "quero uma linha de motivo curta"); `reason` acima
  // continua servindo o desktop sem nenhuma mudança. Quente: o rótulo da
  // categoria sozinho (hotLeadCategoryLabel), sem "· há N dias · passo X
  // de Y". Reativação: "N dias após" (sem "o procedimento"). Faltou: o
  // MESMO texto de `reason` — pedido explícito "mantenha o texto curto
  // que já existe, na mesma posição", nada pra encurtar aqui.
  reasonShort: string;
  // Início da janela deste card (ReactivationCard.completionDate ou
  // *.dueDate dos outros três tipos — ver mergePanelCards abaixo) — usado
  // só por groupPanelCardsForDisplay (mais abaixo) pra agrupar "Atrasados"
  // (dueDate antes de hoje) e "Hoje" (dueDate hoje) na faixa "Para fazer
  // hoje" do Painel (ver ClientPanelView.tsx/ReactivationRail.tsx); não
  // influencia elegibilidade nem nenhuma outra regra.
  dueDate: Date;
  sentAt: Date | null;
  actionKey: PanelCardActionKey;
  // Limite diário por clínica atingido (ver *.dailyLimitReached em cada
  // módulo de origem) — Quente tem o seu próprio (cliques de Instagram);
  // Reativação e Faltou compartilham o limite de WhatsApp (ver
  // ReactivationConfig.dailyWhatsappLimit/countTodaysWhatsappSends,
  // reactivation.ts). undefined = sem limite batido, botão normal.
  disabledReason?: string;
};

// "120 dias após o procedimento" (exemplo do pedido, item 1) — único
// campo de exibição que a Reativação em si não produzia antes (card.message/
// card.channel/etc já existiam em ReactivationCard; só faltava o texto do
// MOTIVO em cinza). Usado pro `reason` (desktop, intocado) — ver
// reactivationCardReasonShort abaixo pro `reasonShort` (só celular).
export function reactivationCardReason(thresholdDays: number): string {
  return `${thresholdDays} dias após o procedimento`;
}

// "120 dias após" — motivo CURTO da Reativação, só pro layout celular
// (pedido explícito "não escreva 'após o procedimento'"). Separada de
// reactivationCardReason acima de propósito: o desktop continua
// mostrando o texto completo, sem nenhuma mudança.
export function reactivationCardReasonShort(thresholdDays: number): string {
  return `${thresholdDays} dias após`;
}

// Duas primeiras palavras + "…" quando o nome tem mais que isso (ex. do
// pedido: "Espaçolaser Depilação a Laser" -> "Espaçolaser Depilação…") —
// só pro layout celular da Reativação/Faltou/Quente (ReactivationRail.tsx;
// Agendamentos continua com truncamento por largura via CSS, não mexido).
// Nome com 1 ou 2 palavras volta inalterado (o `truncate` de CSS no
// componente ainda cobre o caso raro de 1-2 palavras compridas demais pra
// largura da linha).
export function truncateNameToTwoWords(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return name;
  return `${words.slice(0, 2).join(" ")}…`;
}

// Pura — recebe os quatro resultados JÁ PRONTOS (cada um vindo da sua
// própria consulta/regra) e devolve a lista única, na ordem final de
// exibição: Quente, Faltou, Reativação, Não agendou — simples
// concatenação nessa ordem (os 3 primeiros já eram assim, pedido
// explícito de antes; "Não agendou" entra por ÚLTIMO, por ser o lead
// menos qualificado dos quatro — nunca mostrou sinal de interesse nem
// chegou a agendar, ao contrário dos outros três), porque cada lista de
// origem já chega ordenada por urgência internamente (ver
// buildHotLeadCardCandidates/buildNoShowCardCandidates/
// buildReactivationCardCandidates/buildNeverScheduledCardCandidates). A
// separação pendente-primeiro/enviado-no-fim continua sendo
// sortReactivationCardsForDisplay (reactivation.ts) — já genérica sobre
// `{ sentAt }`, reaproveitada tal como está, sem duplicar.
export function mergePanelCards(input: {
  hotLeadCards: HotLeadCard[];
  noShowCards: NoShowCard[];
  reactivationCards: ReactivationCard[];
  neverScheduledCards: NeverScheduledCard[];
}): PanelCard[] {
  const hotLead: PanelCard[] = input.hotLeadCards.map((c) => ({
    kind: "HOT_LEAD",
    // Chave inclui o PASSO (ver HotLeadCardSlot, schema.prisma) — a mesma
    // conversa pode gerar um cardKey diferente em momentos diferentes, um
    // por passo da cadência.
    cardKey: `hot:${c.conversationId}:${c.step}`,
    leadId: c.leadId,
    name: c.name,
    igUsername: c.igUsername,
    profilePictureUrl: c.profilePictureUrl,
    message: c.message,
    channel: "INSTAGRAM",
    whatsappLink: null,
    instagramDmLink: c.instagramDmLink,
    instagramProfileLink: c.instagramProfileLink,
    reason: c.reason,
    reasonShort: hotLeadCategoryLabel(c.category),
    dueDate: c.dueDate,
    sentAt: c.sentAt,
    actionKey: { kind: "HOT_LEAD", conversationId: c.conversationId, step: c.step },
    disabledReason: !c.sentAt && c.dailyLimitReached ? "Limite diário atingido" : undefined,
  }));

  const noShow: PanelCard[] = input.noShowCards.map((c) => ({
    kind: "NO_SHOW",
    cardKey: `noshow:${c.appointmentId}:${c.step}`,
    leadId: c.leadId,
    name: c.name,
    igUsername: c.igUsername,
    profilePictureUrl: c.profilePictureUrl,
    message: c.message,
    channel: c.channel,
    whatsappLink: c.whatsappLink,
    instagramDmLink: c.instagramDmLink,
    instagramProfileLink: c.instagramProfileLink,
    reason: c.reason,
    reasonShort: c.reason,
    dueDate: c.dueDate,
    sentAt: c.sentAt,
    actionKey: { kind: "NO_SHOW", appointmentId: c.appointmentId, step: c.step },
    disabledReason: !c.sentAt && c.dailyLimitReached ? "Limite diário atingido" : undefined,
  }));

  const reactivation: PanelCard[] = input.reactivationCards.map((c) => ({
    kind: "REACTIVATION",
    cardKey: `reactivation:${c.appointmentId}:${c.thresholdDays}`,
    leadId: c.leadId,
    name: c.name,
    igUsername: c.igUsername,
    profilePictureUrl: c.profilePictureUrl,
    message: c.message,
    channel: c.channel,
    whatsappLink: c.whatsappLink,
    instagramDmLink: c.instagramDmLink,
    instagramProfileLink: c.instagramProfileLink,
    reason: reactivationCardReason(c.thresholdDays),
    reasonShort: reactivationCardReasonShort(c.thresholdDays),
    dueDate: c.completionDate,
    sentAt: c.sentAt,
    actionKey: { kind: "REACTIVATION", appointmentId: c.appointmentId, thresholdDays: c.thresholdDays },
    disabledReason: !c.sentAt && c.dailyLimitReached ? "Limite diário atingido" : undefined,
  }));

  const neverScheduled: PanelCard[] = input.neverScheduledCards.map((c) => ({
    kind: "NEVER_SCHEDULED",
    cardKey: `never-scheduled:${c.conversationId}:${c.step}`,
    leadId: c.leadId,
    name: c.name,
    igUsername: c.igUsername,
    profilePictureUrl: c.profilePictureUrl,
    message: c.message,
    channel: "INSTAGRAM",
    whatsappLink: null,
    instagramDmLink: c.instagramDmLink,
    instagramProfileLink: c.instagramProfileLink,
    reason: c.reason,
    reasonShort: c.reason,
    dueDate: c.dueDate,
    sentAt: c.sentAt,
    actionKey: { kind: "NEVER_SCHEDULED", conversationId: c.conversationId, step: c.step },
    disabledReason: undefined,
  }));

  return [...hotLead, ...noShow, ...reactivation, ...neverScheduled];
}

// Agrupamento da faixa "Para fazer hoje" do Painel (ver ClientPanelView.tsx/
// ReactivationRail.tsx) — pedido explícito: mostrar TODOS os pendentes
// (sem "ver todos", sem rolagem interna), ordenados por prioridade (mais
// atrasados/antigos primeiro) e agrupados em "Atrasados" (dueDate antes de
// hoje) e "Hoje" (dueDate hoje — nunca no futuro, já que um card só existe
// quando sua janela já está aberta, ver isWithinReactivationWindow). Sort
// ESTÁVEL por dueDate ascendente dentro de cada grupo (mais antigo
// primeiro); cards com o mesmo dueDate mantêm a ordem relativa de origem
// (mergePanelCards já concatena Quente/Faltou/Reativação/Não agendou nessa
// prioridade fixa — o empate aqui preserva essa prioridade como critério
// secundário, sem precisar repeti-la).
//
// Enviados (sentAt preenchido) continuam visíveis pro "✓" de desfazer
// (comportamento de sempre, ver sortReactivationCardsForDisplay) — só saem
// do agrupamento por data (iriam parar num grupo "Atrasados" cada vez mais
// antigo, sem sentido pra algo já resolvido) e ficam numa lista própria, no
// fim, na mesma ordem relativa de sempre.
export type PanelTaskGroups = {
  overdue: PanelCard[];
  today: PanelCard[];
  sent: PanelCard[];
  pendingCount: number;
};

export function groupPanelCardsForDisplay(cards: PanelCard[], now: Date): PanelTaskGroups {
  const todayStart = startOfDay(now);
  const pending = cards.filter((c) => !c.sentAt);
  const sent = sortReactivationCardsForDisplay(cards.filter((c) => c.sentAt));

  const byDueDateAsc = (a: PanelCard, b: PanelCard) => a.dueDate.getTime() - b.dueDate.getTime();
  const overdue = pending.filter((c) => startOfDay(c.dueDate).getTime() < todayStart.getTime()).sort(byDueDateAsc);
  const today = pending.filter((c) => startOfDay(c.dueDate).getTime() >= todayStart.getTime()).sort(byDueDateAsc);

  return { overdue, today, sent, pendingCount: pending.length };
}

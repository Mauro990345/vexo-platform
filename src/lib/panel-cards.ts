import type { ReactivationCard } from "@/lib/reactivation";
import type { NoShowCard } from "@/lib/no-show-cards";
import type { HotLeadCard } from "@/lib/hot-lead-cards";

// Une os três tipos de card da faixa de Reativação do Painel num único
// formato pra exibição (ver PanelCardBadge.tsx/ReactivationRail.tsx) — a
// geração de cada tipo continua em módulos SEPARADOS (reactivation.ts,
// no-show-cards.ts, hot-lead-cards.ts), cada um com sua própria regra de
// elegibilidade/janela/trava; este arquivo só junta o resultado já pronto
// de cada um, sem nenhuma lógica de elegibilidade própria.
export type PanelCardKind = "HOT_LEAD" | "NO_SHOW" | "REACTIVATION";

export type PanelCardActionKey =
  | { kind: "REACTIVATION"; appointmentId: string; thresholdDays: number }
  | { kind: "NO_SHOW"; appointmentId: string; step: number }
  | { kind: "HOT_LEAD"; conversationId: string };

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
  sentAt: Date | null;
  actionKey: PanelCardActionKey;
  // Só o Quente usa isto hoje (limite diário por clínica) — undefined nos
  // outros dois tipos, nunca desabilita o botão deles.
  disabledReason?: string;
};

// "120 dias após o procedimento" (exemplo do pedido, item 1) — único
// campo de exibição que a Reativação em si não produzia antes (card.message/
// card.channel/etc já existiam em ReactivationCard; só faltava o texto do
// MOTIVO em cinza).
export function reactivationCardReason(thresholdDays: number): string {
  return `${thresholdDays} dias após o procedimento`;
}

// Pura — recebe os três resultados JÁ PRONTOS (cada um vindo da sua
// própria consulta/regra) e devolve a lista única, na ordem final de
// exibição: Quente, Faltou, Reativação (pedido explícito) — simples
// concatenação nessa ordem, porque cada lista de origem já chega ordenada
// por urgência internamente (ver buildHotLeadCardCandidates/
// buildNoShowCardCandidates/buildReactivationCardCandidates). A separação
// pendente-primeiro/enviado-no-fim continua sendo
// sortReactivationCardsForDisplay (reactivation.ts) — já genérica sobre
// `{ sentAt }`, reaproveitada tal como está, sem duplicar.
export function mergePanelCards(input: {
  hotLeadCards: HotLeadCard[];
  noShowCards: NoShowCard[];
  reactivationCards: ReactivationCard[];
}): PanelCard[] {
  const hotLead: PanelCard[] = input.hotLeadCards.map((c) => ({
    kind: "HOT_LEAD",
    cardKey: `hot:${c.conversationId}`,
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
    sentAt: c.sentAt,
    actionKey: { kind: "HOT_LEAD", conversationId: c.conversationId },
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
    sentAt: c.sentAt,
    actionKey: { kind: "NO_SHOW", appointmentId: c.appointmentId, step: c.step },
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
    sentAt: c.sentAt,
    actionKey: { kind: "REACTIVATION", appointmentId: c.appointmentId, thresholdDays: c.thresholdDays },
  }));

  return [...hotLead, ...noShow, ...reactivation];
}

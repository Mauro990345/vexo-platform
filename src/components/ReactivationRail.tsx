"use client";

import { useEffect, useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppMonoIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { Card } from "@/components/Card";
import { Badge, type BadgeVariant } from "@/components/Badge";
import { WHATSAPP_ACTION_BUTTON_CLASS, REACTIVATION_UNDO_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
import { MOBILE_ICON_SIZE } from "@/components/MobileCardScale";
import {
  toggleReactivationCardSentClientAction,
  sendReactivationWhatsAppMessageClientAction,
  toggleNoShowCardSentClientAction,
  sendNoShowCardWhatsAppMessageClientAction,
  toggleHotLeadCardSentClientAction,
  toggleNeverScheduledCardSentClientAction,
} from "@/app/dashboard/actions";
import { formatReactivationReturnLine, type SendReactivationWhatsAppResult } from "@/lib/reactivation";
import type { ToggleHotLeadCardSentResult } from "@/lib/hot-lead-cards";
import { groupPanelCardsForDisplay, type PanelCard, type PanelCardKind } from "@/lib/panel-cards";

// Rótulo + variante do Badge (Etapa 2 da migração de design, ver
// docs/design-audit.md) por tipo de card — substitui as 4 cores novas do
// antigo PanelCardTypeChip (removido, ver PanelCardBadge.tsx) pelas
// variantes semânticas já existentes, mais alinhadas ao DESIGN.md ("no
// máximo 2 matizes de destaque por bloco"). Mapeamento: Quente (mais
// urgente) -> warning; Faltou -> error; Reativação -> accent (cor da
// marca); Não agendou (lead menos qualificado) -> muted.
const KIND_BADGE: Record<PanelCardKind, { label: string; variant: BadgeVariant }> = {
  HOT_LEAD: { label: "Quente", variant: "warning" },
  NO_SHOW: { label: "Faltou", variant: "error" },
  REACTIVATION: { label: "Reativação", variant: "accent" },
  NEVER_SCHEDULED: { label: "Não agendou", variant: "muted" },
};

// Lógica pura (testável sem renderizar o componente, mesmo padrão de
// shouldShowClientBonusTab em ClientPanelView.tsx) — pedido explícito: "se
// não houver nenhuma enviada no período, não mostrar a linha".
export function shouldShowReactivationReturnLine(returnMetric: { sent: number; returned: number } | undefined): boolean {
  return Boolean(returnMetric && returnMetric.sent > 0);
}

// Mesma duração do toast já usado em InstagramDmButton.tsx — aviso
// discreto que desaparece sozinho, nunca precisa de clique pra fechar.
const NOTICE_DURATION_MS = 2500;

type WhatsAppFailureReason = Extract<SendReactivationWhatsAppResult, { ok: false }>["reason"];

function noticeForFailure(reason: WhatsAppFailureReason): string {
  switch (reason) {
    case "disconnected":
      return "WhatsApp desconectado";
    case "invalid_phone":
      return "Telefone inválido";
    case "rate_limited":
      return "Aguarde um instante";
    case "no_longer_eligible":
      return "Lead já respondeu";
    default:
      return "Falha ao enviar";
  }
}

// "use client" (pedido explícito: marcar enviado precisa de atualização
// OTIMISTA, na hora do clique, sem esperar o round-trip da server action) —
// estado local inicializado a partir de `cards` (vindo do servidor) e
// resincronizado sempre que esse prop mudar.
//
// "Para fazer hoje" — coluna ESQUERDA do Painel (ver ClientPanelView.tsx),
// SEMPRE aberta (pedido explícito, reorganização do Painel — ver
// docs/design-audit.md: "tudo o que exige ação fica sempre aberto e
// visível, sem abas e sem seções recolhidas"). Une os 4 tipos de card
// (Reativação/Faltou/Quente/Não agendou, já mesclados em `cards` por
// mergePanelCards, panel-cards.ts) numa lista ÚNICA, agrupada em
// "Atrasados"/"Hoje" por prioridade (groupPanelCardsForDisplay) e SEM
// rolagem interna nem "ver todos" — mostra todos os pendentes. Os botões
// de ação à direita continuam EXATAMENTE como sempre foram (WhatsApp envia
// de verdade pelo VEXO com as travas de sempre, Instagram copia + abre),
// dispatchados por `card.actionKey.kind`.
export type ReactivationRailProps = {
  cards: PanelCard[];
  action?: (appointmentId: string, thresholdDays: number) => Promise<unknown>;
  sendWhatsappAction?: (appointmentId: string, thresholdDays: number) => Promise<SendReactivationWhatsAppResult>;
  noShowToggleAction?: (appointmentId: string, step: number) => Promise<unknown>;
  noShowSendWhatsappAction?: (appointmentId: string, step: number) => Promise<SendReactivationWhatsAppResult>;
  hotLeadToggleAction?: (conversationId: string, step: number) => Promise<ToggleHotLeadCardSentResult>;
  neverScheduledToggleAction?: (conversationId: string, step: number) => Promise<unknown>;
  // "N enviadas · M voltaram" do período selecionado (ver
  // PanelOverview.tsx/reactivation.ts) — undefined/sent=0 não mostra
  // nada (pedido explícito: "se não houver nenhuma enviada no período, não
  // mostrar a linha").
  returnMetric?: { sent: number; returned: number };
};

export function ReactivationRail({
  cards,
  action = toggleReactivationCardSentClientAction,
  sendWhatsappAction = sendReactivationWhatsAppMessageClientAction,
  noShowToggleAction = toggleNoShowCardSentClientAction,
  noShowSendWhatsappAction = sendNoShowCardWhatsAppMessageClientAction,
  hotLeadToggleAction = toggleHotLeadCardSentClientAction,
  neverScheduledToggleAction = toggleNeverScheduledCardSentClientAction,
  returnMetric,
}: ReactivationRailProps) {
  const [localCards, setLocalCards] = useState(cards);
  useEffect(() => setLocalCards(cards), [cards]);

  // Só pro canal WhatsApp (Reativação e Faltou): quais cards estão com o
  // envio em andamento (botão desabilitado, "Enviando…"), o aviso discreto
  // atual de cada card (se algum) e quais já caíram de volta pro fluxo
  // manual de antes (ver reason "disconnected" em handleSendWhatsapp) —
  // todos mapeados por cardKey (único entre os 4 tipos, ver panel-cards.ts).
  const [sendingKeys, setSendingKeys] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Map<string, string>>(new Map());
  const [manualFallbackKeys, setManualFallbackKeys] = useState<Set<string>>(new Set());

  function showNotice(key: string, message: string) {
    setNotices((prev) => new Map(prev).set(key, message));
    window.setTimeout(() => {
      setNotices((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, NOTICE_DURATION_MS);
  }

  function setSentOptimistically(cardKey: string, sentAt: Date | null) {
    setLocalCards((prev) => prev.map((c) => (c.cardKey === cardKey ? { ...c, sentAt } : c)));
  }

  // Alterna a marcação de enviado — usada no "✓" de desfazer (Reativação e
  // Faltou) e no botão de WhatsApp quando já caiu pro fluxo manual (abrir o
  // wa.me manualmente conta como "enviado"). Otimista: alterna sentAt local
  // na hora; se a action falhar, desfaz a atualização otimista.
  function handleToggleSent(card: PanelCard) {
    const now = new Date();
    const nextSentAt = card.sentAt ? null : now;
    setSentOptimistically(card.cardKey, nextSentAt);

    const promise =
      card.actionKey.kind === "REACTIVATION"
        ? action(card.actionKey.appointmentId, card.actionKey.thresholdDays)
        : card.actionKey.kind === "NO_SHOW"
          ? noShowToggleAction(card.actionKey.appointmentId, card.actionKey.step)
          : card.actionKey.kind === "NEVER_SCHEDULED"
            ? neverScheduledToggleAction(card.actionKey.conversationId, card.actionKey.step)
            : Promise.resolve();

    promise.catch((err) => {
      console.error("[vexo] Falha ao marcar/desmarcar card como enviado:", err);
      setSentOptimistically(card.cardKey, card.sentAt);
    });
  }

  // Clique no botão de ação de um card de Instagram (Reativação, Faltou
  // sem telefone, ou Quente) — ainda só copia + abre, mas marca o card
  // como enviado no Painel. Quente precisa conferir o limite diário
  // (ver toggleHotLeadCardSent) — se o servidor rejeitar, desfaz a marcação
  // otimista e avisa, em vez de ficar marcado "enviado" sem ter sido.
  function handleInstagramSent(card: PanelCard) {
    const now = new Date();
    setSentOptimistically(card.cardKey, now);

    if (card.actionKey.kind === "HOT_LEAD") {
      hotLeadToggleAction(card.actionKey.conversationId, card.actionKey.step)
        .then((result) => {
          if (!result.ok) {
            setSentOptimistically(card.cardKey, card.sentAt);
            showNotice(card.cardKey, result.reason === "daily_limit_reached" ? "Limite diário atingido" : "Falha ao marcar");
          }
        })
        .catch((err) => {
          console.error("[vexo] Falha ao marcar card Quente como enviado:", err);
          setSentOptimistically(card.cardKey, card.sentAt);
        });
      return;
    }

    const promise =
      card.actionKey.kind === "REACTIVATION"
        ? action(card.actionKey.appointmentId, card.actionKey.thresholdDays)
        : card.actionKey.kind === "NEVER_SCHEDULED"
          ? neverScheduledToggleAction(card.actionKey.conversationId, card.actionKey.step)
          : noShowToggleAction(card.actionKey.appointmentId, card.actionKey.step);
    promise.catch((err) => console.error("[vexo] Falha ao marcar card (Instagram) como enviado:", err));
  }

  // Clique no botão de ação de um card de WhatsApp (Reativação ou Faltou)
  // — ENVIA de verdade pela conexão da clínica. Um clique = uma chamada =
  // uma mensagem; nunca reenvia enquanto já está "Enviando…" pra este
  // mesmo card. Só confirma sentAt depois do servidor confirmar sucesso.
  async function handleSendWhatsapp(card: PanelCard) {
    if (card.actionKey.kind === "HOT_LEAD" || card.actionKey.kind === "NEVER_SCHEDULED") return; // Quente e Não agendou nunca enviam WhatsApp
    const key = card.cardKey;
    if (sendingKeys.has(key)) return;

    setSendingKeys((prev) => new Set(prev).add(key));
    try {
      const result =
        card.actionKey.kind === "REACTIVATION"
          ? await sendWhatsappAction(card.actionKey.appointmentId, card.actionKey.thresholdDays)
          : await noShowSendWhatsappAction(card.actionKey.appointmentId, card.actionKey.step);

      if (result.ok) {
        setSentOptimistically(key, new Date());
        return;
      }

      if (result.reason === "disconnected") {
        setManualFallbackKeys((prev) => new Set(prev).add(key));
      }
      showNotice(key, noticeForFailure(result.reason));
    } catch (err) {
      console.error("[vexo] Falha ao enviar WhatsApp do card:", err);
      showNotice(key, "Falha ao enviar");
    } finally {
      setSendingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function renderRow(card: PanelCard) {
    const isSent = Boolean(card.sentAt);
    const key = card.cardKey;
    const isSending = sendingKeys.has(key);
    const notice = notices.get(key);
    const useManualFallback = manualFallbackKeys.has(key);
    // Limite diário batido (Quente: cliques de Instagram; Reativação/
    // Faltou: envios de WhatsApp — ver panel-cards.ts/disabledReason) —
    // nunca desabilita um card já enviado (precisa continuar clicável pra
    // desfazer).
    const isDisabledByLimit = Boolean(card.disabledReason) && !isSent;
    const kindBadge = KIND_BADGE[card.kind];

    const actionNode = isSent ? (
      <button type="button" title="Desfazer" aria-label="Desfazer envio" onClick={() => handleToggleSent(card)} className={REACTIVATION_UNDO_BUTTON_CLASS}>
        ✓
      </button>
    ) : isDisabledByLimit ? (
      <span className="shrink-0 text-caption text-vexo-muted">{card.disabledReason}</span>
    ) : card.channel === "WHATSAPP" ? (
      !card.whatsappLink ? (
        <span className="shrink-0 text-caption text-vexo-muted">Sem WhatsApp</span>
      ) : (
        <div className="relative shrink-0">
          {useManualFallback ? (
            // Desconectado uma vez nesta sessão — volta pro fluxo manual de
            // sempre (abre o wa.me já preenchido, a clínica manda pelo
            // próprio app).
            <a href={card.whatsappLink} target="_blank" rel="noreferrer" onClick={() => handleToggleSent(card)} className={WHATSAPP_ACTION_BUTTON_CLASS}>
              <WhatsAppMonoIcon className={MOBILE_ICON_SIZE} />
              WhatsApp
            </a>
          ) : (
            <button type="button" disabled={isSending} onClick={() => handleSendWhatsapp(card)} className={WHATSAPP_ACTION_BUTTON_CLASS}>
              <WhatsAppMonoIcon className={MOBILE_ICON_SIZE} />
              {isSending ? "Enviando…" : "WhatsApp"}
            </button>
          )}
          {notice && (
            <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">{notice}</span>
          )}
        </div>
      )
    ) : (
      <div className="relative shrink-0">
        <InstagramDmButton message={card.message} dmLink={card.instagramDmLink} onSent={() => handleInstagramSent(card)} />
        {notice && (
          <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">{notice}</span>
        )}
      </div>
    );

    return (
      <div key={key} className={`flex items-center gap-2.5 py-2.5 transition-opacity duration-150 ${isSent ? "opacity-50" : ""}`}>
        <LeadAvatar profilePictureUrl={card.profilePictureUrl} name={card.name} size="appointment" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Badge variant={kindBadge.variant} className="shrink-0">
              {kindBadge.label}
            </Badge>
            <p className="min-w-0 flex-1 truncate text-xs font-medium">{card.name}</p>
            {card.igUsername &&
              (card.instagramProfileLink ? (
                <a
                  href={card.instagramProfileLink}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 truncate text-caption text-vexo-muted hover:text-vexo-accent hover:underline"
                >
                  @{card.igUsername}
                </a>
              ) : (
                <span className="shrink-0 truncate text-caption text-vexo-muted">@{card.igUsername}</span>
              ))}
          </div>
          <p className="mt-0.5 truncate text-caption text-vexo-muted">{card.reasonShort}</p>
        </div>
        {actionNode}
      </div>
    );
  }

  const { overdue, today, sent, pendingCount } = groupPanelCardsForDisplay(localCards, new Date());

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Para fazer hoje · {pendingCount}</h2>
      </div>
      {shouldShowReactivationReturnLine(returnMetric) && returnMetric && (
        <p className="mt-0.5 text-caption text-vexo-muted">{formatReactivationReturnLine(returnMetric.sent, returnMetric.returned)}</p>
      )}

      {pendingCount === 0 && sent.length === 0 && <p className="py-6 text-center text-xs text-vexo-muted">Tudo em dia hoje</p>}

      {overdue.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-vexo-error">Atrasados</p>
          <div className="divide-y divide-vexo-border">{overdue.map(renderRow)}</div>
        </div>
      )}

      {today.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Hoje</p>
          <div className="divide-y divide-vexo-border">{today.map(renderRow)}</div>
        </div>
      )}

      {pendingCount === 0 && sent.length > 0 && <p className="mt-3 text-center text-xs text-vexo-muted">Tudo em dia hoje</p>}

      {sent.length > 0 && <div className="mt-3 divide-y divide-vexo-border border-t border-vexo-border">{sent.map(renderRow)}</div>}
    </Card>
  );
}

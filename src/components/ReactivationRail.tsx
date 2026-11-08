"use client";

import { useEffect, useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppGlyphIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { Button } from "@/components/Button";
import { WHATSAPP_ACTION_BUTTON_CLASS, REACTIVATION_UNDO_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
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

// Rótulo por tipo de card — pedido explícito (ajuste pós-reorganização,
// ver docs/design-audit.md): a etiqueta deixou de usar o componente Badge
// (selo grande, com cor própria por tipo — "competia" com a cor do botão
// de ação) e virou um texto pequeno com fundo bem sutil, igual pros 4
// tipos (ver renderRow abaixo) — só o RÓTULO ainda diferencia o tipo, não
// mais a cor.
const KIND_LABEL: Record<PanelCardKind, string> = {
  HOT_LEAD: "Quente",
  NO_SHOW: "Faltou",
  REACTIVATION: "Reativação",
  NEVER_SCHEDULED: "Não agendou",
};

// Cor por tipo (ajuste dedicado — ver globals.css/DESIGN.md): Reativação
// no azul da marca, Follow-up e seus subtipos (Faltou/Não agendou/Quente)
// no marrom/dourado já usado no VEXO. Sem faixa lateral grossa — só a
// borda fina do cartão (inteira) tingida a ~35% e o fundo da etiqueta a
// ~16%, aplicados abaixo em CARD_BORDER_CLASS/KIND_TAG_CLASS.
const CARD_BORDER_CLASS: Record<PanelCardKind, string> = {
  REACTIVATION: "border-vexo-cardTypeReativacao/35",
  HOT_LEAD: "border-vexo-cardTypeFollowup/35",
  NO_SHOW: "border-vexo-cardTypeFollowup/35",
  NEVER_SCHEDULED: "border-vexo-cardTypeFollowup/35",
};
const KIND_TAG_CLASS: Record<PanelCardKind, string> = {
  REACTIVATION: "bg-vexo-cardTypeReativacao/16 text-vexo-cardTypeReativacaoText",
  HOT_LEAD: "bg-vexo-cardTypeFollowup/16 text-vexo-cardTypeFollowup",
  NO_SHOW: "bg-vexo-cardTypeFollowup/16 text-vexo-cardTypeFollowup",
  NEVER_SCHEDULED: "bg-vexo-cardTypeFollowup/16 text-vexo-cardTypeFollowup",
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
// rolagem interna nem "ver todos" — mostra todos os pendentes. Os já
// enviados ficam num grupo recolhido "Enviados (N)" no fim (pedido
// explícito do ajuste pós-reorganização — antes apareciam misturados,
// só dimmed). Os botões de ação à direita continuam EXATAMENTE como
// sempre foram (WhatsApp envia de verdade pelo VEXO com as travas de
// sempre, Instagram copia + abre), dispatchados por `card.actionKey.kind`.
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
  const [sentOpen, setSentOpen] = useState(false);

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
              <WhatsAppGlyphIcon className="h-4 w-4 shrink-0" />
              WhatsApp
            </a>
          ) : (
            <button type="button" disabled={isSending} onClick={() => handleSendWhatsapp(card)} className={WHATSAPP_ACTION_BUTTON_CLASS}>
              <WhatsAppGlyphIcon className="h-4 w-4 shrink-0" />
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
      // Cada linha volta a ser um cartão leve e separado (pedido explícito
      // do ajuste pós-reorganização — fundo sutil, borda fina), não mais
      // uma linha dentro de um bloco único com divide-y. O espaçamento
      // entre cartões (~8px) vem do `space-y-2` do container-pai (ver
      // abaixo), não daqui.
      <div
        key={key}
        className={`flex items-center gap-2.5 rounded-control border bg-vexo-surface p-2.5 transition-opacity duration-150 ${isSent ? "border-vexo-border opacity-50" : CARD_BORDER_CLASS[card.kind]}`}
      >
        <LeadAvatar profilePictureUrl={card.profilePictureUrl} name={card.name} size="appointment" />
        <div className="min-w-0 flex-1 space-y-0.5">
          {/* 1ª linha: NOME completo em destaque, com o @ do Instagram logo
              ao lado, alinhado a ele (pedido explícito — antes o @ ficava
              afastado, numa 2ª linha à direita, longe do nome). `flex-wrap`
              (não um `truncate` competindo com o @ pela mesma linha): se
              não houver largura pros dois juntos, é o @ que quebra pra uma
              linha própria, alinhado à esquerda com o nome — o nome nunca
              é cortado antes do @, mesmo princípio usado em
              PanelAppointmentsColumn.tsx (coluna Agendamentos). */}
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <p className="max-w-full truncate text-sm font-medium">{card.name}</p>
            {card.igUsername &&
              (card.instagramProfileLink ? (
                <a href={card.instagramProfileLink} target="_blank" rel="noreferrer" className="truncate text-caption text-vexo-muted hover:text-vexo-accent hover:underline">
                  @{card.igUsername}
                </a>
              ) : (
                <span className="truncate text-caption text-vexo-muted">@{card.igUsername}</span>
              ))}
          </div>
          {/* 2ª linha: etiqueta do tipo (pequena, fundo bem sutil, nunca
              mais o selo grande/colorido de antes — ver KIND_LABEL acima) +
              motivo em cinza. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className={`shrink-0 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${isSent ? "bg-vexo-surface2 text-vexo-muted" : KIND_TAG_CLASS[card.kind]}`}
            >
              {KIND_LABEL[card.kind]}
            </span>
            <p className="min-w-0 flex-1 truncate text-caption text-vexo-muted">{card.reasonShort}</p>
          </div>
        </div>
        {actionNode}
      </div>
    );
  }

  const { overdue, today, sent, pendingCount } = groupPanelCardsForDisplay(localCards, new Date());

  return (
    <div>
      {/* Mesmo padrão de cabeçalho da coluna "Agendamentos" (ponto +
          título, ver PanelAppointmentsColumn.tsx) — ajuste de alinhamento:
          antes só "Agendamentos" tinha o ponto, deixando os dois
          cabeçalhos de coluna visualmente diferentes. */}
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-vexo-accent" />
        <h2 className="text-sm font-semibold">Para fazer hoje · {pendingCount}</h2>
      </div>
      {shouldShowReactivationReturnLine(returnMetric) && returnMetric && (
        <p className="mt-0.5 text-caption text-vexo-muted">{formatReactivationReturnLine(returnMetric.sent, returnMetric.returned)}</p>
      )}

      {pendingCount === 0 && <p className="mt-3 text-xs text-vexo-muted">Tudo em dia hoje</p>}

      {/* Rótulos de grupo neutros (pedido explícito — nunca vermelho, nem
          pra "Atrasados": cinza discreto em caixa alta pequena, igual a
          "Hoje"). */}
      {overdue.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Atrasados</p>
          <div className="mt-1.5 space-y-2">{overdue.map(renderRow)}</div>
        </div>
      )}

      {today.length > 0 && (
        <div className="mt-3">
          <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Hoje</p>
          <div className="mt-1.5 space-y-2">{today.map(renderRow)}</div>
        </div>
      )}

      {/* Enviados — grupo recolhido no fim (pedido explícito: antes
          ficavam misturados, só dimmed); a contagem do título considera só
          os pendentes (pendingCount acima), nunca estes. */}
      {sent.length > 0 && (
        <div className="mt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setSentOpen((o) => !o)}>
            {sentOpen ? "Ocultar enviados" : `Enviados (${sent.length})`}
          </Button>
          {sentOpen && <div className="mt-2 space-y-2">{sent.map(renderRow)}</div>}
        </div>
      )}
    </div>
  );
}

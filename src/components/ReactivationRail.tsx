"use client";

import { useEffect, useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppMonoIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { PanelCardTypeBar, PanelCardTypeChip, PanelCardReasonLine } from "@/components/PanelCardBadge";
import { WHATSAPP_ACTION_BUTTON_CLASS, REACTIVATION_UNDO_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
import {
  MOBILE_REACTIVATION_ROW_PADDING,
  MOBILE_ROW_GAP,
  MOBILE_APPOINTMENT_ACTION_GAP,
  MOBILE_LIST_GAP,
  MOBILE_STACK_GAP,
  MOBILE_INLINE_GAP,
  MOBILE_CHIP_ROW_GAP,
  MOBILE_NAME_TEXT_REACTIVATION,
  MOBILE_HANDLE_TEXT,
  MOBILE_HANDLE_SHRINK,
  MOBILE_SECONDARY_TEXT,
  MOBILE_ICON_SIZE,
  MOBILE_CARD_MIN_HEIGHT,
  MOBILE_SECTION_TITLE_TEXT,
  MOBILE_SECTION_COUNTER_TEXT,
  MOBILE_SECTION_DOT_SIZE,
} from "@/components/MobileCardScale";
import {
  toggleReactivationCardSentClientAction,
  sendReactivationWhatsAppMessageClientAction,
  toggleNoShowCardSentClientAction,
  sendNoShowCardWhatsAppMessageClientAction,
  toggleHotLeadCardSentClientAction,
} from "@/app/dashboard/actions";
import { sortReactivationCardsForDisplay, countPendingReactivationCards, type SendReactivationWhatsAppResult } from "@/lib/reactivation";
import type { ToggleHotLeadCardSentResult } from "@/lib/hot-lead-cards";
import type { PanelCard } from "@/lib/panel-cards";

function pendingCountLabel(n: number): string {
  return n === 1 ? "1 pendente" : `${n} pendentes`;
}

// Acima de ~6 linhas a lista ganha rolagem INTERNA (nunca horizontal) —
// mesma altura aproximada de 6 linhas compactas + espaçamento.
const SCROLL_THRESHOLD = 6;

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
// Faixa "Reativação" — coluna ESQUERDA do Painel (ver ClientPanelView.tsx).
// Lista vertical compacta, uma linha enxuta por paciente: barra+chip do
// TIPO (ver PanelCardBadge.tsx — item explícito: identificação visual por
// tipo, só do lado esquerdo), avatar, nome, @ e motivo em cinza; o botão de
// ação à direita continua EXATAMENTE como sempre foi (WhatsApp envia de
// verdade pelo VEXO com as travas de sempre, Instagram copia + abre),
// agora dispatchado por `card.actionKey.kind` em vez de assumir que todo
// card é de Reativação.
export function ReactivationRail({
  cards,
  action = toggleReactivationCardSentClientAction,
  sendWhatsappAction = sendReactivationWhatsAppMessageClientAction,
  noShowToggleAction = toggleNoShowCardSentClientAction,
  noShowSendWhatsappAction = sendNoShowCardWhatsAppMessageClientAction,
  hotLeadToggleAction = toggleHotLeadCardSentClientAction,
}: {
  cards: PanelCard[];
  action?: (appointmentId: string, thresholdDays: number) => Promise<unknown>;
  sendWhatsappAction?: (appointmentId: string, thresholdDays: number) => Promise<SendReactivationWhatsAppResult>;
  noShowToggleAction?: (appointmentId: string, step: number) => Promise<unknown>;
  noShowSendWhatsappAction?: (appointmentId: string, step: number) => Promise<SendReactivationWhatsAppResult>;
  hotLeadToggleAction?: (conversationId: string, step: number) => Promise<ToggleHotLeadCardSentResult>;
}) {
  const [localCards, setLocalCards] = useState(cards);
  useEffect(() => setLocalCards(cards), [cards]);

  // Só pro canal WhatsApp (Reativação e Faltou): quais cards estão com o
  // envio em andamento (botão desabilitado, "Enviando…"), o aviso discreto
  // atual de cada card (se algum) e quais já caíram de volta pro fluxo
  // manual de antes (ver reason "disconnected" em handleSendWhatsapp) —
  // todos mapeados por cardKey (único entre os 3 tipos, ver panel-cards.ts).
  const [sendingKeys, setSendingKeys] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Map<string, string>>(new Map());
  const [manualFallbackKeys, setManualFallbackKeys] = useState<Set<string>>(new Set());

  if (localCards.length === 0) return null;

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

    const promise = card.actionKey.kind === "REACTIVATION" ? action(card.actionKey.appointmentId, card.actionKey.thresholdDays) : noShowToggleAction(card.actionKey.appointmentId, card.actionKey.step);
    promise.catch((err) => console.error("[vexo] Falha ao marcar card (Instagram) como enviado:", err));
  }

  // Clique no botão de ação de um card de WhatsApp (Reativação ou Faltou)
  // — ENVIA de verdade pela conexão da clínica. Um clique = uma chamada =
  // uma mensagem; nunca reenvia enquanto já está "Enviando…" pra este
  // mesmo card. Só confirma sentAt depois do servidor confirmar sucesso.
  async function handleSendWhatsapp(card: PanelCard) {
    if (card.actionKey.kind === "HOT_LEAD") return; // Quente nunca envia WhatsApp
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

  const pendingCount = countPendingReactivationCards(localCards);
  const sortedCards = sortReactivationCardsForDisplay(localCards);
  const needsScroll = sortedCards.length > SCROLL_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full bg-vexo-success ${MOBILE_SECTION_DOT_SIZE}`} />
          <h2 className={`${MOBILE_SECTION_TITLE_TEXT} font-semibold text-vexo-fg`}>Reativação</h2>
        </div>
        <span className={`${MOBILE_SECTION_COUNTER_TEXT} text-vexo-muted`}>{pendingCountLabel(pendingCount)}</span>
      </div>
      <div className={`${MOBILE_LIST_GAP} ${needsScroll ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
        {sortedCards.map((card) => {
          const isSent = Boolean(card.sentAt);
          const key = card.cardKey;
          const isSending = sendingKeys.has(key);
          const notice = notices.get(key);
          const useManualFallback = manualFallbackKeys.has(key);
          // Limite diário batido (Quente: cliques de Instagram; Reativação/
          // Faltou: envios de WhatsApp — ver panel-cards.ts/disabledReason)
          // — nunca desabilita um card já enviado (precisa continuar
          // clicável pra desfazer).
          const isDisabledByLimit = Boolean(card.disabledReason) && !isSent;

          // Botão de ação (WhatsApp/Instagram/desfazer/aviso) — extraído
          // uma vez só e reaproveitado nos dois layouts abaixo (mobile e
          // desktop; ver comentário no wrapper mobile sobre o motivo da
          // divisão). Continua exatamente o MESMO componente/classes de
          // sempre em ambos — só muda com quem ele divide linha.
          const actionNode = isSent ? (
            <button
              type="button"
              title="Desfazer"
              aria-label="Desfazer envio"
              onClick={() => handleToggleSent(card)}
              className={REACTIVATION_UNDO_BUTTON_CLASS}
            >
              ✓
            </button>
          ) : isDisabledByLimit ? (
            <span className={`shrink-0 ${MOBILE_SECONDARY_TEXT} text-vexo-muted`}>{card.disabledReason}</span>
          ) : card.channel === "WHATSAPP" ? (
            !card.whatsappLink ? (
              <span className={`shrink-0 ${MOBILE_SECONDARY_TEXT} text-vexo-muted`}>Sem WhatsApp</span>
            ) : (
              <div className="relative shrink-0">
                {useManualFallback ? (
                  // Desconectado uma vez nesta sessão — volta pro fluxo
                  // manual de sempre (abre o wa.me já preenchido, a
                  // clínica manda pelo próprio app).
                  <a
                    href={card.whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleToggleSent(card)}
                    className={WHATSAPP_ACTION_BUTTON_CLASS}
                  >
                    <WhatsAppMonoIcon className={MOBILE_ICON_SIZE} />
                    WhatsApp
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => handleSendWhatsapp(card)}
                    className={WHATSAPP_ACTION_BUTTON_CLASS}
                  >
                    <WhatsAppMonoIcon className={MOBILE_ICON_SIZE} />
                    {isSending ? "Enviando…" : "WhatsApp"}
                  </button>
                )}
                {notice && (
                  <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">
                    {notice}
                  </span>
                )}
              </div>
            )
          ) : (
            <div className="relative shrink-0">
              <InstagramDmButton message={card.message} dmLink={card.instagramDmLink} onSent={() => handleInstagramSent(card)} />
              {notice && (
                <span className="absolute -top-7 right-0 whitespace-nowrap rounded-md bg-vexo-surface2 px-2 py-1 text-caption text-vexo-fg shadow-card">
                  {notice}
                </span>
              )}
            </div>
          );

          const nameAndHandle = (
            <>
              {/* truncate (2026-10-30, pedido explícito "o nome não pode
                  quebrar em duas linhas... uma linha, com reticências") —
                  SEMPRE 1 linha, mobile e desktop (antes só o desktop
                  truncava; o celular tolerava até 2 linhas via
                  line-clamp-2, removido). min-w-0 + flex-1: mesmo
                  mecanismo de ClientPanelView.tsx (Agendamentos) —
                  precisa ser flex-1 (não só shrink) pro truncamento
                  funcionar dividindo espaço com o @ ao lado. */}
              <p className={`min-w-0 flex-1 truncate ${MOBILE_NAME_TEXT_REACTIVATION} font-medium`}>{card.name}</p>
              {card.igUsername &&
                (card.instagramProfileLink ? (
                  <a
                    href={card.instagramProfileLink}
                    target="_blank"
                    rel="noreferrer"
                    className={`${MOBILE_HANDLE_SHRINK} truncate ${MOBILE_HANDLE_TEXT} text-vexo-muted hover:text-vexo-accent hover:underline`}
                  >
                    @{card.igUsername}
                  </a>
                ) : (
                  <span className={`${MOBILE_HANDLE_SHRINK} truncate ${MOBILE_HANDLE_TEXT} text-vexo-muted`}>@{card.igUsername}</span>
                ))}
            </>
          );

          const chipAndReason = (
            <>
              <PanelCardTypeChip kind={card.kind} />
              <PanelCardReasonLine reason={card.reason} />
            </>
          );

          return (
            <div
              key={key}
              // SÓ CELULAR (abaixo de sm/640px) — AJUSTE (2026-10-30,
              // pedido explícito "alinhe os três tipos ao mesmo padrão
              // dos cards de Agendamentos"): padding/altura mínima
              // alinhados ao card de Agendamentos (ver
              // MOBILE_REACTIVATION_ROW_PADDING/MOBILE_CARD_MIN_HEIGHT,
              // MobileCardScale.ts — MOBILE_CARD_MIN_HEIGHT já era
              // compartilhada entre os dois tipos de card). `sm:` com os
              // valores de sempre — em tablet/notebook/desktop fica
              // idêntico a antes desta rodada.
              className={`relative flex items-center ${MOBILE_ROW_GAP} overflow-hidden rounded-lg border border-vexo-border bg-vexo-surface ${MOBILE_REACTIVATION_ROW_PADDING} ${MOBILE_CARD_MIN_HEIGHT} transition-opacity duration-150 ${isSent ? "opacity-50" : ""}`}
            >
              <PanelCardTypeBar kind={card.kind} />
              {/* size="appointment" (2026-10-30, pedido explícito "mesmo
                  tamanho de avatar... dos cards de Agendamentos") — SÓ
                  CELULAR fica do mesmo tamanho do avatar de Agendamentos
                  (34px, ver MOBILE_APPOINTMENT_AVATAR_SIZE/LeadAvatar.tsx);
                  o badge do canal (Instagram) acompanha automaticamente,
                  mesmo tamanho/posição de sempre. Em desktop (`sm:h-8
                  sm:w-8`) é pixel-idêntico ao antigo size="md" — os dois
                  reusam o MESMO valor de desktop, só o celular mudou. */}
              <LeadAvatar profilePictureUrl={card.profilePictureUrl} name={card.name} size="appointment" />

              {/* SÓ CELULAR — chip+motivo ganham a linha de cima INTEIRA
                  (não dividem espaço com o botão de ação à direita): o
                  motivo precisa sempre caber em 1 linha visível (pedido
                  explícito), e com avatar + chip(133px fixo) + botão
                  "WhatsApp"/"Instagram" disputando a MESMA linha, não
                  sobrava nenhum espaço pro motivo numa tela de 320-375px
                  (bug visto na verificação visual de uma rodada anterior:
                  motivo ficava 0px de largura, sumia). Nome+@ (ambos 1
                  linha, com reticências — AJUSTE 2026-10-30, pedido
                  explícito "nome/@ na linha de baixo... mas compactos",
                  mesma estrutura de ClientPanelView.tsx/Agendamentos)
                  dividem a linha de baixo com o botão. Botão continua com
                  a mesma aparência/posição à direita de sempre, só muda
                  com qual linha ele compartilha. */}
              <div className={`flex min-w-0 flex-1 flex-col sm:hidden ${MOBILE_STACK_GAP}`}>
                <div className={`flex items-center ${MOBILE_CHIP_ROW_GAP}`}>{chipAndReason}</div>
                <div className={`flex items-center justify-between ${MOBILE_APPOINTMENT_ACTION_GAP}`}>
                  {/* nome e @ lado a lado (items-baseline), igual
                      Agendamentos — AJUSTE 2026-10-30: antes era flex-col
                      (nome em cima, @ embaixo), pra abrir espaço pro nome
                      quebrar em 2 linhas; como o nome agora é sempre 1
                      linha (ver nameAndHandle acima), não precisa mais
                      empilhar. */}
                  <div className={`flex min-w-0 flex-1 items-baseline ${MOBILE_INLINE_GAP}`}>{nameAndHandle}</div>
                  {actionNode}
                </div>
              </div>

              {/* >=640px — estrutura de sempre, intocada: nome/@ e
                  chip/motivo empilhados numa coluna só, dividindo espaço
                  com o botão (sempre coube nesse tamanho de tela; o fator
                  desktop não muda nesta rodada). */}
              <div className="hidden min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-1.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-baseline gap-1">{nameAndHandle}</div>
                  <div className="flex items-center gap-1.5">{chipAndReason}</div>
                </div>
                {actionNode}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

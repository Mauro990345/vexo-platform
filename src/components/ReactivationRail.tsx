"use client";

import { useEffect, useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppMonoIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { WHATSAPP_ACTION_BUTTON_CLASS, REACTIVATION_UNDO_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
import { toggleReactivationCardSentClientAction, sendReactivationWhatsAppMessageClientAction } from "@/app/dashboard/actions";
import {
  sortReactivationCardsForDisplay,
  countPendingReactivationCards,
  cardSlotKey,
  type ReactivationCard,
  type SendReactivationWhatsAppResult,
} from "@/lib/reactivation";

function pendingCountLabel(n: number): string {
  return n === 1 ? "1 pendente" : `${n} pendentes`;
}

// Acima de ~6 linhas a lista ganha rolagem INTERNA (nunca horizontal) —
// mesma altura aproximada de 6 linhas compactas + espaçamento.
const SCROLL_THRESHOLD = 6;

// Mesma duração do toast já usado em InstagramDmButton.tsx — aviso
// discreto que desaparece sozinho, nunca precisa de clique pra fechar.
const NOTICE_DURATION_MS = 2500;

type SendReactivationWhatsAppFailureReason = Extract<SendReactivationWhatsAppResult, { ok: false }>["reason"];

function noticeForFailure(reason: SendReactivationWhatsAppFailureReason): string {
  switch (reason) {
    case "disconnected":
      return "WhatsApp desconectado";
    case "invalid_phone":
      return "Telefone inválido";
    case "rate_limited":
      return "Aguarde um instante";
    default:
      return "Falha ao enviar";
  }
}

// "use client" (pedido explícito: marcar enviado precisa de atualização
// OTIMISTA, na hora do clique, sem esperar o round-trip da server action) —
// estado local inicializado a partir de `cards` (vindo do servidor) e
// resincronizado sempre que esse prop mudar (nova renderização do
// servidor: revalidatePath depois de marcar/desmarcar, ou o card
// simplesmente sumindo quando vence a janela de 5 dias úteis).
//
// Faixa "Reativação" — coluna ESQUERDA do Painel, logo abaixo das métricas
// (ver ClientPanelView.tsx; no celular, uma coluna só, aparece depois das
// métricas e antes da lista de Agendamentos, por estar ANTES dela no JSX
// da coluna esquerda). Lista vertical compacta (trocou o carrossel
// horizontal de cards — ficavam pequenos/cortados) — uma linha enxuta por
// paciente: avatar pequeno, nome, @ (link pro perfil só nas linhas de
// Instagram — pedido explícito; nas de WhatsApp fica texto puro) e o botão
// de ação alinhado à direita, de acordo com o CANAL daquele período (ver
// REACTIVATION_CHANNEL_BY_THRESHOLD em reactivation.ts).
//
// Decisão explícita (pedido do usuário): só o canal WhatsApp passou a
// ENVIAR de verdade pelo clique do botão (ver sendWhatsappAction) — o
// Instagram continua copiar + abrir, envio manual, sem mudança nenhuma.
export function ReactivationRail({
  cards,
  action = toggleReactivationCardSentClientAction,
  sendWhatsappAction = sendReactivationWhatsAppMessageClientAction,
}: {
  cards: ReactivationCard[];
  action?: (appointmentId: string, thresholdDays: number) => Promise<unknown>;
  sendWhatsappAction?: (appointmentId: string, thresholdDays: number) => Promise<SendReactivationWhatsAppResult>;
}) {
  const [localCards, setLocalCards] = useState(cards);
  useEffect(() => setLocalCards(cards), [cards]);

  // Só pro canal WhatsApp: quais cards estão com o envio em andamento
  // (botão desabilitado, texto "Enviando…"), o aviso discreto atual de
  // cada card (se algum) e quais cards já caíram de volta pro fluxo
  // manual de antes (ver reason "disconnected" em handleSendWhatsapp) —
  // todos mapeados por cardSlotKey, mesma chave usada no resto do sistema
  // pra identificar (appointmentId, thresholdDays).
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

  // Alterna a marcação de enviado — usada em DOIS lugares: o "✓" de
  // desfazer (nunca desfaz a mensagem já enviada, pedido explícito, só
  // limpa a marcação no Painel) e o botão de WhatsApp quando já caiu pro
  // fluxo manual de antes (useManualFallback — abrir o wa.me manualmente
  // conta como "enviado" no Painel, igual sempre contou antes deste
  // ajuste). Otimista: alterna sentAt local na hora (toggle, igual à
  // lógica do servidor, ver toggleReactivationSentAt em reactivation.ts) e
  // só então chama a server action; se ela falhar, desfaz a atualização
  // otimista (alternar de novo devolve exatamente ao valor anterior, já
  // que toggle é sua própria inversa).
  function handleToggleSent(appointmentId: string, thresholdDays: number) {
    const now = new Date();
    const applyToggle = (list: ReactivationCard[]) =>
      list.map((c) =>
        c.appointmentId === appointmentId && c.thresholdDays === thresholdDays
          ? { ...c, sentAt: c.sentAt ? null : now }
          : c
      );

    setLocalCards(applyToggle);
    action(appointmentId, thresholdDays).catch((err) => {
      console.error("[vexo] Falha ao marcar/desmarcar card de Reativação como enviado:", err);
      setLocalCards(applyToggle);
    });
  }

  // Clique no botão de ação de um card de Instagram — ainda só copia +
  // abre (sem mudança), mas marca o card como enviado no Painel (mesmo
  // toggle de sempre, nunca manda mensagem nenhuma pelo VEXO).
  function handleInstagramSent(appointmentId: string, thresholdDays: number) {
    const now = new Date();
    setLocalCards((prev) =>
      prev.map((c) => (c.appointmentId === appointmentId && c.thresholdDays === thresholdDays ? { ...c, sentAt: now } : c))
    );
    action(appointmentId, thresholdDays).catch((err) => {
      console.error("[vexo] Falha ao marcar card de Reativação (Instagram) como enviado:", err);
    });
  }

  // Clique no botão de ação de um card de WhatsApp — ENVIA de verdade pela
  // conexão da clínica (pedido explícito, decisão já tomada). Um clique =
  // uma chamada = uma mensagem; nunca reenvia enquanto já está "Enviando…"
  // pra este mesmo card (guarda local, além da reserva atômica do
  // servidor — ver sendReactivationWhatsAppMessage, reactivation.ts).
  // Nunca marca como enviado otimisticamente ANTES da resposta — aqui,
  // diferente do toggle, só confirma sentAt depois do servidor confirmar
  // que o envio deu certo.
  async function handleSendWhatsapp(card: ReactivationCard) {
    const key = cardSlotKey(card.appointmentId, card.thresholdDays);
    if (sendingKeys.has(key)) return;

    setSendingKeys((prev) => new Set(prev).add(key));
    try {
      const result = await sendWhatsappAction(card.appointmentId, card.thresholdDays);
      if (result.ok) {
        const sentAt = new Date();
        setLocalCards((prev) =>
          prev.map((c) =>
            c.appointmentId === card.appointmentId && c.thresholdDays === card.thresholdDays ? { ...c, sentAt } : c
          )
        );
        return;
      }

      if (result.reason === "disconnected") {
        setManualFallbackKeys((prev) => new Set(prev).add(key));
      }
      showNotice(key, noticeForFailure(result.reason));
    } catch (err) {
      console.error("[vexo] Falha ao enviar WhatsApp da Reativação:", err);
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
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-vexo-success" />
          <h2 className="text-xs font-semibold text-vexo-fg">Reativação</h2>
        </div>
        <span className="text-caption text-vexo-muted">{pendingCountLabel(pendingCount)}</span>
      </div>
      <div className={`space-y-1.5 ${needsScroll ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
        {sortedCards.map((card) => {
          const isSent = Boolean(card.sentAt);
          const key = cardSlotKey(card.appointmentId, card.thresholdDays);
          const isSending = sendingKeys.has(key);
          const notice = notices.get(key);
          const useManualFallback = manualFallbackKeys.has(key);

          return (
            <div
              key={key}
              className={`flex items-center gap-2 rounded-lg border border-vexo-border bg-vexo-surface p-2 transition-opacity duration-150 ${isSent ? "opacity-50" : ""}`}
            >
              <LeadAvatar profilePictureUrl={card.profilePictureUrl} name={card.name} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1">
                  <p className="min-w-0 shrink truncate text-xs font-medium">{card.name}</p>
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
                <p className="truncate text-caption text-vexo-muted">{card.thresholdDays} dias</p>
              </div>

              {isSent ? (
                <button
                  type="button"
                  title="Desfazer"
                  aria-label="Desfazer envio"
                  onClick={() => handleToggleSent(card.appointmentId, card.thresholdDays)}
                  className={REACTIVATION_UNDO_BUTTON_CLASS}
                >
                  ✓
                </button>
              ) : card.channel === "WHATSAPP" ? (
                !card.whatsappLink ? (
                  <span className="shrink-0 text-caption text-vexo-muted">Sem WhatsApp</span>
                ) : (
                  <div className="relative shrink-0">
                    {useManualFallback ? (
                      // Desconectado uma vez nesta sessão — volta pro
                      // fluxo manual de sempre (abre o wa.me já
                      // preenchido, a clínica manda pelo próprio app).
                      <a
                        href={card.whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => handleToggleSent(card.appointmentId, card.thresholdDays)}
                        className={WHATSAPP_ACTION_BUTTON_CLASS}
                      >
                        <WhatsAppMonoIcon className="h-3 w-3" />
                        WhatsApp
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSendWhatsapp(card)}
                        className={WHATSAPP_ACTION_BUTTON_CLASS}
                      >
                        <WhatsAppMonoIcon className="h-3 w-3" />
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
                <InstagramDmButton
                  message={card.message}
                  dmLink={card.instagramDmLink}
                  onSent={() => handleInstagramSent(card.appointmentId, card.thresholdDays)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

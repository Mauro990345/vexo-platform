"use client";

import { useEffect, useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppMonoIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { WHATSAPP_ACTION_BUTTON_CLASS, REACTIVATION_UNDO_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
import { toggleReactivationCardSentClientAction } from "@/app/dashboard/actions";
import { sortReactivationCardsForDisplay, countPendingReactivationCards, type ReactivationCard } from "@/lib/reactivation";

function pendingCountLabel(n: number): string {
  return n === 1 ? "1 pendente" : `${n} pendentes`;
}

// Acima de ~6 linhas a lista ganha rolagem INTERNA (nunca horizontal) —
// mesma altura aproximada de 6 linhas compactas + espaçamento.
const SCROLL_THRESHOLD = 6;

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
export function ReactivationRail({
  cards,
  action = toggleReactivationCardSentClientAction,
}: {
  cards: ReactivationCard[];
  action?: (appointmentId: string, thresholdDays: number) => Promise<unknown>;
}) {
  const [localCards, setLocalCards] = useState(cards);
  useEffect(() => setLocalCards(cards), [cards]);

  if (localCards.length === 0) return null;

  // Clique no botão de ação (WhatsApp/Instagram) OU no "✓" de desfazer —
  // os dois chamam isto, só variando QUAL card. Otimista: atualiza a tela
  // na hora (alterna sentAt local — toggle, igual à lógica do servidor,
  // ver toggleReactivationSentAt em reactivation.ts) e só então chama a
  // server action; se ela falhar, desfaz a atualização otimista (alternar
  // de novo devolve exatamente ao valor anterior, já que toggle é sua
  // própria inversa) — nunca deixa a tela mentir sobre o que foi salvo de
  // verdade.
  function handleToggle(appointmentId: string, thresholdDays: number) {
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
          return (
            <div
              key={`${card.appointmentId}-${card.thresholdDays}`}
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
                  onClick={() => handleToggle(card.appointmentId, card.thresholdDays)}
                  className={REACTIVATION_UNDO_BUTTON_CLASS}
                >
                  ✓
                </button>
              ) : card.channel === "WHATSAPP" ? (
                card.whatsappLink ? (
                  <a
                    href={card.whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => handleToggle(card.appointmentId, card.thresholdDays)}
                    className={WHATSAPP_ACTION_BUTTON_CLASS}
                  >
                    <WhatsAppMonoIcon className="h-3 w-3" />
                    WhatsApp
                  </a>
                ) : (
                  <span className="shrink-0 text-caption text-vexo-muted">Sem WhatsApp</span>
                )
              ) : (
                <InstagramDmButton
                  message={card.message}
                  dmLink={card.instagramDmLink}
                  onSent={() => handleToggle(card.appointmentId, card.thresholdDays)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

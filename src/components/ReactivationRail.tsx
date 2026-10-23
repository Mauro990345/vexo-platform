import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppMonoIcon } from "@/components/BrandIcons";
import { InstagramDmButton } from "@/components/InstagramDmButton";
import { WHATSAPP_ACTION_BUTTON_CLASS } from "@/components/ReactivationActionButtonStyle";
import type { ReactivationCard } from "@/lib/reactivation";

function patientsCountLabel(n: number): string {
  return n === 1 ? "1 paciente esta semana" : `${n} pacientes esta semana`;
}

// Acima de ~6 linhas a lista ganha rolagem INTERNA (nunca horizontal) —
// mesma altura aproximada de 6 linhas compactas + espaçamento.
const SCROLL_THRESHOLD = 6;

// Faixa "Reativação" — coluna ESQUERDA do Painel, logo abaixo das métricas
// (ver ClientPanelView.tsx; no celular, uma coluna só, aparece depois das
// métricas e antes da lista de Agendamentos, por estar ANTES dela no JSX
// da coluna esquerda). Lista vertical compacta (trocou o carrossel
// horizontal de cards — ficavam pequenos/cortados) — uma linha enxuta por
// paciente: avatar pequeno, nome, @ (link pro perfil só nas linhas de
// Instagram — pedido explícito; nas de WhatsApp fica texto puro) e o botão
// de ação alinhado à direita, de acordo com o CANAL daquele período (ver
// REACTIVATION_CHANNEL_BY_THRESHOLD em reactivation.ts).
export function ReactivationRail({ cards }: { cards: ReactivationCard[] }) {
  if (cards.length === 0) return null;

  const needsScroll = cards.length > SCROLL_THRESHOLD;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-vexo-success" />
          <h2 className="text-xs font-semibold text-vexo-fg">Reativação</h2>
        </div>
        <span className="text-caption text-vexo-muted">{patientsCountLabel(cards.length)}</span>
      </div>
      <div className={`space-y-1.5 ${needsScroll ? "max-h-72 overflow-y-auto pr-1" : ""}`}>
        {cards.map((card) => (
          <div
            key={`${card.appointmentId}-${card.thresholdDays}`}
            className="flex items-center gap-2 rounded-lg border border-vexo-border bg-vexo-surface p-2"
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

            {card.channel === "WHATSAPP" ? (
              card.whatsappLink ? (
                <a href={card.whatsappLink} target="_blank" rel="noreferrer" className={WHATSAPP_ACTION_BUTTON_CLASS}>
                  <WhatsAppMonoIcon className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              ) : (
                <span className="shrink-0 text-caption text-vexo-muted">Sem WhatsApp</span>
              )
            ) : (
              <InstagramDmButton message={card.message} dmLink={card.instagramDmLink} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

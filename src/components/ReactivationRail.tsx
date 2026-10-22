import { LeadAvatar } from "@/components/LeadAvatar";
import { WhatsAppGlyphIcon } from "@/components/BrandIcons";
import type { ReactivationCard } from "@/lib/reactivation";

function patientsCountLabel(n: number): string {
  return n === 1 ? "1 paciente esta semana" : `${n} pacientes esta semana`;
}

// Faixa "Reativação", abaixo das métricas/lista de Agendamentos do Painel
// (ver ClientPanelView.tsx) — pacientes cujo agendamento da IA completou o
// prazo configurado (Automações, ver ReactivationConfig) sem retorno. Sem
// limite de cards: rolável horizontalmente (nunca empilha/quebra linha,
// diferente de NeedsHumanBanner — aqui não existe conceito de "+N"/expandir).
//
// Botão "WhatsApp" abre o wa.me com a mensagem já preenchida — a secretária
// decide se envia; nada aqui dispara mensagem sozinho. Sem o @ como LINK
// pro Instagram (diferente do mini card de NeedsHumanBanner, que este se
// inspira no estilo): aqui o contato é sempre pelo botão de WhatsApp.
export function ReactivationRail({ cards }: { cards: ReactivationCard[] }) {
  if (cards.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-caption font-medium uppercase tracking-wide text-vexo-muted">Reativação</h2>
        <span className="text-caption text-vexo-muted">{patientsCountLabel(cards.length)}</span>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {cards.map((card) => (
          <div
            key={card.appointmentId}
            className="flex w-36 shrink-0 flex-col items-center gap-1.5 rounded-lg border border-vexo-border bg-vexo-surface p-2.5 text-center"
          >
            <LeadAvatar profilePictureUrl={card.profilePictureUrl} name={card.name} size="md" />
            <p className="w-full truncate text-xs font-medium">{card.name}</p>
            {card.igUsername && <p className="w-full truncate text-caption text-vexo-muted">@{card.igUsername}</p>}
            {card.whatsappLink ? (
              <a
                href={card.whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-vexo-success px-2 py-1.5 text-caption font-semibold text-vexo-bg hover:opacity-90"
              >
                <WhatsAppGlyphIcon className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            ) : (
              <p className="mt-1 text-caption text-vexo-muted">Sem WhatsApp salvo</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

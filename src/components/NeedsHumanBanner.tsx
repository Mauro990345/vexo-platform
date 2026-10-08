"use client";

import { useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";

// Faixa compacta no topo da coluna "Agendamentos" do Painel do cliente —
// mostra quem precisa de atendimento humano (Conversation.status ===
// NEEDS_HUMAN) sem poluir a lista de agendamentos. Pedido explícito:
// nada de motivo nem telefone aqui — só o suficiente pra a secretária
// reconhecer o lead e abrir a conversa direto no Instagram.
//
// Até 3 mini cards lado a lado, dentro de UM único card (mesma borda/fundo
// dos cards de agendamento, ver ClientPanelView) — os três juntos ocupam a
// altura de um card de agendamento normal, não um card cada. Com mais de 3,
// o terceiro espaço vira "+N" (N = quantos ainda não apareceram); tocar
// nele expande a faixa pra mostrar todos, no mesmo formato de mini card —
// a partir daí a faixa cresce normalmente (a altura de "um card" só vale
// pro estado padrão, fechado).
export type NeedsHumanLead = {
  conversationId: string;
  primary: string;
  profilePictureUrl: string | null;
  igUsername: string | null;
};

const MAX_VISIBLE_COLLAPSED = 3;

function MiniCard({ lead }: { lead: NeedsHumanLead }) {
  // Sem igUsername (lead ainda não passou pelo lookup/backfill do @ real —
  // ver usernameLookupAttempted, schema.prisma) não tem link possível: mesmo
  // visual, só sem comportamento de link (sem href, sem hover).
  const href = lead.igUsername ? `https://www.instagram.com/${lead.igUsername}/` : undefined;
  const Wrapper = href ? "a" : "div";

  return (
    <Wrapper
      {...(href ? { href, target: "_blank", rel: "noreferrer" } : {})}
      className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-1 text-center hover:bg-vexo-surface2"
    >
      <LeadAvatar profilePictureUrl={lead.profilePictureUrl} name={lead.primary} size="sm" />
      <span className="w-full truncate text-caption font-medium leading-tight">{lead.primary}</span>
      <span className="inline-flex items-center rounded-full bg-vexo-error/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-vexo-error">
        Humano
      </span>
    </Wrapper>
  );
}

export function NeedsHumanBanner({ leads }: { leads: NeedsHumanLead[] }) {
  const [expanded, setExpanded] = useState(false);

  if (leads.length === 0) return null;

  const showOverflowTile = !expanded && leads.length > MAX_VISIBLE_COLLAPSED;
  // Com overflow, só 2 mini cards reais cabem no terceiro espaço reservado
  // pro "+N" — sem overflow, mostra todos (1, 2 ou os 3 que couberem).
  const visible = showOverflowTile ? leads.slice(0, MAX_VISIBLE_COLLAPSED - 1) : leads;
  const overflowCount = leads.length - visible.length;

  return (
    <div className="rounded-lg border border-vexo-border bg-vexo-surface p-2">
      <div className={expanded ? "flex flex-wrap gap-1" : "flex gap-1"}>
        {visible.map((lead) => (
          <div key={lead.conversationId} className={expanded ? "w-20" : "min-w-0 flex-1"}>
            <MiniCard lead={lead} />
          </div>
        ))}
        {showOverflowTile && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 py-1 text-center hover:bg-vexo-surface2"
            aria-label={`Mostrar mais ${overflowCount} conversas que precisam de atendimento humano`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-vexo-border bg-vexo-surface2 text-caption font-semibold">
              +{overflowCount}
            </span>
            <span className="w-full truncate text-caption font-medium leading-tight text-vexo-muted">ver mais</span>
          </button>
        )}
      </div>
    </div>
  );
}

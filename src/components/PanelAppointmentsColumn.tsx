"use client";

import { useState } from "react";
import { LeadAvatar } from "@/components/LeadAvatar";
import { AppointmentStatusBadge } from "@/components/AppointmentStatusBadge";
import { NoShowButton } from "@/components/NoShowButton";
import { RetornoButton, type RetornoAction } from "@/components/RetornoButton";
import { OverflowMenu } from "@/components/OverflowMenu";
import { Button } from "@/components/Button";
import { NeedsHumanBanner, type NeedsHumanLead } from "@/components/NeedsHumanBanner";
import { normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";
import { ACTIONABLE_STATUSES } from "@/lib/panel-appointments";

export type PanelAppointmentItem = {
  id: string;
  scheduledAt: Date;
  status: string;
  displayStatus: string;
  leadId: string | null;
  primary: string;
  handle: string | null;
  profilePictureUrl: string | null;
  phone: string | null;
  returnPeriodDays: number | null;
  locked: boolean;
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Coluna "Agendamentos" do Painel do cliente (item 4 da reorganização, ver
// docs/design-audit.md) — "Próximos" (hoje e futuros, SEMPRE visível,
// mesmo vazio — nesse caso uma linha discreta "Sem agendamentos
// próximos", nunca mais a caixa grande "Nenhum agendamento ainda" de
// antes, que confundia porque o Histórico já existe logo abaixo), depois
// "Aguardando resposta" (passados que ainda pedem Compareceu/Não
// compareceu, só aparece quando há algum); o histórico de atendidos/
// faltados (ver groupAppointmentsForPanel, panel-appointments.ts) fica
// atrás de um link "Histórico (N)", recolhido por padrão. Cada item é um
// cartão leve/separado (ajuste explícito — fundo sutil, borda fina, ~8px
// de espaço entre eles via `space-y-2`); uma ação visível por linha, a
// secundária ("Não compareceu", quando os dois botões se aplicam ao mesmo
// agendamento) fica num menu "⋯" (ver OverflowMenu.tsx). "use client" só
// pelo toggle do histórico — cada linha em si usa os mesmos componentes
// client de sempre (NoShowButton/RetornoButton), sem nenhuma mudança de
// comportamento.
export function PanelAppointmentsColumn({
  upcoming,
  awaitingResponse,
  history,
  needsHumanLeads,
  availableReturnPeriods,
  noShowAction,
  returnPeriodAction,
}: {
  upcoming: PanelAppointmentItem[];
  awaitingResponse: PanelAppointmentItem[];
  history: PanelAppointmentItem[];
  needsHumanLeads: NeedsHumanLead[];
  availableReturnPeriods: number[];
  noShowAction?: (appointmentId: string, status: "COMPLETED" | "NO_SHOW") => Promise<unknown>;
  returnPeriodAction?: RetornoAction;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  function renderRow(a: PanelAppointmentItem) {
    const showRetorno = a.displayStatus === "COMPLETED" && Boolean(a.leadId);
    const showNoShow = ACTIONABLE_STATUSES.includes(a.status);

    return (
      // Cada linha volta a ser um cartão leve e separado (pedido explícito
      // do ajuste pós-reorganização — fundo sutil, borda fina), não mais
      // uma linha dentro de um bloco único com divide-y; o espaçamento
      // entre cartões (~8px) vem do `space-y-2` do container-pai.
      //
      // `relative`: contexto de posicionamento do popover do botão "Retorno"
      // SÓ CELULAR (ver RetornoButton.tsx, `sm:relative` no wrapper do botão,
      // não mais `relative` sem prefixo) — sem isso o popover (position:
      // absolute, w-[calc(100%-16px)]) não teria nenhum ancestral
      // posicionado próximo e acabaria relativo à viewport. Em desktop
      // (`sm:relative`) o próprio wrapper do botão já ancora primeiro, então
      // isto aqui fica inofensivo (sem top/left, só estabelece o contexto).
      <div key={a.id} className="relative flex items-center gap-2.5 rounded-control border border-vexo-border bg-vexo-surface p-2.5">
        <LeadAvatar profilePictureUrl={a.profilePictureUrl} name={a.primary} size="appointment" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{a.primary}</p>
            {a.handle && <span className="max-w-[40%] shrink-0 truncate text-caption text-vexo-muted">@{a.handle}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-caption text-vexo-muted">
            <span className="shrink-0">{formatDateTime(a.scheduledAt)} ·</span>
            <AppointmentStatusBadge status={a.displayStatus} compact />
            {a.phone && (
              <span className="inline-flex shrink-0 items-center gap-1">
                <span>·</span>
                <a href={`https://wa.me/${normalizeBrazilianWhatsappNumber(a.phone)}`} target="_blank" rel="noreferrer" className="text-vexo-accent hover:underline">
                  {a.phone}
                </a>
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showRetorno && (
            <RetornoButton appointmentId={a.id} availablePeriods={availableReturnPeriods} returnPeriodDays={a.returnPeriodDays} locked={a.locked} action={returnPeriodAction} />
          )}
          {showNoShow && showRetorno ? (
            <OverflowMenu label="Mais ações deste agendamento">
              <NoShowButton appointmentId={a.id} status={a.status} action={noShowAction} />
            </OverflowMenu>
          ) : (
            showNoShow && <NoShowButton appointmentId={a.id} status={a.status} action={noShowAction} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-vexo-accent" />
        <h2 className="text-sm font-semibold">Agendamentos</h2>
      </div>
      <NeedsHumanBanner leads={needsHumanLeads} />

      {/* "Próximos" com rótulo próprio (pedido explícito — antes "Nenhum
          agendamento ainda" aparecia sem contexto, confundindo com o
          Histórico que existe logo abaixo); vazio = linha discreta, nunca
          mais uma caixa grande. Rótulo neutro, igual ao de "Para fazer
          hoje" (ReactivationRail.tsx) — nunca vermelho. */}
      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Próximos</p>
        {upcoming.length > 0 ? (
          <div className="mt-1.5 space-y-2">{upcoming.map(renderRow)}</div>
        ) : (
          <p className="mt-1.5 text-caption text-vexo-muted">Sem agendamentos próximos</p>
        )}
      </div>

      {awaitingResponse.length > 0 && (
        <div>
          <p className="text-caption font-semibold uppercase tracking-wide text-vexo-muted">Aguardando resposta</p>
          <div className="mt-1.5 space-y-2">{awaitingResponse.map(renderRow)}</div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setHistoryOpen((o) => !o)}>
            {historyOpen ? "Ocultar histórico" : `Histórico (${history.length})`}
          </Button>
          {historyOpen && <div className="mt-2 space-y-2">{history.map(renderRow)}</div>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarArrowUp } from "lucide-react";
import { setAppointmentReturnPeriodClientAction } from "@/app/dashboard/actions";
import type { SetAppointmentReturnPeriodResult } from "@/lib/appointments";
import { MOBILE_SECONDARY_TEXT, MOBILE_ICON_SIZE, MOBILE_TOGGLE_BUTTON_MIN, MOBILE_INLINE_GAP } from "@/components/MobileCardScale";

// Botão "Retorno" do card de agendamento atendido (item 2 do pedido) —
// SEMPRE visível com ícone + texto (nunca só ícone, nunca dependente de
// hover, pedido explícito). Clique abre um painel escuro compacto, linha
// horizontal (que quebra só se não couber, ver comentário na grade
// abaixo — pedido explícito, 2026-10-29) com os prazos DISPONÍVEIS da
// clínica (ver ReactivationConfig.availablePeriods) + "Sem retorno" —
// seleção única, a escolhida fica destacada. Guarda só o NÚMERO de dias
// (ou "nenhum"), nunca texto livre nem dado clínico (LGPD, ver
// setAppointmentReturnPeriod, appointments.ts).
//
// Otimista (igual a NoShowButton/ReactivationRail): atualiza a aparência
// do botão na hora do clique, desfaz se o servidor rejeitar (ex.: card já
// enviado — ver `locked` abaixo, que já evita a maioria dos casos
// desabilitando o botão antes mesmo do clique).
export function RetornoButton({
  appointmentId,
  availablePeriods,
  returnPeriodDays,
  returnPeriodNone,
  locked,
  action = setAppointmentReturnPeriodClientAction,
}: {
  appointmentId: string;
  availablePeriods: number[];
  returnPeriodDays: number | null;
  returnPeriodNone: boolean;
  // true quando algum card de Reativação deste agendamento já foi
  // enviado — o prazo fica travado (ver setAppointmentReturnPeriod,
  // "pode trocar enquanto o envio não ocorreu").
  locked: boolean;
  // Injetável — este componente também é usado pela visão "Ver painel de
  // [clínica]" do CRM interno (ClientPanelView, ver comentário grande no
  // topo desse arquivo sobre noShowAction) — lá quem clica é um admin/
  // staff, sem sessão CLIENT, então o padrão (setAppointmentReturnPeriodClientAction,
  // que exige requireClientSession) sempre falharia; essa tela passa a
  // ação interna equivalente (setAppointmentReturnPeriodAction,
  // crm/clinicas/actions.ts) no lugar.
  action?: (appointmentId: string, selection: number | "none") => Promise<SetAppointmentReturnPeriodResult>;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [localDays, setLocalDays] = useState(returnPeriodDays);
  const [localNone, setLocalNone] = useState(returnPeriodNone);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handlePick(selection: number | "none") {
    const prevDays = localDays;
    const prevNone = localNone;
    if (selection === "none") {
      setLocalNone(true);
      setLocalDays(null);
    } else {
      setLocalNone(false);
      setLocalDays(selection);
    }
    setOpen(false);

    startTransition(async () => {
      const result = await action(appointmentId, selection);
      if (!result.ok) {
        // "already_sent" na corrida (enviado entre o painel abrir e o
        // clique) ou qualquer outra falha — desfaz a troca otimista.
        setLocalNone(prevNone);
        setLocalDays(prevDays);
      }
    });
  }

  const marked = localNone || localDays != null;
  const label = localNone ? "Sem retorno" : localDays != null ? `Retorno · ${localDays} dias` : "Retorno";

  return (
    <div className="relative shrink-0">
      {/* SÓ CELULAR (abaixo de sm/640px — pedido explícito, "Retorno" é um
          dos botões de ação citados, ver MobileCardScale.ts): piso de
          toque de 40px de altura E largura (min-h/min-w, texto varia
          entre "Retorno"/"Retorno · N dias"), ícone 12px -> 15px, texto
          10px -> 15px, padding 8px/4px -> 12px/6px. `sm:` com os valores
          de sempre. */}
      <button
        type="button"
        title={locked ? "Já enviado — prazo não pode mais ser alterado" : undefined}
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={locked}
        className={`inline-flex items-center justify-center ${MOBILE_TOGGLE_BUTTON_MIN} ${MOBILE_INLINE_GAP} rounded-lg border px-[12px] py-[6px] sm:px-2 sm:py-1 ${MOBILE_SECONDARY_TEXT} font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
          marked
            ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent"
            : "border-vexo-border text-vexo-muted hover:border-vexo-accent/50"
        }`}
      >
        <CalendarArrowUp className={`${MOBILE_ICON_SIZE} shrink-0`} strokeWidth={2.5} />
        {label}
      </button>

      {open && (
        <>
          {/* Camada transparente, só pra fechar no clique fora — o painel
              em si (abaixo) não é um modal de tela cheia, é um popover
              compacto ancorado no botão (pedido explícito: "painel escuro
              compacto"). */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Painel do seletor — texto/padding também escalados no celular
              (mesma MOBILE_SECONDARY_TEXT do botão acima), largura um
              pouco maior pra acompanhar sem apertar os chips de 3 colunas. */}
          <div className="absolute right-0 top-full z-50 mt-1 w-[220px] sm:w-[200px] rounded-xl border border-vexo-border bg-vexo-surface2 p-[12px] sm:p-2.5 shadow-card">
            <p className={`mb-2 ${MOBILE_SECONDARY_TEXT} font-medium text-vexo-muted`}>Prazo de retorno</p>
            {availablePeriods.length > 0 && (
              // SÓ CELULAR: linha horizontal que QUEBRA (flex-wrap), não
              // grade fixa de 3 colunas (pedido explícito, 2026-10-29, 2ª
              // rodada: "lado a lado, numa única linha horizontal,
              // esticados na largura disponível, só quebram se realmente
              // não couber" — uma grade de colunas fixas não "estica" pra
              // preencher a largura nem se adapta à contagem de prazos,
              // que pode chegar a 9; cada botão com flex-1 + min-w garante
              // que eles se esticam uniformemente na linha e só formam
              // uma linha nova quando o conjunto atual não cabe mais). Em
              // >=640px volta a ser a grade de 3 colunas de sempre
              // (sm:grid sm:grid-cols-3) — essa grade nunca teve uma
              // versão separada "só desktop", então pra não mudar nada em
              // telas >=640px o revert precisa ser explícito aqui (não dá
              // pra só adicionar as classes de celular sem prefixo, como
              // no resto do Painel).
              <div className="flex flex-wrap gap-[7px] sm:grid sm:grid-cols-3 sm:gap-1.5">
                {availablePeriods.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => handlePick(days)}
                    className={`flex-1 min-w-[44px] sm:min-w-0 sm:flex-none rounded-md border px-[9px] py-[6px] sm:px-1.5 sm:py-1 ${MOBILE_SECONDARY_TEXT} font-medium transition ${
                      !localNone && localDays === days
                        ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent"
                        : "border-vexo-border text-vexo-muted hover:border-vexo-accent/50"
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => handlePick("none")}
              className={`mt-[9px] sm:mt-1.5 w-full rounded-md border px-[9px] py-[6px] sm:px-1.5 sm:py-1 ${MOBILE_SECONDARY_TEXT} font-medium transition ${
                localNone
                  ? "border-vexo-error/50 bg-vexo-error/10 text-vexo-error"
                  : "border-vexo-border text-vexo-muted hover:border-vexo-error/40"
              }`}
            >
              Sem retorno
            </button>
          </div>
        </>
      )}
    </div>
  );
}

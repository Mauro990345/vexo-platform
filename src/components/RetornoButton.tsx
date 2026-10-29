"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarArrowUp } from "lucide-react";
import { setAppointmentReturnPeriodClientAction } from "@/app/dashboard/actions";
import type { SetAppointmentReturnPeriodResult } from "@/lib/appointments";
import { MOBILE_APPOINTMENT_SECONDARY_TEXT, MOBILE_APPOINTMENT_BUTTON_ICON_SIZE, MOBILE_TOGGLE_BUTTON_MIN, MOBILE_INLINE_GAP } from "@/components/MobileCardScale";

export type RetornoSelection = number | "none" | "unset";
export type RetornoAction = (appointmentId: string, selection: RetornoSelection) => Promise<SetAppointmentReturnPeriodResult>;

// Linha de prazos + botão "Sem retorno" do popover — extraída num
// componente PRÓPRIO (2026-10-29, 4ª rodada) só pra poder renderizar e
// medir no DOM real sem precisar simular o clique que abre o popover
// (ver RetornoButton.layout.test.ts, que importa isto direto e monta com
// react-dom/server + o CSS compilado de verdade, igual o app renderiza).
// Sem nenhuma lógica de estado própria — só recebe o estado atual e avisa
// o pai do clique (mesmo padrão "burro" de sempre nesse arquivo).
//
// AJUSTE (2026-10-29, 4ª rodada, pedido explícito — "está quadrado/em
// grade pela 4ª vez"): a causa real era a LARGURA do painel, não o
// flex-wrap em si — RetornoButton.tsx ancorava o popover num <div> do
// tamanho do botão gatilho (~w-[220px] fixo), bem mais estreito que o
// card; com 9 prazos + um piso de largura mínima por botão
// (min-w-[44px], pensado como proteção contra texto cortado), só cabiam
// 3 por linha physicamente (3×44px + gaps já passava dos ~194px úteis
// daquela largura estreita) — sempre uma grade 3×3, por mais que a classe
// fosse `flex flex-wrap`, não `grid`. A correção de verdade é estrutural
// (ver o `<div className="relative ...">` vs `sm:relative` no componente
// pai abaixo): o popover passa a ocupar a largura do CARD inteiro (bem
// mais larga), e aqui o piso de largura mínima cai pra 28px — medido no
// DOM real: é o menor valor em que "120d"/"270d" ainda renderizam
// legíveis, sem os dígitos encostando no botão vizinho. Com mais espaço
// disponível, flex-1 consegue esticar os 9 botões numa linha só em
// 375px+; só quebra de verdade (2 linhas) em 320px, onde 9×28px + gaps
// de fato não cabem (ver teste de layout, que mede isso no DOM real).
export function ReturnPeriodOptions({
  availablePeriods,
  localDays,
  localNone,
  onPick,
}: {
  availablePeriods: number[];
  localDays: number | null;
  localNone: boolean;
  onPick: (selection: number | "none") => void;
}) {
  return (
    <>
      {availablePeriods.length > 0 && (
        <div className="flex flex-wrap gap-[5px] sm:grid sm:grid-cols-3 sm:gap-1.5">
          {availablePeriods.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => onPick(days)}
              // Altura ~34px (pedido explícito) via h- fixo, não só
              // padding — garante o valor exato independente do texto
              // ("30d" vs "270d"). flex-1 estica os botões igualmente na
              // linha; min-w-[28px] é o piso que decide a quebra (ver
              // comentário acima). max-w-[48px] evita que, nos 2 botões
              // que sobram numa eventual segunda linha (320px), o
              // flex-1 os estique até ~124px (cada linha do flex-wrap
              // distribui o espaço sobrando só entre os itens DAQUELA
              // linha) — com o teto, eles ficam do mesmo tamanho dos
              // demais e a linha sobrando alinha à esquerda.
              className={`flex h-[34px] min-w-[28px] max-w-[48px] flex-1 items-center justify-center rounded-md border px-[4px] sm:h-auto sm:min-w-0 sm:max-w-none sm:flex-none sm:px-1.5 sm:py-1 ${MOBILE_APPOINTMENT_SECONDARY_TEXT} font-medium transition ${
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
        onClick={() => onPick("none")}
        className={`mt-[6px] sm:mt-1.5 h-[34px] w-full rounded-md border px-[9px] sm:h-auto sm:px-1.5 sm:py-1 ${MOBILE_APPOINTMENT_SECONDARY_TEXT} font-medium transition ${
          localNone
            ? "border-vexo-error/50 bg-vexo-error/10 text-vexo-error"
            : "border-vexo-border text-vexo-muted hover:border-vexo-error/40"
        }`}
      >
        Sem retorno
      </button>
    </>
  );
}

// Botão "Retorno" do card de agendamento atendido (item 2 do pedido) —
// SEMPRE visível com ícone + texto (nunca só ícone, nunca dependente de
// hover, pedido explícito). Clique abre um painel escuro compacto, linha
// horizontal de prazos DISPONÍVEIS da clínica (ver
// ReactivationConfig.availablePeriods) + "Sem retorno" — seleção única, a
// escolhida fica destacada. Guarda só o NÚMERO de dias (ou "nenhum"),
// nunca texto livre nem dado clínico (LGPD, ver setAppointmentReturnPeriod,
// appointments.ts).
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
  action?: RetornoAction;
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

  // AJUSTE (2026-10-29, 4ª rodada, pedido explícito): clicar num prazo já
  // selecionado, ou em "Sem retorno" já selecionado, DESMARCA em vez de
  // reafirmar a mesma escolha (alternância) — volta pro estado inicial
  // ("unset": nenhuma escolha manual, usa os prazos padrão da clínica).
  // Clicar "Sem retorno" depois de já ter um prazo marcado (ex.: 30 dias)
  // troca direto pro estado "Sem retorno" — já limpa o prazo anterior
  // (ver comentário grande em setAppointmentReturnPeriod, appointments.ts,
  // sobre como os cards futuros daquele prazo somem sozinhos na próxima
  // montagem da lista de Reativação, sem precisar apagar nada aqui).
  function handlePick(selection: number | "none") {
    const isTogglingOffPeriod = selection !== "none" && !localNone && localDays === selection;
    const isTogglingOffNone = selection === "none" && localNone;
    const effective: RetornoSelection = isTogglingOffPeriod || isTogglingOffNone ? "unset" : selection;

    const prevDays = localDays;
    const prevNone = localNone;
    if (effective === "unset") {
      setLocalNone(false);
      setLocalDays(null);
    } else if (effective === "none") {
      setLocalNone(true);
      setLocalDays(null);
    } else {
      setLocalNone(false);
      setLocalDays(effective);
    }
    setOpen(false);

    startTransition(async () => {
      const result = await action(appointmentId, effective);
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
    // AJUSTE (2026-10-29, 4ª rodada): `sm:relative` (não mais `relative`
    // sem prefixo) — SÓ CELULAR este wrapper deixa de ser o contexto de
    // posicionamento do popover, pra ele poder "ver através" até o card
    // (que ganhou `relative` em ClientPanelView.tsx) e ocupar a largura
    // do card inteiro, não só a largura deste botão pequeno. Em desktop
    // (`sm:relative`) continua exatamente como sempre foi — popover
    // ancorado neste wrapper, `right-0`/`w-[200px]` de sempre.
    <div className="shrink-0 sm:relative">
      {/* SÓ CELULAR (abaixo de sm/640px): piso de toque de 32px de altura
          E largura (min-h/min-w, texto varia entre "Retorno"/"Retorno ·
          N dias"), ícone/texto 12px, padding 8px/6px. `sm:` com os
          valores de sempre. Contorno AZUL (border-vexo-accent) no estado
          NORMAL (não marcado) — AJUSTE (2026-10-29, 4ª rodada, pedido
          explícito): antes usava o mesmo cinza neutro de "Não
          compareceu" (NoShowButton), os dois ficavam visualmente
          idênticos; agora só "Não compareceu" fica neutro — o contorno
          azul destaca "Retorno" como a ação própria desse botão.
          AJUSTE (2026-10-29, 5ª rodada, pedido explícito "contorno azul
          está forte e aceso demais... minimalista... texto/ícone num
          azul mais suave" — SÓ CELULAR, "em ≥640px nada muda"): contorno
          vai pra border-vexo-accent/45 (dentro do 40-50% pedido, era
          100%) nos DOIS estados (normal e marcado — "vale também pro
          estado 'Sem retorno'", que é só uma variação do estado marcado
          aqui, mesmo branco de código); texto/ícone (antes só azul no
          estado marcado, cinza no normal) vira text-vexo-accent/70 nos
          DOIS estados — um azul suave e CONSISTENTE o tempo todo (não
          mais "acende" de cinza pra azul saturado ao marcar), ainda
          nitidamente diferente do cinza puro de "Não compareceu"
          (NoShowButton, text-vexo-muted). `sm:` reverte border/texto pro
          valor cheio de sempre (border-vexo-accent 100%, text-vexo-accent/
          text-vexo-muted) — desktop pixel/cor-idêntico a antes desta
          rodada. O estado marcado continua com bg-vexo-accent/15 por
          cima (distingue "selecionado" sem precisar de mais saturação no
          texto, inalterado em ambas telas); hover do estado normal
          (bg-vexo-accent/10) não mudou — já era sutil o bastante,
          coerente com o tom novo. */}
      <button
        type="button"
        title={locked ? "Já enviado — prazo não pode mais ser alterado" : undefined}
        onClick={() => !locked && setOpen((o) => !o)}
        disabled={locked}
        className={`inline-flex items-center justify-center ${MOBILE_TOGGLE_BUTTON_MIN} ${MOBILE_INLINE_GAP} rounded-lg border px-[8px] py-[6px] sm:px-2 sm:py-1 ${MOBILE_APPOINTMENT_SECONDARY_TEXT} font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
          marked
            ? "border-vexo-accent/45 bg-vexo-accent/15 text-vexo-accent/70 sm:border-vexo-accent sm:text-vexo-accent"
            : "border-vexo-accent/45 text-vexo-accent/70 hover:bg-vexo-accent/10 sm:border-vexo-accent sm:text-vexo-muted"
        }`}
      >
        <CalendarArrowUp className={`${MOBILE_APPOINTMENT_BUTTON_ICON_SIZE} shrink-0`} strokeWidth={2.5} />
        {label}
      </button>

      {open && (
        <>
          {/* Camada transparente, só pra fechar no clique fora — o painel
              em si (abaixo) não é um modal de tela cheia, é um popover
              compacto ancorado no card (pedido explícito: "painel escuro
              compacto"). */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Painel do seletor — AJUSTE (2026-10-29, 4ª rodada, pedido
              explícito): SÓ CELULAR ocupa a largura do CARD (não mais um
              w-[220px] fixo ancorado no botão), com margem pequena de
              8px nas laterais (left-[8px] right-[8px], relativo ao card
              — ver `sm:relative` acima) — é essa largura maior que dá
              espaço pros 9 prazos caberem numa linha só na maioria das
              telas (ver ReturnPeriodOptions). Em >=640px reverte pro
              popover de sempre: ancorado no botão, right-0, w-[200px]
              fixo, inalterado. */}
          <div className="absolute left-[8px] top-full z-50 mt-[6px] w-[calc(100%-16px)] rounded-xl border border-vexo-border bg-vexo-surface2 p-[8px] shadow-card sm:left-auto sm:right-0 sm:w-[200px] sm:p-2.5">
            <p className={`mb-[6px] ${MOBILE_APPOINTMENT_SECONDARY_TEXT} font-medium text-vexo-muted sm:mb-2`}>Prazo de retorno</p>
            <ReturnPeriodOptions availablePeriods={availablePeriods} localDays={localDays} localNone={localNone} onPick={handlePick} />
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { PanelMetricCard } from "@/components/PanelMetricCard";
import { MOBILE_CHART_TEXT, MOBILE_NAV_BUTTON_MIN, MOBILE_SELECT_PADDING } from "@/components/MobileCardScale";

type PeriodMetrics = { approached: number; responded: number; scheduled: number };
type AttendanceMetrics = { attended: number; pastDue: number };
export type PeriodOption = { days: number; label: string; metrics: PeriodMetrics; attendance: AttendanceMetrics };

// Substitui os dois blocos empilhados "Hoje" / "Últimos 7 dias" (mesmos 3
// cards repetidos duas vezes) por um só, com um SELETOR pra trocar qual
// período os 3 valores mostram — reduz o espaço ocupado e a redundância
// visual. Puramente client-side (sem navegação/query param): todos os
// períodos já vêm calculados do server em uma única visita à página (ver
// PANEL_PERIODS em ClientPanelView.tsx), então trocar é só re-renderizar
// com o outro objeto, sem novo fetch.
//
// Era uma dupla de pills fixas (Hoje/7 dias) — trocado por um <select>
// nativo (não N pills lado a lado) pra caber mais períodos (7/14/21/28
// dias, pedido pra acompanhar um piloto de 21 dias inteiro) sem poluir a
// barra: um <select> já É um dropdown discreto e clicável por natureza,
// sem precisar de nenhum componente de menu customizado pra isso.
export function ApproachMetricsToggle({ periods }: { periods: PeriodOption[] }) {
  const [days, setDays] = useState(periods[0]?.days);
  const current = periods.find((p) => p.days === days) ?? periods[0];

  if (!current) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className={`${MOBILE_CHART_TEXT} font-medium uppercase tracking-wide text-vexo-muted`}>Período</p>
        {/* SÓ CELULAR (ver MobileCardScale.ts): piso de toque de 48px
            (mesmo da navegação de semana — é um controle clicável) e
            texto 15px, igual ao resto do bloco "Abordagens por dia". */}
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={`rounded-full border border-vexo-border bg-vexo-surface2 ${MOBILE_NAV_BUTTON_MIN} ${MOBILE_SELECT_PADDING} ${MOBILE_CHART_TEXT} font-medium outline-none focus:border-vexo-accent`}
        >
          {periods.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <PanelMetricCard label="Abordados" value={String(current.metrics.approached)} />
        <PanelMetricCard label="Em conversa" value={String(current.metrics.responded)} />
        <PanelMetricCard label="Agendaram" value={String(current.metrics.scheduled)} highlight />
        <PanelMetricCard label="Compareceram" value={String(current.attendance.attended)} />
      </div>
    </div>
  );
}

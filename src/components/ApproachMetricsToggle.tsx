"use client";

import { useState } from "react";
import { PanelMetricCard } from "@/components/PanelMetricCard";

type PeriodMetrics = { approached: number; responded: number; scheduled: number };

// Substitui os dois blocos empilhados "Hoje" / "Últimos 7 dias" (mesmos 3
// cards repetidos duas vezes) por um só, com pills pra trocar qual período
// os 3 valores mostram — reduz o espaço ocupado e a redundância visual.
// Puramente client-side (sem navegação/query param): os dois conjuntos de
// métricas já vêm calculados do server em uma única visita à página, então
// alternar é só re-renderizar com o outro objeto, sem novo fetch.
export function ApproachMetricsToggle({
  today,
  last7Days,
}: {
  today: PeriodMetrics;
  last7Days: PeriodMetrics;
}) {
  const [period, setPeriod] = useState<"today" | "week">("today");
  const metrics = period === "today" ? today : last7Days;

  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-0.5 rounded-full border border-vexo-border bg-vexo-surface2 p-0.5">
        <button
          type="button"
          onClick={() => setPeriod("today")}
          className={`rounded-full px-3 py-1 text-caption font-medium transition ${
            period === "today" ? "bg-vexo-accent text-vexo-accentFg" : "text-vexo-muted hover:text-vexo-fg"
          }`}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setPeriod("week")}
          className={`rounded-full px-3 py-1 text-caption font-medium transition ${
            period === "week" ? "bg-vexo-accent text-vexo-accentFg" : "text-vexo-muted hover:text-vexo-fg"
          }`}
        >
          7 dias
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <PanelMetricCard label="Abordados" value={String(metrics.approached)} />
        <PanelMetricCard label="Em conversa" value={String(metrics.responded)} />
        <PanelMetricCard label="Agendaram" value={String(metrics.scheduled)} highlight />
      </div>
    </div>
  );
}

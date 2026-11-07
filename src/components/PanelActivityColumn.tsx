"use client";

import { useState } from "react";
import { ApproachMetricsToggle, type PeriodOption } from "@/components/ApproachMetricsToggle";
import { ReactivationRail, type ReactivationRailProps } from "@/components/ReactivationRail";
import type { ReactivationReturnStat } from "@/lib/reactivation";

// Junta ApproachMetricsToggle (seletor de período + 4 cards) e
// ReactivationRail (faixa de cards) num único Client Component SÓ pra
// compartilhar o período selecionado entre os dois — pedido explícito: a
// linha "N enviadas · M voltaram" no cabeçalho da Reativação precisa
// acompanhar O MESMO seletor dos cards de Abordados/Agendaram, não um
// seletor duplicado nem um query param novo. Nenhum dos dois componentes
// mudou de comportamento isoladamente, só ganharam esse elo (ver
// onPeriodChange em ApproachMetricsToggle e returnMetric em
// ReactivationRail).
export function PanelActivityColumn({
  periods,
  returnPeriods,
  ...railProps
}: {
  periods: PeriodOption[];
  returnPeriods: ReactivationReturnStat[];
} & ReactivationRailProps) {
  const [days, setDays] = useState(periods[0]?.days);
  const currentReturn = returnPeriods.find((p) => p.days === days) ?? returnPeriods[0];

  return (
    <>
      <ApproachMetricsToggle periods={periods} onPeriodChange={setDays} />
      <ReactivationRail {...railProps} returnMetric={currentReturn} />
    </>
  );
}

"use client";

import { useState, type ReactNode } from "react";

// Seletor "15 dias (quinzenal)" / "30 dias (mensal)" do preview admin
// (pedido explícito, item 3) — mesmo princípio de Tabs.tsx: os DOIS
// conteúdos já vêm RENDERIZADOS NO SERVIDOR (ver relatorio-preview/page.tsx,
// que calcula os números das duas frequências de uma vez), este
// componente só alterna qual fica visível (`hidden`), sem nenhuma busca
// nova no cliente — evita ter que levar números/Datas através da
// fronteira server/client de novo a cada clique.
export function ClinicReportPeriodToggle({ monthly, biweekly }: { monthly: ReactNode; biweekly: ReactNode }) {
  const [frequency, setFrequency] = useState<"MONTHLY" | "BIWEEKLY">("MONTHLY");

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => setFrequency("BIWEEKLY")}
          className={`flex-1 rounded-control border px-control-x py-control-y text-xs font-medium transition ${
            frequency === "BIWEEKLY" ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent" : "border-vexo-border text-vexo-muted"
          }`}
        >
          15 dias (quinzenal)
        </button>
        <button
          type="button"
          onClick={() => setFrequency("MONTHLY")}
          className={`flex-1 rounded-control border px-control-x py-control-y text-xs font-medium transition ${
            frequency === "MONTHLY" ? "border-vexo-accent bg-vexo-accent/15 text-vexo-accent" : "border-vexo-border text-vexo-muted"
          }`}
        >
          30 dias (mensal)
        </button>
      </div>

      <div hidden={frequency !== "MONTHLY"}>{monthly}</div>
      <div hidden={frequency !== "BIWEEKLY"}>{biweekly}</div>
    </div>
  );
}

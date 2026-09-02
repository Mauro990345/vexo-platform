// Anel de progresso simples pra uma métrica de "parte de um todo" (taxa de
// resposta) — um valor único, então não é um caso de paleta categórica
// (só a cor de destaque + a trilha em vexo-border). rotate-90 deixa o
// início do arco no topo em vez de à direita (padrão de gráfico de "%").
export function ResponseRateRing({ value }: { value: number | null }) {
  const pct = value !== null ? Math.round(value * 100) : null;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = pct !== null ? circumference * (1 - Math.min(pct, 100) / 100) : circumference;

  return (
    <div className="flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90 shrink-0" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" strokeWidth="4" className="stroke-vexo-border" />
        {pct !== null && (
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="stroke-vexo-accent"
          />
        )}
      </svg>
      <p className="text-[1.75rem] font-semibold leading-none tracking-tight">{pct !== null ? `${pct}%` : "—"}</p>
    </div>
  );
}
